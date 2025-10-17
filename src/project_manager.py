"""
Project directory management for the semantic search assistant.

This module provides a clean interface for managing project-specific directories
and file operations, ensuring proper isolation between projects.
"""

from pathlib import Path
import shutil
from typing import Dict, List, Optional


def sanitize_name(name: str) -> str:
    """Convert a name to a safe directory name."""
    return "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in name)


class ProjectManager:
    """
    Manages the directory structure for a specific project (corpus + model combination).

    Structure:
        projects/{corpus}_{model}/
            ├── working/              # Temporary processing directory
            │   ├── pdfs/            # Uploaded PDFs (cleared after processing)
            │   └── txt/             # Extracted text (cleared after processing)
            ├── chroma_db/           # Project-specific vector database
            └── outputs/             # Generated outputs (plans, reports, etc.)
    """

    def __init__(self, corpus_name: str, model_name: str, base_dir: str = "projects"):
        """
        Initialize project manager for a specific corpus and model.

        Args:
            corpus_name: Name of the document corpus
            model_name: Name of the LLM model
            base_dir: Base directory for all projects (default: "projects")
        """
        self.corpus_name = corpus_name if corpus_name else "default"
        self.model_name = model_name
        self.base_dir = Path(base_dir)

        # Create safe directory names
        safe_corpus = sanitize_name(self.corpus_name)
        safe_model = sanitize_name(self.model_name)

        # Project root directory
        self.project_dir = self.base_dir / f"{safe_corpus}_{safe_model}"

        # Working directories (temporary)
        self.working_dir = self.project_dir / "working"
        self.pdfs_dir = self.working_dir / "pdfs"
        self.txt_dir = self.working_dir / "txt"

        # Permanent directories
        self.chroma_db_dir = self.project_dir / "chroma_db"
        self.outputs_dir = self.project_dir / "outputs"

    def ensure_directories(self) -> None:
        """Create all necessary project directories."""
        self.pdfs_dir.mkdir(parents=True, exist_ok=True)
        self.txt_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_db_dir.mkdir(parents=True, exist_ok=True)
        self.outputs_dir.mkdir(parents=True, exist_ok=True)

    def get_pdf_path(self, filename: str) -> Path:
        """Get the full path for a PDF file."""
        return self.pdfs_dir / filename

    def get_txt_path(self, filename: str) -> Path:
        """Get the full path for a txt file."""
        return self.txt_dir / filename

    def get_output_path(self, filename: str) -> Path:
        """Get the full path for an output file."""
        return self.outputs_dir / filename

    def list_pdfs(self) -> List[Path]:
        """List all PDF files in the working directory."""
        if not self.pdfs_dir.exists():
            return []
        return sorted(self.pdfs_dir.glob("*.pdf"))

    def list_txt_files(self) -> List[Path]:
        """List all txt files in the working directory."""
        if not self.txt_dir.exists():
            return []
        return sorted(self.txt_dir.glob("*.txt"))

    def list_outputs(self) -> List[Path]:
        """List all output files."""
        if not self.outputs_dir.exists():
            return []
        return sorted(self.outputs_dir.glob("*"))

    def get_document_count(self) -> int:
        """Get the number of source documents (PDFs or txt files)."""
        pdf_count = len(self.list_pdfs())
        if pdf_count > 0:
            return pdf_count
        return len(self.list_txt_files())

    def cleanup_working_directory(self) -> None:
        """
        Remove the entire working directory and its contents.
        This should be called after documents are successfully processed into the vector DB.
        """
        if self.working_dir.exists():
            shutil.rmtree(self.working_dir)
            print(f"Cleaned up working directory: {self.working_dir}")

    def has_vector_db(self) -> bool:
        """Check if the project has a vector database."""
        return self.chroma_db_dir.exists() and any(self.chroma_db_dir.iterdir())

    def get_stages_status(self) -> Dict[str, bool]:
        """
        Check which stages of the workflow are complete.

        Returns:
            Dict with keys: description, plans, reports, final
        """
        return {
            "description": (self.outputs_dir / "doc_report.txt").exists(),
            "plans": len(list(self.outputs_dir.glob("search_plan_*.txt"))) > 0,
            "reports": len(list(self.outputs_dir.glob("report_search_plan_*.txt"))) > 0,
            "final": (self.outputs_dir / "final_report.md").exists()
        }

    def delete_project(self) -> None:
        """
        Delete the entire project directory and all its contents.
        Use with caution!
        """
        if self.project_dir.exists():
            shutil.rmtree(self.project_dir)
            print(f"Deleted project: {self.project_dir}")

    def get_project_info(self) -> Dict:
        """
        Get comprehensive information about the project.

        Returns:
            Dictionary with project metadata
        """
        stages = self.get_stages_status()
        outputs = self.list_outputs()

        # Get last modified time
        last_modified = 0
        if outputs:
            last_modified = max(f.stat().st_mtime for f in outputs)

        return {
            "corpus_name": self.corpus_name,
            "model_name": self.model_name,
            "project_dir": str(self.project_dir),
            "has_vector_db": self.has_vector_db(),
            "document_count": self.get_document_count(),
            "stages": stages,
            "last_modified": last_modified,
            "exists": self.project_dir.exists()
        }

    @staticmethod
    def list_all_projects(base_dir: str = "projects") -> List[Dict]:
        """
        List all existing projects in the base directory.

        Args:
            base_dir: Base directory containing all projects

        Returns:
            List of project info dictionaries
        """
        projects = []
        base_path = Path(base_dir)

        if not base_path.exists():
            return projects

        for project_dir in base_path.iterdir():
            if not project_dir.is_dir():
                continue

            # Parse directory name: {corpus}_{model}
            dir_name = project_dir.name
            parts = dir_name.split("_", 1)

            if len(parts) < 2:
                continue

            # Try to reconstruct corpus and model names
            # For now, we'll use the directory name as-is
            # A more robust solution would store metadata in a file
            corpus_name = parts[0]
            model_name = parts[1].replace("_", "/")  # Convert back from safe name

            try:
                pm = ProjectManager(corpus_name, model_name, base_dir)
                info = pm.get_project_info()
                projects.append(info)
            except Exception as e:
                print(f"Error reading project {dir_name}: {e}")

        return projects

    @staticmethod
    def create_metadata_file(corpus_name: str, model_name: str, base_dir: str = "projects") -> None:
        """
        Create a metadata file to store original corpus and model names.
        This helps with reconstruction when names contain special characters.
        """
        pm = ProjectManager(corpus_name, model_name, base_dir)
        pm.ensure_directories()

        metadata = {
            "corpus_name": corpus_name,
            "model_name": model_name
        }

        metadata_path = pm.project_dir / "metadata.json"
        import json
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)
