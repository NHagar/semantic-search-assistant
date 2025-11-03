"""
Main API module for the semantic search assistant.

This module provides a clean, structured interface to all the functionality
previously available as sequential scripts.
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from openai import OpenAI
from pydantic import BaseModel, ValidationError
from src.project_manager import sanitize_filename

from .extract_and_sample_pdfs import (
    extract_pdfs_to_txt,
    process_pdfs_and_sample,
    sample_from_txt_files,
)
from .project_manager import ProjectManager
from .search import SearchAgent
from .vector_db import VectorDB


class SearchPlans(BaseModel):
    search_plans: List[str]


class Evaluation(BaseModel):
    is_relevant: bool
    relevance_rating_reason: str
    is_thorough: bool
    thorough_rating_reason: str


def _pydantic_schema_for_openai(model_cls: type[BaseModel]) -> dict:
    """
    Pydantic v2 emits a valid JSON Schema. We add a conservative guard
    to forbid extra keys so LM Studio (and other servers) stay strict.
    """
    schema = model_cls.model_json_schema()
    schema.setdefault("additionalProperties", False)
    return schema


def _strip_fences(s: str) -> str:
    # Just in case a model wraps the JSON in ```json ... ```
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s.strip(), flags=re.IGNORECASE)
    return s.strip()


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
        corpus_name: str = "",
    ):
        """
        Initialize the semantic search API.

        Args:
            openai_base_url: Base URL for OpenAI-compatible API
            openai_api_key: API key for the service
            data_dir: Directory containing PDF/text documents (legacy, will be deprecated)
            model: Model name to use for LLM operations
            corpus_name: Name of the document corpus (used for organizing outputs)
        """
        self.client = OpenAI(base_url=openai_base_url, api_key=openai_api_key)
        self.model = model
        self.corpus_name = corpus_name if corpus_name else "default"

        # Initialize ProjectManager for new architecture
        self.project_manager = ProjectManager(self.corpus_name, model)

        # Don't automatically create directories - let endpoints do it when needed
        # This prevents creating empty "default" projects
        # self.project_manager.ensure_directories()

        # Use project-specific directories
        self.data_dir = str(self.project_manager.txt_dir)  # For txt files
        self.pdfs_dir = str(self.project_manager.pdfs_dir)  # For PDFs

        # Initialize VectorDB with ProjectManager
        self.vector_db = VectorDB(
            corpus_name=self.corpus_name,
            model_name=model,
            project_manager=self.project_manager
        )
        self.search_agent = None

    def _get_output_dir(self) -> Path:
        """Get the output directory path based on corpus name and model."""
        return self.project_manager.outputs_dir

    def cleanup_working_files(self) -> None:
        """Clean up temporary working files after processing is complete."""
        self.project_manager.cleanup_working_directory()

    def extract_documents(self, verbose: bool = True, chunk_size: int = 1024, overlap: int = 20) -> List[Dict[str, Any]]:
        """
        Extract text from PDF documents to txt files and build vector database.

        Args:
            verbose: Whether to print progress messages
            chunk_size: Chunk size for vector database
            overlap: Overlap size for chunking

        Returns:
            List of extracted file metadata
        """
        # Extract PDFs from pdfs_dir to txt_dir
        result = extract_pdfs_to_txt(
            data_dir=self.pdfs_dir,
            output_dir=self.data_dir,  # txt_dir
            verbose=verbose
        )

        # Build/update vector database after extraction
        if verbose:
            print("Building vector database...")
        self.vector_db.build_database(chunk_size=chunk_size, overlap=overlap)

        return result

    def sample_documents(
        self,
        n_tokens: int = 100,
        verbose: bool = True,
    ) -> str:
        """
        Sample tokens from existing txt files.

        Args:
            n_tokens: Number of tokens to sample from each document
            verbose: Whether to print progress messages

        Returns:
            Combined sampled text from all txt files
        """
        from pathlib import Path

        # Count txt files to calculate token budget automatically
        data_path = Path(self.data_dir)
        txt_files = list(data_path.glob("*.txt")) if data_path.exists() else []
        token_budget = len(txt_files) * n_tokens + 100  # Add 100 token buffer

        return sample_from_txt_files(
            data_dir=self.data_dir,
            n_tokens=n_tokens,
            token_budget=token_budget,
            verbose=verbose,
        )

    def process_documents(
        self,
        n_tokens: int = 100,
        save_txt_files: bool = True,
        verbose: bool = True,
    ) -> str:
        """
        Extract and sample text from PDF documents.

        Args:
            n_tokens: Number of tokens to sample from each document
            save_txt_files: Whether to save extracted text as .txt files
            verbose: Whether to print progress messages

        Returns:
            Combined sampled text from all PDFs
        """
        from pathlib import Path

        # Count PDF files to calculate token budget automatically
        data_path = Path(self.pdfs_dir)
        pdf_files = list(data_path.glob("*.pdf")) if data_path.exists() else []
        token_budget = len(pdf_files) * n_tokens + 100  # Add 100 token buffer

        return process_pdfs_and_sample(
            data_dir=self.pdfs_dir,
            n_tokens=n_tokens,
            token_budget=token_budget,
            save_txt_files=save_txt_files,
            verbose=verbose,
        )

    def compress_documents(
        self,
        documents: Optional[str] = None,
        prompt_file: str = "prompts/compress.md",
        output_file: Optional[str] = None,
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
            documents = self.sample_documents()

        if output_file is None:
            output_file_path = self._get_output_dir() / "doc_report.txt"
        else:
            output_file_path = self._get_output_dir() / output_file

        with open(prompt_file, "r") as f:
            prompt = f.read()

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": documents},
            ],
            timeout=1_800,
        )

        result = response.choices[0].message.content
        if result is None:
            raise ValueError("Received empty response from LLM")

        with open(output_file_path, "w") as f:
            f.write(result)

        return result

    def generate_search_plans(
        self,
        doc_report_file: Optional[str] = None,
        prompt_file: str = "prompts/plan.md",
        max_retries: int = 3,
    ) -> List[str]:
        """
        Generate comprehensive search plans based on document corpus analysis.

        Args:
            doc_report_file: Path to document report file
            prompt_file: Path to planning prompt file
            max_retries: Maximum number of retry attempts

        Returns:
            List of search plan strings
        """
        if doc_report_file is None:
            doc_report_file = str(self._get_output_dir() / "doc_report.txt")

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
"""

        last_error = None
        for attempt in range(max_retries):
            try:
                print(
                    f"Generating search plans (attempt {attempt + 1}/{max_retries})..."
                )

                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": user_input},
                    ],
                    temperature=0.7
                    if attempt > 0
                    else 0.3,  # Increase creativity on retries
                )

                resp_object = response.choices[0].message.content
                if resp_object is None:
                    raise ValueError("Received empty response from LLM")
                resp_object_nothink = resp_object.split("</think>")[-1].strip()
                resp_plans = resp_object_nothink.split("**SEARCH PLAN")
                resp_plans = [f"**SEARCH PLAN {i}" for i in resp_plans if i.strip()]

                print(f"Successfully generated {len(resp_plans)} search plans")

                # Save search plans to files
                output_dir = self._get_output_dir()
                for i, plan in enumerate(resp_plans, start=1):
                    plan_file = output_dir / f"search_plan_{i}.txt"
                    with open(plan_file, "w") as f:
                        f.write(plan + "\n\n" + deterministic_blob)

                return resp_plans

            except Exception as e:
                last_error = e
                print(f"Attempt {attempt + 1} failed: {str(e)}")
                if attempt < max_retries - 1:
                    print("Retrying with adjusted parameters...")
                    continue
                else:
                    print("All attempts failed")

        # If we get here, all retries failed
        raise Exception(
            f"Failed to generate valid search plans after {max_retries} attempts. Last error: {str(last_error)}"
        )

    def execute_search_plans(
        self,
        search_plans: Optional[List[str]] = None,
    ) -> List[str]:
        """
        Execute search plans and generate reports.

        Args:
            search_plans: List of search plans. If None, loads from files.

        Returns:
            List of generated reports
        """
        if self.search_agent is None:
            # Create search agent without triggering DB build
            self.search_agent = SearchAgent(self.vector_db, self.client, build_db=False)

        output_dir = self._get_output_dir()

        if search_plans is None:
            plan_files = sorted(output_dir.glob("search_plan_*.txt"))
        else:
            plan_files = []
            for i, plan in enumerate(search_plans, start=1):
                plan_file = output_dir / f"search_plan_{i}.txt"
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
            report_filename = output_dir / f"report_{plan_file.stem}.txt"
            with open(report_filename, "w") as f:
                f.write(report)

            reports.append(report)

        return reports

    def evaluate_and_synthesize(
        self,
        user_query: str,
        evaluate_prompt_file: str = "prompts/evaluate.md",
        synthesize_prompt_file: str = "prompts/synthesize.md",
        output_file: Optional[str] = None,
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

        output_dir = self._get_output_dir()

        # Load plans and reports
        plans = sorted(output_dir.glob("search_plan_*.txt"), key=lambda p: p.name)
        reports = sorted(
            output_dir.glob("report_search_plan_*.txt"), key=lambda p: p.name
        )

        if len(plans) != len(reports):
            raise ValueError(
                f"Number of plans ({len(plans)}) and reports ({len(reports)}) do not match."
            )

        passed_reports: List[str] = []
        sanitized_reports: List[str] = []

        # Evaluate each report
        for plan, report in zip(plans, reports):
            with open(plan, "r") as f:
                plan_content = f.read()
            with open(report, "r") as f:
                report_sections = f.read().split("</think>")
                if len(report_sections) > 1:
                    report_content = (
                        report_sections[1]
                        .split("=== SEARCH AGENT DEBUG LOG ===")[0]
                        .strip()
                    )
                else:
                    report_content = (
                        report_sections[0]
                        .split("=== SEARCH AGENT DEBUG LOG ===")[0]
                        .strip()
                    )
            sanitized_reports.append(report_content)

            user_input = f"""<SEARCH PLAN>
{plan_content}
</SEARCH PLAN>

<REPORT>
{report_content}
</REPORT>
"""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": evaluate_prompt},
                    {"role": "user", "content": user_input},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "Evaluation",
                        "schema": _pydantic_schema_for_openai(Evaluation),
                        "strict": True,
                    },
                },
            )

            content = response.choices[0].message.content
            if content is None:
                print(
                    "[evaluate_and_synthesize] Warning: Empty response from LLM during "
                    "evaluation; skipping report."
                )
                continue

            cleaned_content = _strip_fences(content)
            try:
                data = json.loads(cleaned_content)
            except json.JSONDecodeError as exc:
                print(
                    "[evaluate_and_synthesize] Warning: Could not decode evaluation "
                    f"response as JSON: {exc}. Raw content: {cleaned_content!r}"
                )
                continue

            try:
                report_evaluation: Evaluation = Evaluation.model_validate(data)
            except ValidationError as exc:
                print(
                    "[evaluate_and_synthesize] Warning: Evaluation response failed "
                    f"validation: {exc}. Raw content: {cleaned_content!r}"
                )
                continue

            if report_evaluation.is_relevant and report_evaluation.is_thorough:
                passed_reports.append(report_content)

        if not passed_reports:
            print(
                "[evaluate_and_synthesize] Warning: No reports passed evaluation; "
                "falling back to using all available reports for synthesis."
            )
            passed_reports = sanitized_reports

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

        if not response.choices:
            raise ValueError("Received no choices from LLM during synthesis")

        final_report = response.choices[0].message.content
        if final_report is None:
            raise ValueError("Received empty response from LLM during synthesis")

        if output_file is None:
            output_file_path = output_dir / "final_report.md"
        else:
            output_file_path = output_dir / output_file

        with open(output_file_path, "w") as f:
            f.write(final_report)

        return final_report

    def full_research_pipeline(
        self,
        n_tokens: int = 100,
        chunk_size: int = 1024,
        overlap: int = 20,
        synthesis_query: str = "Provide a comprehensive analysis of the document corpus",
    ) -> str:
        """
        Execute the complete research pipeline from start to finish.

        Args:
            n_tokens: Number of tokens to sample from each document
            chunk_size: Chunk size for vector database
            overlap: Overlap size for chunking
            synthesis_query: Query to use for final synthesis (optional)

        Returns:
            Final synthesized research report
        """
        print("Step 1: Processing documents...")
        self.process_documents(n_tokens=n_tokens)

        print("Step 2: Compressing documents...")
        self.compress_documents()

        print("Step 3: Generating comprehensive search plans...")
        self.generate_search_plans()

        print("Step 4: Executing search plans...")
        self.execute_search_plans()

        print("Step 5: Evaluating and synthesizing results...")
        final_report = self.evaluate_and_synthesize(synthesis_query)

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
            self.search_agent = SearchAgent(self.vector_db, self.client, build_db=False)

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

    def get_citation_source(self, citation_key: str) -> Optional[Dict[str, Any]]:
        """
        Get the source material for a specific citation key.

        Args:
            citation_key: Citation key in format "hash:chunk_id" (e.g., "7aa4eb:1")

        Returns:
            Dictionary with citation source information or None if not found
        """
        return self.vector_db.get_citation_source(citation_key)

    def get_all_embedded_documents(self) -> List[Dict[str, Any]]:
        """Get all documents from the vector database with their reconstructed text."""
        return self.vector_db.get_all_documents()

    def get_uploaded_documents(self) -> List[Dict[str, Any]]:
        """List uploaded PDF documents that may not have been embedded yet."""
        documents: List[Dict[str, Any]] = []
        for pdf_path in self.project_manager.list_pdfs():
            stats = pdf_path.stat()
            documents.append(
                {
                    "filename": pdf_path.name,
                    "size": stats.st_size,
                    "uploaded_at": datetime.fromtimestamp(stats.st_mtime).isoformat(),
                }
            )
        return documents

    def delete_uploaded_document(self, filename: str) -> bool:
        """Remove an uploaded PDF and any associated extracted text."""
        if not filename:
            return False

        sanitized_filename = sanitize_filename(filename)
        if not sanitized_filename:
            return False

        if not sanitized_filename.lower().endswith(".pdf"):
            sanitized_filename = f"{sanitized_filename}.pdf"

        available_pdfs = {pdf_path.name for pdf_path in self.project_manager.list_pdfs()}
        if sanitized_filename not in available_pdfs:
            return False

        pdf_path = (self.project_manager.pdfs_dir / sanitized_filename).resolve()
        pdfs_dir = self.project_manager.pdfs_dir.resolve()
        if pdfs_dir not in pdf_path.parents:
            return False

        deleted = self.project_manager.delete_pdf(sanitized_filename)

        # Also delete any extracted text that may exist for this file
        txt_filename = sanitized_filename.replace(".pdf", ".txt")
        self.project_manager.delete_txt(txt_filename)

        return deleted

    def delete_embedded_document(self, filename: str, delete_source_files: bool = True) -> bool:
        """Delete a document from the vector database and optionally remove source files.

        Args:
            filename: The filename to delete
            delete_source_files: If True, also delete the .txt and PDF source files

        Returns:
            True if successful, False otherwise
        """
        return self.vector_db.delete_document(filename, delete_source_files=delete_source_files)

    def build_vector_database(self, chunk_size: int = 1024, overlap: int = 20) -> Dict[str, Any]:
        """
        Build or update the vector database from existing txt files.

        Args:
            chunk_size: Chunk size for vector database
            overlap: Overlap size for chunking

        Returns:
            Dictionary with database statistics after building
        """
        self.vector_db.build_database(chunk_size=chunk_size, overlap=overlap)
        return self.vector_db.get_collection_stats()

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
    corpus_name: str = "",
) -> SemanticSearchAPI:
    """Create and return a SemanticSearchAPI instance."""
    return SemanticSearchAPI(
        openai_base_url=openai_base_url,
        openai_api_key=openai_api_key,
        data_dir=data_dir,
        model=model,
        corpus_name=corpus_name,
    )


def research_corpus(
    n_tokens: int = 100,
    synthesis_query: str = "Provide a comprehensive analysis of the document corpus",
    **kwargs,
) -> str:
    """
    Quick function to research a document corpus using the full pipeline.

    Args:
        n_tokens: Number of tokens to sample from each document
        synthesis_query: Query to use for final synthesis
        **kwargs: Additional arguments passed to create_api()

    Returns:
        Final research report
    """
    api = create_api(**kwargs)
    return api.full_research_pipeline(
        n_tokens=n_tokens, synthesis_query=synthesis_query
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
