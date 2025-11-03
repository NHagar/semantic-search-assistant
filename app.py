#!/usr/bin/env python3
"""
Flask web API for the semantic search assistant.
"""

import traceback
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.utils import secure_filename

from src.api import SemanticSearchAPI

app = Flask(__name__)
CORS(app)

# Global API instances - will be created as needed per LLM/corpus combination
api_instances: dict = {}


def get_api(llm: str = "qwen/qwen3-14b", corpus_name: str = ""):
    """Get or create the API instance for specific LLM and corpus."""
    # Use defaults if empty strings are provided
    if not llm or llm.strip() == "":
        llm = "qwen/qwen3-14b"
    if not corpus_name or corpus_name.strip() == "":
        corpus_name = "default"
        
    key = f"{llm}|{corpus_name}"
    if key not in api_instances:
        print(f"Creating API instance with LLM: {llm}, Corpus: {corpus_name}")
        api_instances[key] = SemanticSearchAPI(model=llm, corpus_name=corpus_name)
    return api_instances[key]


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "message": "Semantic Search API is running"})


@app.route("/api/available-models", methods=["GET"])
def get_available_models():
    """Get list of available models from LM Studio."""
    try:
        import requests
        # Try to fetch from LM Studio
        response = requests.get("http://localhost:1234/v1/models", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if "data" in data and isinstance(data["data"], list):
                models = [model["id"] for model in data["data"]]
                return jsonify({"models": models})

        # Fallback if LM Studio is not responding properly
        return jsonify({"models": [], "error": "Could not fetch models from LM Studio"})
    except Exception as e:
        # Return empty list with error message if LM Studio is not available
        return jsonify({"models": [], "error": str(e)})


@app.route("/api/existing-combinations", methods=["GET"])
def get_existing_combinations():
    """Get list of existing model-corpus combinations from project structure."""
    try:
        from src.project_manager import ProjectManager

        combinations = []
        projects_dir = Path("projects")

        if not projects_dir.exists():
            return jsonify({"combinations": []})

        for project_dir in projects_dir.iterdir():
            if not project_dir.is_dir():
                continue

            # Read metadata file if it exists
            metadata_file = project_dir / "metadata.json"
            if metadata_file.exists():
                import json
                with open(metadata_file) as f:
                    metadata = json.load(f)
                corpus_name = metadata.get("corpus_name", "")
                model_name = metadata.get("model_name", "")
            else:
                # Parse from directory name
                dir_name = project_dir.name
                parts = dir_name.split("_", 1)
                if len(parts) < 2:
                    continue
                corpus_name = parts[0]
                model_name = parts[1].replace("_", "/")

            # Skip invalid projects (empty corpus or model name)
            if not corpus_name or not model_name:
                continue

            # Use ProjectManager to get project info
            pm = ProjectManager(corpus_name, model_name)
            if pm.project_dir.exists():
                info = pm.get_project_info()
                # Get document count from vector DB or working files
                doc_count = info.get("document_count", 0)

                combinations.append({
                    "corpus_name": corpus_name,
                    "model_name": model_name,
                    "display_name": f"{corpus_name} ({model_name})",
                    "stages": info["stages"],
                    "has_vector_db": info["has_vector_db"],
                    "file_count": doc_count,
                    "last_modified": info["last_modified"]
                })

        # Sort by last modified time, newest first
        combinations.sort(key=lambda x: x["last_modified"], reverse=True)

        return jsonify({"combinations": combinations})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/upload", methods=["POST"])
def upload_files():
    """Upload PDF files to the project-specific working directory."""
    if "files" not in request.files:
        return jsonify({"error": "No files provided"}), 400

    # Get project parameters
    llm = request.form.get("llm", "qwen/qwen3-14b")
    corpus_name = request.form.get("corpus_name", "")

    if not corpus_name:
        return jsonify({"error": "corpus_name is required"}), 400

    files = request.files.getlist("files")
    uploaded_files = []
    skipped_files = []

    # Get API instance (which has ProjectManager)
    api = get_api(llm, corpus_name)
    upload_dir = Path(api.pdfs_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    for file in files:
        if not file.filename:
            continue

        if file and file.filename and file.filename.lower().endswith(".pdf"):
            # Use the unified sanitization function
            from src.project_manager import sanitize_filename
            filename = sanitize_filename(file.filename)
            filepath = upload_dir / filename

            # Check if file already exists
            if filepath.exists():
                skipped_files.append(filename)
                continue

            file.save(str(filepath))
            uploaded_files.append(filename)

    message_parts = []
    if uploaded_files:
        message_parts.append(f"Uploaded {len(uploaded_files)} files")
    if skipped_files:
        message_parts.append(f"Skipped {len(skipped_files)} existing files")

    message = ", ".join(message_parts) if message_parts else "No new files to upload"

    return jsonify(
        {
            "message": message,
            "files": uploaded_files,
            "skipped": skipped_files
        }
    )


@app.route("/api/save-extracted-texts", methods=["POST"])
def save_extracted_texts():
    """Save extracted and potentially edited text from PDFs to txt files and re-embed them."""
    data = request.get_json() or {}
    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")
    document_texts = data.get("document_texts", {})
    chunk_size = data.get("chunk_size", 1024)
    overlap = data.get("overlap", 20)

    if not corpus_name:
        return jsonify({"error": "corpus_name is required"}), 400

    if not document_texts:
        return jsonify({"error": "document_texts is required"}), 400

    try:
        print(f"[save-extracted-texts] LLM: {llm}, Corpus: {corpus_name}")
        print(f"[save-extracted-texts] Received {len(document_texts)} documents")

        # Get API instance to access the project directory
        api = get_api(llm=llm, corpus_name=corpus_name)
        print(f"[save-extracted-texts] API instance data_dir: {api.data_dir}")

        txt_dir = Path(api.data_dir)
        txt_dir.mkdir(parents=True, exist_ok=True)
        print(f"[save-extracted-texts] Created directory: {txt_dir}")

        saved_files = []
        reembedded_files = []

        # Save each document's text to a .txt file
        for pdf_filename, text_content in document_texts.items():
            print(f"[save-extracted-texts] Processing: {pdf_filename}")
            # Convert PDF filename to txt filename
            txt_filename = Path(pdf_filename).stem + ".txt"
            txt_filepath = txt_dir / txt_filename

            # Write the text content
            with open(txt_filepath, "w", encoding="utf-8") as f:
                f.write(text_content)

            saved_files.append(txt_filename)
            print(f"[save-extracted-texts] Saved: {txt_filepath}")

            # Re-embed the document if it was already in the vector database
            if api.vector_db.is_document_processed(txt_filename):
                print(f"[save-extracted-texts] Re-embedding: {txt_filename}")
                success = api.vector_db.reembed_document(
                    txt_filename, chunk_size=chunk_size, overlap=overlap
                )
                if success:
                    reembedded_files.append(txt_filename)
                else:
                    print(f"[save-extracted-texts] Failed to re-embed: {txt_filename}")

        message_parts = [f"Saved {len(saved_files)} text files"]
        if reembedded_files:
            message_parts.append(f"re-embedded {len(reembedded_files)} documents")

        print(f"[save-extracted-texts] Successfully saved {len(saved_files)} files")
        if reembedded_files:
            print(f"[save-extracted-texts] Re-embedded {len(reembedded_files)} documents")

        return jsonify({
            "message": ", ".join(message_parts),
            "files": saved_files,
            "reembedded": reembedded_files
        })
    except Exception as e:
        print(f"[save-extracted-texts] ERROR: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/extract-documents", methods=["POST"])
def extract_documents():
    """Extract text from PDF documents to txt files and build vector database."""
    data = request.get_json() or {}
    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")
    chunk_size = data.get("chunk_size", 1024)
    overlap = data.get("overlap", 20)

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        result = api.extract_documents(verbose=False, chunk_size=chunk_size, overlap=overlap)
        return jsonify(
            {"message": "Documents extracted and vector database built successfully", "files": result}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sample-documents", methods=["POST"])
def sample_documents():
    """Sample tokens from existing txt files."""
    data = request.get_json() or {}
    n_tokens = data.get("n_tokens", 100)
    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        result = api.sample_documents(n_tokens=n_tokens, verbose=False)
        return jsonify(
            {"message": "Documents sampled successfully", "content": result}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/process-documents", methods=["POST"])
def process_documents():
    """Process uploaded PDF documents."""
    data = request.get_json() or {}

    n_tokens = data.get("n_tokens", 100)
    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        result = api.process_documents(
            n_tokens=n_tokens,
            save_txt_files=True,
            verbose=False,
        )
        return jsonify(
            {"message": "Documents processed successfully", "content": result}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/compress-documents", methods=["POST"])
def compress_documents():
    """Generate document corpus description."""
    data = request.get_json() or {}
    documents = data.get("documents")
    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        result = api.compress_documents(documents=documents)
        return jsonify(
            {"message": "Documents compressed successfully", "content": result}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/update-description", methods=["POST"])
def update_description():
    """Update the document corpus description."""
    data = request.get_json()
    if not data or "description" not in data:
        return jsonify({"error": "Description is required"}), 400

    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        doc_report_file = api._get_output_dir() / "doc_report.txt"
        with open(doc_report_file, "w") as f:
            f.write(data["description"])
        return jsonify({"message": "Description updated successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-description", methods=["GET"])
def get_description():
    """Get the current document corpus description."""
    llm = request.args.get("llm", "qwen/qwen3-14b")
    corpus_name = request.args.get("corpus_name", "")
    
    print(f"GET /api/get-description - LLM: '{llm}', Corpus: '{corpus_name}'")
    
    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        doc_report_file = api._get_output_dir() / "doc_report.txt"
        print(f"Looking for file at: {doc_report_file}")
        
        if doc_report_file.exists():
            with open(doc_report_file, "r") as f:
                content = f.read()
            return jsonify({"content": content})
        else:
            return jsonify({"content": ""})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/generate-search-plans", methods=["POST"])
def generate_search_plans():
    """Generate comprehensive search plans based on document corpus."""
    data = request.get_json() or {}

    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        plans = api.generate_search_plans()
        return jsonify(
            {"message": "Search plans generated successfully", "plans": plans}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-search-plans", methods=["GET"])
def get_search_plans():
    """Get existing search plans."""
    llm = request.args.get("llm", "qwen/qwen3-14b")
    corpus_name = request.args.get("corpus_name", "")
    
    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        output_dir = api._get_output_dir()
        plans = []
        plan_files = sorted(output_dir.glob("search_plan_*.txt"))

        for plan_file in plan_files:
            with open(plan_file, "r") as f:
                content = f.read()
            plans.append(
                {"id": plan_file.stem, "filename": plan_file.name, "content": content}
            )

        return jsonify({"plans": plans})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/update-search-plan", methods=["POST"])
def update_search_plan():
    """Update a specific search plan."""
    data = request.get_json()
    if not data or "plan_id" not in data or "content" not in data:
        return jsonify({"error": "Plan ID and content are required"}), 400

    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        plan_file = api._get_output_dir() / f"{data['plan_id']}.txt"
        with open(plan_file, "w") as f:
            f.write(data["content"])
        return jsonify({"message": "Search plan updated successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/execute-search-plans", methods=["POST"])
def execute_search_plans():
    """Execute search plans and generate reports."""
    data = request.get_json() or {}
    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        reports = api.execute_search_plans()
        return jsonify(
            {"message": f"Generated {len(reports)} reports", "reports": reports}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-reports", methods=["GET"])
def get_reports():
    """Get existing search reports."""
    llm = request.args.get("llm", "qwen/qwen3-14b")
    corpus_name = request.args.get("corpus_name", "")
    
    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        output_dir = api._get_output_dir()
        reports = []
        report_files = sorted(output_dir.glob("report_search_plan_*.txt"))

        for report_file in report_files:
            with open(report_file, "r") as f:
                content = f.read()
            reports.append(
                {
                    "id": report_file.stem,
                    "filename": report_file.name,
                    "content": content,
                }
            )

        return jsonify({"reports": reports})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/update-report", methods=["POST"])
def update_report():
    """Update a specific report."""
    data = request.get_json()
    if not data or "report_id" not in data or "content" not in data:
        return jsonify({"error": "Report ID and content are required"}), 400

    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        report_file = api._get_output_dir() / f"{data['report_id']}.txt"
        with open(report_file, "w") as f:
            f.write(data["content"])
        return jsonify({"message": "Report updated successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/regenerate-report", methods=["POST"])
def regenerate_report():
    """Regenerate a specific report from its search plan."""
    data = request.get_json()
    if not data or "report_id" not in data:
        return jsonify({"error": "Report ID is required"}), 400

    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")
    report_id = data["report_id"]

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        output_dir = api._get_output_dir()
        
        # Find the corresponding search plan file
        # report_id format: "report_search_plan_X"
        # search plan format: "search_plan_X"
        plan_number = report_id.replace("report_search_plan_", "")
        plan_file = output_dir / f"search_plan_{plan_number}.txt"
        
        if not plan_file.exists():
            return jsonify({"error": f"Search plan file not found: {plan_file.name}"}), 404
        
        # Read the search plan
        with open(plan_file, "r") as f:
            search_plan_text = f.read()
        
        # Initialize search agent if needed
        if api.search_agent is None:
            from src.search import SearchAgent
            api.search_agent = SearchAgent(api.vector_db, api.client, build_db=False)
        
        # Execute the search plan to regenerate the report
        new_report = api.search_agent.execute_search_plan(search_plan_text, model=llm)
        
        # Save the regenerated report
        report_file = output_dir / f"{report_id}.txt"
        with open(report_file, "w") as f:
            f.write(new_report)
        
        return jsonify({
            "message": "Report regenerated successfully",
            "content": new_report
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/synthesize-final-report", methods=["POST"])
def synthesize_final_report():
    """Generate the final synthesized report."""
    data = request.get_json()
    if not data or "user_query" not in data:
        return jsonify({"error": "User query is required"}), 400

    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        final_report = api.evaluate_and_synthesize(data["user_query"])
        return jsonify(
            {"message": "Final report generated successfully", "content": final_report}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-final-report", methods=["GET"])
def get_final_report():
    """Get the final synthesized report."""
    llm = request.args.get("llm", "qwen/qwen3-14b")
    corpus_name = request.args.get("corpus_name", "")
    
    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        final_report_file = api._get_output_dir() / "final_report.md"
        if final_report_file.exists():
            with open(final_report_file, "r") as f:
                content = f.read()
            return jsonify({"content": content})
        else:
            return jsonify({"content": ""})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/update-final-report", methods=["POST"])
def update_final_report():
    """Update the final synthesized report."""
    data = request.get_json()
    if not data or "content" not in data:
        return jsonify({"error": "Content is required"}), 400

    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        final_report_file = api._get_output_dir() / "final_report.md"
        with open(final_report_file, "w") as f:
            f.write(data["content"])
        return jsonify({"message": "Final report updated successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/build-vector-database", methods=["POST"])
def build_vector_database():
    """Build or update the vector database."""
    data = request.get_json() or {}
    chunk_size = data.get("chunk_size", 1024)
    overlap = data.get("overlap", 20)
    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        stats = api.build_vector_database(chunk_size=chunk_size, overlap=overlap)
        return jsonify(
            {"message": "Vector database built successfully", "stats": stats}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/database-stats", methods=["GET"])
def database_stats():
    """Get vector database statistics."""
    llm = request.args.get("llm", "qwen/qwen3-14b")
    corpus_name = request.args.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        stats = api.get_database_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/cleanup-working-files", methods=["POST"])
def cleanup_working_files():
    """Clean up temporary working files after processing is complete."""
    data = request.get_json() or {}
    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")

    if not corpus_name:
        return jsonify({"error": "corpus_name is required"}), 400

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        api.cleanup_working_files()
        return jsonify({"message": "Working files cleaned up successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-embedded-documents", methods=["GET"])
def get_embedded_documents():
    """Get all documents from the vector database."""
    llm = request.args.get("llm", "qwen/qwen3-14b")
    corpus_name = request.args.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        documents = api.get_all_embedded_documents()
        return jsonify({"documents": documents})
    except Exception as e:
        print(f"[get-embedded-documents] ERROR: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-uploaded-documents", methods=["GET"])
def get_uploaded_documents():
    """Get all uploaded PDF documents for a project."""
    llm = request.args.get("llm", "qwen/qwen3-14b")
    corpus_name = request.args.get("corpus_name", "")

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        documents = api.get_uploaded_documents()
        return jsonify({"documents": documents})
    except Exception as e:
        print(f"[get-uploaded-documents] ERROR: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/delete-embedded-document", methods=["POST"])
def delete_embedded_document():
    """Delete a document from the vector database and its source files."""
    data = request.get_json() or {}
    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")
    filename = data.get("filename", "")
    delete_source_files = data.get("delete_source_files", True)

    if not filename:
        return jsonify({"error": "filename is required"}), 400

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        success = api.delete_embedded_document(filename, delete_source_files=delete_source_files)

        if success:
            return jsonify({"message": f"Deleted document: {filename}"})
        else:
            return jsonify({"error": f"Document not found: {filename}"}), 404
    except Exception as e:
        print(f"[delete-embedded-document] ERROR: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/delete-uploaded-document", methods=["POST"])
def delete_uploaded_document():
    """Delete an uploaded PDF that has not been embedded yet."""
    data = request.get_json() or {}
    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data.get("corpus_name", "")
    filename = data.get("filename", "")

    if not filename:
        return jsonify({"error": "filename is required"}), 400

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        success = api.delete_uploaded_document(filename)

        if success:
            return jsonify({"message": f"Deleted uploaded document: {filename}"})
        else:
            return jsonify({"error": f"Uploaded document not found: {filename}"}), 404
    except Exception as e:
        print(f"[delete-uploaded-document] ERROR: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/create-project", methods=["POST"])
def create_project():
    """Create a new project."""
    data = request.get_json()
    if not data or "corpus_name" not in data or "llm" not in data:
        return jsonify({"error": "corpus_name and llm are required"}), 400

    llm = data["llm"]
    corpus_name = data["corpus_name"]

    try:
        from src.project_manager import ProjectManager

        # Create project directories and metadata
        pm = ProjectManager(corpus_name, llm)
        pm.ensure_directories()
        ProjectManager.create_metadata_file(corpus_name, llm)

        # Get project info to return
        info = pm.get_project_info()

        return jsonify({
            "message": f"Project '{corpus_name}' created successfully",
            "project": {
                "corpus_name": corpus_name,
                "model_name": llm,
                "display_name": f"{corpus_name} ({llm})",
                "stages": info["stages"],
                "file_count": 0,
                "last_modified": info["last_modified"]
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/delete-project", methods=["POST"])
def delete_project():
    """Delete an entire project and all its files."""
    data = request.get_json()
    if not data or "corpus_name" not in data:
        return jsonify({"error": "corpus_name is required"}), 400

    llm = data.get("llm", "qwen/qwen3-14b")
    corpus_name = data["corpus_name"]

    try:
        from src.project_manager import ProjectManager

        # Delete from new structure
        pm = ProjectManager(corpus_name, llm)
        if pm.project_dir.exists():
            pm.delete_project()

        # Also clean up from api_instances cache
        key = f"{llm}|{corpus_name}"
        if key in api_instances:
            del api_instances[key]

        return jsonify({"message": f"Project '{corpus_name}' deleted successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/citation-source/<citation_key>", methods=["GET"])
def get_citation_source(citation_key):
    """Get the source material for a specific citation key."""
    llm = request.args.get("llm", "qwen/qwen3-14b")
    corpus_name = request.args.get("corpus_name", "")

    if not citation_key:
        return jsonify({"error": "citation_key is required"}), 400

    try:
        api = get_api(llm=llm, corpus_name=corpus_name)
        citation_source = api.get_citation_source(citation_key)

        if citation_source:
            return jsonify(citation_source)
        else:
            return jsonify({"error": f"Citation not found: {citation_key}"}), 404
    except Exception as e:
        print(f"[get-citation-source] ERROR: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5001)
