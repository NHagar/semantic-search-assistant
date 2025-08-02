import json
import re
from pathlib import Path
from typing import Any, Dict, List

from openai import OpenAI

from vector_db import VectorDB

# Initialize components
search_plans = list(Path(".").glob("search_plan_*.txt"))
client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm_studio")
db = VectorDB()
with open("prompts/search.md", "r") as f:
    search_prompt = f.read()


class VectorSearchTool:
    """LLM-compatible tool for searching the vector database."""

    def __init__(self, vector_db: VectorDB):
        self.db = vector_db

    def get_tool_schema(self) -> Dict[str, Any]:
        """Return the OpenAI function calling schema for this tool."""
        return {
            "type": "function",
            "function": {
                "name": "search_documents",
                "description": "Search through the document collection using semantic search. Use this to find relevant information about AI energy usage, climate impact, and related topics.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query to find relevant documents. Be specific about what information you're looking for.",
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of results to return (default: 5, max: 20)",
                            "minimum": 1,
                            "maximum": 20,
                            "default": 5,
                        },
                    },
                    "required": ["query"],
                },
            },
        }

    def search_documents(self, query: str, max_results: int = 5) -> Dict[str, Any]:
        """
        Search the document collection for relevant information.

        Args:
            query: The search query string
            max_results: Maximum number of results to return

        Returns:
            Dictionary with search results and metadata
        """
        try:
            # Ensure max_results is within bounds
            max_results = max(1, min(max_results, 20))

            # Perform the search
            results = self.db.semantic_search(query, n_results=max_results)

            if not results:
                return {
                    "success": False,
                    "message": "No relevant documents found for the query.",
                    "query": query,
                    "results": [],
                }

            # Format results for LLM consumption
            formatted_results = []
            for i, result in enumerate(results, 1):
                formatted_results.append(
                    {
                        "rank": i,
                        "filename": result["filename"],
                        "chunk_id": result["chunk_id"],
                        "similarity_score": f"{result.get('similarity', 0):.4f}",
                        "content": result["content"],
                        "content_length": len(result["content"]),
                    }
                )

            return {
                "success": True,
                "query": query,
                "total_results": len(formatted_results),
                "results": formatted_results,
            }

        except Exception as e:
            return {
                "success": False,
                "message": f"Search error: {str(e)}",
                "query": query,
                "results": [],
            }

    def __call__(self, **kwargs) -> str:
        """Make the tool callable for function calling interface."""
        query = kwargs.get("query", "")
        max_results = kwargs.get("max_results", 5)

        if not query:
            return json.dumps(
                {"success": False, "message": "Query parameter is required"}
            )

        result = self.search_documents(query, max_results)
        return json.dumps(result, indent=2)


class SearchPlan:
    """Represents a search plan with objective and queries."""

    def __init__(self, file_path: Path):
        self.file_path = file_path
        self.content = file_path.read_text()
        self.parse_plan()

    def parse_plan(self):
        """Parse the search plan file to extract components."""
        lines = self.content.split("\n")

        # Extract objective
        self.objective = ""
        for line in lines:
            if line.startswith("OBJECTIVE:"):
                self.objective = line.replace("OBJECTIVE:", "").strip()
                break

        # Extract sub-objectives
        self.sub_objectives = []
        in_sub_objectives = False
        for line in lines:
            if line.startswith("SPECIFIC SUB-OBJECTIVES"):
                in_sub_objectives = True
                continue
            elif line.startswith("SUGGESTED QUERIES"):
                in_sub_objectives = False
                continue
            elif in_sub_objectives and line.strip() and line[0].isdigit():
                self.sub_objectives.append(line.strip())

        # Extract suggested queries
        self.suggested_queries = []
        for line in lines:
            if line.startswith("SUGGESTED QUERIES:"):
                # Extract queries from the line - they're in quotes
                query_text = line.replace("SUGGESTED QUERIES:", "").strip()
                # Find all text in quotes
                queries = re.findall(r'"([^"]*)"', query_text)
                self.suggested_queries = queries
                break


class SearchAgent:
    """Agent that autonomously executes search plans using the vector search tool."""

    def __init__(self, vector_db: VectorDB, openai_client: OpenAI):
        self.db = vector_db
        self.client = openai_client
        self.search_tool = VectorSearchTool(vector_db)

        # Build/update database on initialization
        print("Initializing vector database...")
        self.db.build_database(chunk_size=1024, overlap=20)

    def get_available_tools(self) -> List[Dict[str, Any]]:
        """Get list of available tools for function calling."""
        return [self.search_tool.get_tool_schema()]

    def parse_qwen_tool_calls(self, content: str) -> List[Dict[str, Any]]:
        """Parse qwen 3's tool call format from content."""
        tool_calls = []

        # Find all <tool_call> blocks
        pattern = r"<tool_call>(.*?)</tool_call>"
        matches = re.findall(pattern, content, re.DOTALL)

        for i, match in enumerate(matches):
            try:
                # Parse the JSON inside the tool_call tags
                tool_data = json.loads(match.strip())

                # Create a tool call object compatible with our execute method
                tool_call = type(
                    "ToolCall",
                    (),
                    {
                        "id": f"qwen_call_{i}",
                        "function": type(
                            "Function",
                            (),
                            {
                                "name": tool_data.get("name", ""),
                                "arguments": json.dumps(tool_data.get("arguments", {})),
                            },
                        )(),
                    },
                )()

                tool_calls.append(tool_call)

            except json.JSONDecodeError:
                # Skip invalid JSON
                continue

        return tool_calls

    def execute_tool_call(self, tool_call) -> str:
        """Execute a tool call and return the result."""
        if tool_call.function.name == "search_documents":
            try:
                args = json.loads(tool_call.function.arguments)
                return self.search_tool(**args)
            except json.JSONDecodeError as e:
                return json.dumps(
                    {"success": False, "message": f"Invalid arguments: {str(e)}"}
                )
        else:
            return json.dumps(
                {
                    "success": False,
                    "message": f"Unknown tool: {tool_call.function.name}",
                }
            )

    def execute_search_plan(
        self, search_plan: str, model: str = "qwen/qwen3-14b"
    ) -> str:
        """
        Execute a search plan autonomously and generate a report.

        Args:
            search_plan: The SearchPlan object to execute
            model: The model to use for research and report generation

        Returns:
            The generated report in the specified output structure
        """
        # Initialize debug log for tool calls
        debug_log = []
        debug_log.append("=== SEARCH AGENT DEBUG LOG ===")
        debug_log.append(f"Model: {model}")
        debug_log.append("Max iterations: 15")
        debug_log.append("")
        system_prompt = search_prompt

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": search_plan},
        ]

        tools = self.get_available_tools()
        max_iterations = 15  # Allow enough iterations for thorough research

        try:
            for iteration in range(max_iterations):
                print(f"  Iteration {iteration + 1}/{max_iterations}")

                response = self.client.chat.completions.create(
                    model=model, messages=messages, tools=tools, tool_choice="auto"
                )

                assistant_message = response.choices[0].message

                # Log the full assistant response for debugging
                debug_log.append(
                    f"--- Iteration {iteration + 1}: Assistant Response ---"
                )
                debug_log.append(f"Content: {assistant_message.content}")
                debug_log.append("")

                # Handle tool calls - check both OpenAI format and qwen 3 format
                tool_calls_to_execute = []

                if assistant_message.tool_calls:
                    # OpenAI format tool calls
                    tool_calls_to_execute = assistant_message.tool_calls
                    print(
                        f"    Making {len(tool_calls_to_execute)} OpenAI tool call(s)"
                    )
                    debug_log.append(
                        f"Tool calls detected: {len(tool_calls_to_execute)} (OpenAI format)"
                    )

                    # Add assistant message with tool calls
                    messages.append(
                        {
                            "role": "assistant",
                            "content": assistant_message.content,
                            "tool_calls": [
                                {
                                    "id": tc.id,
                                    "type": tc.type,
                                    "function": {
                                        "name": tc.function.name,
                                        "arguments": tc.function.arguments,
                                    },
                                }
                                for tc in assistant_message.tool_calls
                            ],
                        }
                    )
                elif (
                    assistant_message.content
                    and "<tool_call>" in assistant_message.content
                ):
                    # qwen 3 format tool calls
                    tool_calls_to_execute = self.parse_qwen_tool_calls(
                        assistant_message.content
                    )
                    print(f"    Making {len(tool_calls_to_execute)} qwen tool call(s)")
                    debug_log.append(
                        f"Tool calls detected: {len(tool_calls_to_execute)} (qwen format)"
                    )

                    # Add assistant message for qwen format
                    messages.append(
                        {"role": "assistant", "content": assistant_message.content}
                    )

                if tool_calls_to_execute:
                    for i, tool_call in enumerate(tool_calls_to_execute, 1):
                        # Log tool call input
                        debug_log.append(f"Tool Call {i}:")
                        debug_log.append(f"  Function: {tool_call.function.name}")
                        debug_log.append(f"  Arguments: {tool_call.function.arguments}")

                        # Execute tool call
                        tool_result = self.execute_tool_call(tool_call)

                        # Log tool call output
                        debug_log.append(f"  Result: {tool_result}")
                        debug_log.append("")

                        messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tool_call.id,
                                "content": tool_result,
                            }
                        )

                else:
                    # No more tool calls, return the final response
                    print("  Research complete, generating final report")

                    final_content = assistant_message.content or "No response generated"
                    debug_section = "\n".join(debug_log)

                    return f"{final_content}\n\n{debug_section}"

            # If we hit max iterations, ask for final report
            print("  Max iterations reached, requesting final report")
            debug_log.append("--- Max Iterations Reached ---")
            debug_log.append("Requesting final report...")
            debug_log.append("")

            final_response = self.client.chat.completions.create(
                model=model,
                messages=messages
                + [
                    {
                        "role": "user",
                        "content": "Please provide your final report now in the required output structure.",
                    }
                ],
            )

            debug_log.append("=== FINAL REPORT ===")
            debug_log.append("")

            final_content = (
                final_response.choices[0].message.content
                or "No final response generated"
            )
            debug_section = "\n".join(debug_log)

            return f"{final_content}\n\n{debug_section}"

        except Exception as e:
            debug_log.append("--- ERROR OCCURRED ---")
            debug_log.append(f"Error: {str(e)}")
            debug_section = "\n".join(debug_log)

            return f"Error executing search plan: {str(e)}\n\n{debug_section}"

    def chat(self, user_message: str, model: str = "qwen/qwen3-14b") -> str:
        """
        Chat with the agent, which can use tools to search documents.

        Args:
            user_message: The user's question or request
            model: The model to use for chat

        Returns:
            The agent's response
        """
        messages = [
            {
                "role": "system",
                "content": """You are a research assistant with access to a large collection of documents about AI energy usage, climate impact, and related topics. 

When users ask questions, use the search_documents tool to find relevant information from the document collection. Always search for information before answering questions.

Guidelines:
- Use specific, relevant search queries
- Search multiple times with different queries if needed to gather comprehensive information
- Cite the source documents in your responses (filename and chunk_id)
- Provide detailed, well-researched answers based on the document content
- If you can't find relevant information, say so clearly""",
            },
            {"role": "user", "content": user_message},
        ]

        tools = self.get_available_tools()

        try:
            response = self.client.chat.completions.create(
                model=model, messages=messages, tools=tools, tool_choice="auto"
            )

            assistant_message = response.choices[0].message

            # Handle tool calls - check both OpenAI format and qwen 3 format
            tool_calls_to_execute = []

            if assistant_message.tool_calls:
                # OpenAI format tool calls
                tool_calls_to_execute = assistant_message.tool_calls
                messages.append(assistant_message)
            elif (
                assistant_message.content and "<tool_call>" in assistant_message.content
            ):
                # qwen 3 format tool calls
                tool_calls_to_execute = self.parse_qwen_tool_calls(
                    assistant_message.content
                )
                messages.append(
                    {"role": "assistant", "content": assistant_message.content}
                )

            if tool_calls_to_execute:
                for tool_call in tool_calls_to_execute:
                    tool_result = self.execute_tool_call(tool_call)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": tool_result,
                        }
                    )

                # Get final response after tool execution
                final_response = self.client.chat.completions.create(
                    model=model, messages=messages
                )

                return final_response.choices[0].message.content
            else:
                return assistant_message.content

        except Exception as e:
            return f"Error: {str(e)}"


def execute_all_search_plans():
    """Execute all available search plans and save reports."""
    agent = SearchAgent(db, client)

    print(f"Found {len(search_plans)} search plan files")

    for plan_file in search_plans:
        print(f"\n{'=' * 60}")
        print(f"Executing search plan: {plan_file.name}")
        print(f"{'=' * 60}")

        try:
            # Parse the search plan
            search_plan = SearchPlan(plan_file)
            with open(plan_file, "r") as f:
                search_plan_text = f.read()

            print(f"Objective: {search_plan.objective}")
            print(f"Sub-objectives: {len(search_plan.sub_objectives)}")
            print(f"Suggested queries: {len(search_plan.suggested_queries)}")

            # Execute the search plan
            print("\nExecuting search plan...")
            report = agent.execute_search_plan(search_plan_text, model="qwen/qwen3-14b")

            # Save the report
            report_filename = f"report_{plan_file.stem}.txt"
            with open(report_filename, "w") as f:
                f.write(report)

            print(f"\nReport saved to: {report_filename}")
            print(f"Report length: {len(report)} characters")

        except Exception as e:
            print(f"Error processing {plan_file.name}: {str(e)}")
            continue


def main():
    """Execute all search plans autonomously."""
    execute_all_search_plans()


if __name__ == "__main__":
    main()
