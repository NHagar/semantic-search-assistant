"""
Main API module for the semantic search assistant.

This module provides a clean, structured interface to all the functionality
previously available as sequential scripts.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from openai import OpenAI
from pydantic import BaseModel

from .extract_and_sample_pdfs import process_pdfs_and_sample
from .search import SearchAgent
from .vector_db import VectorDB


class SearchPlans(BaseModel):
    search_plans: List[str]


class Evaluation(BaseModel):
    is_relevant: bool
    relevance_rating_reason: str
    is_thorough: bool
    thorough_rating_reason: str


class SemanticSearchAPI:
    """
    Main API class that orchestrates the entire semantic search workflow.
    """

    def __init__(
        self,
        openai_base_url: str = "http://localhost:1234/v1",
        openai_api_key: str = "lm_studio",
        data_dir: str = "data",
        model: str = "qwen/qwen3-14b",
    ):
        """
        Initialize the semantic search API.

        Args:
            openai_base_url: Base URL for OpenAI-compatible API
            openai_api_key: API key for the service
            data_dir: Directory containing PDF/text documents
            model: Model name to use for LLM operations
        """
        self.client = OpenAI(base_url=openai_base_url, api_key=openai_api_key)
        self.data_dir = data_dir
        self.model = model
        self.vector_db = VectorDB(data_dir=data_dir)
        self.search_agent = None

    def process_documents(
        self,
        n_tokens: int = 100,
        token_budget: int = 6500,
        save_txt_files: bool = True,
        verbose: bool = True,
    ) -> str:
        """
        Extract and sample text from PDF documents.

        Args:
            n_tokens: Number of tokens to sample from each document
            token_budget: Total token budget for all documents
            save_txt_files: Whether to save extracted text as .txt files
            verbose: Whether to print progress messages

        Returns:
            Combined sampled text from all PDFs
        """
        return process_pdfs_and_sample(
            data_dir=self.data_dir,
            n_tokens=n_tokens,
            token_budget=token_budget,
            save_txt_files=save_txt_files,
            verbose=verbose,
        )

    def compress_documents(
        self,
        documents: Optional[str] = None,
        prompt_file: str = "prompts/compress.md",
        output_file: str = "doc_report.txt",
    ) -> str:
        """
        Compress documents using LLM.

        Args:
            documents: Text content to compress. If None, processes PDFs first.
            prompt_file: Path to compression prompt file
            output_file: Output file to save compressed content

        Returns:
            Compressed document content
        """
        if documents is None:
            documents = self.process_documents()

        with open(prompt_file, "r") as f:
            prompt = f.read()

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": documents},
            ],
        )

        result = response.choices[0].message.content

        with open(output_file, "w") as f:
            f.write(result)

        return result

    def generate_search_plans(
        self,
        user_query: str,
        doc_report_file: str = "doc_report.txt",
        prompt_file: str = "prompts/plan.md",
    ) -> List[str]:
        """
        Generate search plans based on user query and document report.

        Args:
            user_query: The user's research question
            doc_report_file: Path to document report file
            prompt_file: Path to planning prompt file

        Returns:
            List of search plan strings
        """
        with open(prompt_file, "r") as f:
            prompt = f.read()

        with open(doc_report_file, "r") as f:
            doc_report = f.read()

        deterministic_blob = """OUTPUT STRUCTURE:
- Objective: [Original search objective]
- Executive summary: [3-5 sentence summary of findings]
- Details: [Sections describing key details, each with their own header]
"""

        user_input = f"""<report>
{doc_report}
</report>

<user_query>
{user_query}
</user_query>
"""

        response = self.client.beta.chat.completions.parse(
            model=self.model,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_input},
            ],
            response_format=SearchPlans,
        )

        resp_object = response.choices[0].message.content
        resp_plans = json.loads(resp_object)
        resp_plans = SearchPlans(**resp_plans)

        # Save search plans to files
        for i, plan in enumerate(resp_plans.search_plans, start=1):
            with open(f"search_plan_{i}.txt", "w") as f:
                f.write(plan + "\n\n" + deterministic_blob)

        return resp_plans.search_plans

    def execute_search_plans(
        self,
        search_plans: Optional[List[str]] = None,
        chunk_size: int = 1024,
        overlap: int = 20,
    ) -> List[str]:
        """
        Execute search plans and generate reports.

        Args:
            search_plans: List of search plans. If None, loads from files.
            chunk_size: Chunk size for vector database
            overlap: Overlap size for chunking

        Returns:
            List of generated reports
        """
        if self.search_agent is None:
            self.search_agent = SearchAgent(self.vector_db, self.client)

        # Build vector database if needed
        self.vector_db.build_database(chunk_size=chunk_size, overlap=overlap)

        if search_plans is None:
            plan_files = sorted(Path(".").glob("search_plan_*.txt"))
        else:
            plan_files = []
            for i, plan in enumerate(search_plans, start=1):
                plan_file = Path(f"search_plan_{i}.txt")
                if not plan_file.exists():
                    with open(plan_file, "w") as f:
                        f.write(plan)
                plan_files.append(plan_file)

        reports = []
        for plan_file in plan_files:
            with open(plan_file, "r") as f:
                search_plan_text = f.read()

            report = self.search_agent.execute_search_plan(
                search_plan_text, model=self.model
            )

            # Save the report
            report_filename = f"report_{plan_file.stem}.txt"
            with open(report_filename, "w") as f:
                f.write(report)

            reports.append(report)

        return reports

    def evaluate_and_synthesize(
        self,
        user_query: str,
        evaluate_prompt_file: str = "prompts/evaluate.md",
        synthesize_prompt_file: str = "prompts/synthesize.md",
        output_file: str = "final_report.md",
    ) -> str:
        """
        Evaluate search reports and synthesize final answer.

        Args:
            user_query: The original user query
            evaluate_prompt_file: Path to evaluation prompt file
            synthesize_prompt_file: Path to synthesis prompt file
            output_file: Output file for final report

        Returns:
            Final synthesized report
        """
        with open(evaluate_prompt_file, "r") as f:
            evaluate_prompt = f.read()

        with open(synthesize_prompt_file, "r") as f:
            synthesize_prompt = f.read()

        # Load plans and reports
        plans = sorted(Path(".").glob("search_plan_*.txt"), key=lambda p: p.name)
        reports = sorted(
            Path(".").glob("report_search_plan_*.txt"), key=lambda p: p.name
        )

        if len(plans) != len(reports):
            raise ValueError("Number of plans and reports do not match.")

        passed_reports = []

        # Evaluate each report
        for plan, report in zip(plans, reports):
            with open(plan, "r") as f:
                plan_content = f.read()
            with open(report, "r") as f:
                report_content = f.read().split("</think>")
                if len(report_content) > 1:
                    report_content = (
                        report_content[1]
                        .split("=== SEARCH AGENT DEBUG LOG ===")[0]
                        .strip()
                    )
                else:
                    report_content = (
                        report_content[0]
                        .split("=== SEARCH AGENT DEBUG LOG ===")[0]
                        .strip()
                    )

            user_input = f"""<SEARCH PLAN>
{plan_content}
</SEARCH PLAN>

<REPORT>
{report_content}
</REPORT>
"""

            response = self.client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {"role": "system", "content": evaluate_prompt},
                    {"role": "user", "content": user_input},
                ],
                response_format=Evaluation,
            )

            report_evaluation = json.loads(response.choices[0].message.content)

            if report_evaluation["is_relevant"] and report_evaluation["is_thorough"]:
                passed_reports.append(report_content)

        # Synthesize final report
        user_input = f"""<USER REQUEST>
{user_query}
</USER REQUEST>

<SEARCH RESULTS>
{"".join(f"<RESULT>{report}</RESULT>" for report in passed_reports)}
</SEARCH RESULTS>
"""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": synthesize_prompt},
                {"role": "user", "content": user_input},
            ],
        )

        final_report = response.choices[0].message.content

        with open(output_file, "w") as f:
            f.write(final_report)

        return final_report

    def full_research_pipeline(
        self,
        user_query: str,
        n_tokens: int = 100,
        token_budget: int = 6500,
        chunk_size: int = 1024,
        overlap: int = 20,
    ) -> str:
        """
        Execute the complete research pipeline from start to finish.

        Args:
            user_query: The research question to investigate
            n_tokens: Number of tokens to sample from each document
            token_budget: Total token budget for document processing
            chunk_size: Chunk size for vector database
            overlap: Overlap size for chunking

        Returns:
            Final synthesized research report
        """
        print("Step 1: Processing documents...")
        self.process_documents(n_tokens=n_tokens, token_budget=token_budget)

        print("Step 2: Compressing documents...")
        self.compress_documents()

        print("Step 3: Generating search plans...")
        search_plans = self.generate_search_plans(user_query)

        print("Step 4: Executing search plans...")
        self.execute_search_plans(chunk_size=chunk_size, overlap=overlap)

        print("Step 5: Evaluating and synthesizing results...")
        final_report = self.evaluate_and_synthesize(user_query)

        print("Research pipeline complete!")
        return final_report

    def chat_with_documents(self, user_message: str) -> str:
        """
        Chat with the document collection using the search agent.

        Args:
            user_message: User's question or request

        Returns:
            AI assistant's response based on document search
        """
        if self.search_agent is None:
            self.search_agent = SearchAgent(self.vector_db, self.client)

        return self.search_agent.chat(user_message, model=self.model)

    def semantic_search(self, query: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """
        Perform semantic search on the document collection.

        Args:
            query: Search query
            n_results: Maximum number of results to return

        Returns:
            List of search results with metadata
        """
        return self.vector_db.semantic_search(query, n_results=n_results)

    def get_database_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the vector database.

        Returns:
            Dictionary with database statistics
        """
        return self.vector_db.get_collection_stats()


# Convenience functions for backward compatibility and ease of use
def create_api(
    openai_base_url: str = "http://localhost:1234/v1",
    openai_api_key: str = "lm_studio",
    data_dir: str = "data",
    model: str = "qwen/qwen3-14b",
) -> SemanticSearchAPI:
    """Create and return a SemanticSearchAPI instance."""
    return SemanticSearchAPI(
        openai_base_url=openai_base_url,
        openai_api_key=openai_api_key,
        data_dir=data_dir,
        model=model,
    )


def research_question(
    query: str, n_tokens: int = 100, token_budget: int = 6500, **kwargs
) -> str:
    """
    Quick function to research a question using the full pipeline.

    Args:
        query: The research question
        n_tokens: Number of tokens to sample from each document
        token_budget: Total token budget for document processing
        **kwargs: Additional arguments passed to create_api()

    Returns:
        Final research report
    """
    api = create_api(**kwargs)
    return api.full_research_pipeline(
        user_query=query, n_tokens=n_tokens, token_budget=token_budget
    )


def chat_with_docs(message: str, **kwargs) -> str:
    """
    Quick function to chat with the document collection.

    Args:
        message: User's message/question
        **kwargs: Additional arguments passed to create_api()

    Returns:
        AI assistant's response
    """
    api = create_api(**kwargs)
    return api.chat_with_documents(message)


def search_docs(query: str, n_results: int = 5, **kwargs) -> List[Dict[str, Any]]:
    """
    Quick function to search the document collection.

    Args:
        query: Search query
        n_results: Maximum number of results
        **kwargs: Additional arguments passed to create_api()

    Returns:
        List of search results
    """
    api = create_api(**kwargs)
    return api.semantic_search(query, n_results=n_results)
