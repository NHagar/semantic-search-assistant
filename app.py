#!/usr/bin/env python3
"""
Flask web API for the semantic search assistant.
"""

from pathlib import Path
from typing import Optional

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.utils import secure_filename

from src.api import SemanticSearchAPI

app = Flask(__name__)
CORS(app)

# Global API instance - will be initialized on first use
api_instance: Optional[SemanticSearchAPI] = None


def get_api():
    """Get or create the API instance."""
    global api_instance
    if api_instance is None:
        api_instance = SemanticSearchAPI()
    return api_instance


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "message": "Semantic Search API is running"})


@app.route("/api/upload", methods=["POST"])
def upload_files():
    """Upload PDF files to the data directory."""
    if "files" not in request.files:
        return jsonify({"error": "No files provided"}), 400

    files = request.files.getlist("files")
    uploaded_files = []

    # Ensure data directory exists
    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)

    for file in files:
        if file.filename == "":
            continue

        if file and file.filename.lower().endswith(".pdf"):
            filename = secure_filename(file.filename)
            filepath = data_dir / filename
            file.save(str(filepath))
            uploaded_files.append(filename)

    return jsonify(
        {"message": f"Uploaded {len(uploaded_files)} files", "files": uploaded_files}
    )


@app.route("/api/process-documents", methods=["POST"])
def process_documents():
    """Process uploaded PDF documents."""
    data = request.get_json() or {}

    n_tokens = data.get("n_tokens", 100)
    token_budget = data.get("token_budget", 6500)

    try:
        api = get_api()
        result = api.process_documents(
            n_tokens=n_tokens,
            token_budget=token_budget,
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

    try:
        api = get_api()
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

    try:
        with open("doc_report.txt", "w") as f:
            f.write(data["description"])
        return jsonify({"message": "Description updated successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-description", methods=["GET"])
def get_description():
    """Get the current document corpus description."""
    try:
        if Path("doc_report.txt").exists():
            with open("doc_report.txt", "r") as f:
                content = f.read()
            return jsonify({"content": content})
        else:
            return jsonify({"content": ""})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/generate-search-plans", methods=["POST"])
def generate_search_plans():
    """Generate search plans based on user query."""
    data = request.get_json()
    if not data or "user_query" not in data:
        return jsonify({"error": "User query is required"}), 400

    try:
        api = get_api()
        plans = api.generate_search_plans(data["user_query"])
        return jsonify(
            {"message": "Search plans generated successfully", "plans": plans}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-search-plans", methods=["GET"])
def get_search_plans():
    """Get existing search plans."""
    try:
        plans = []
        plan_files = sorted(Path(".").glob("search_plan_*.txt"))

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

    try:
        plan_file = Path(f"{data['plan_id']}.txt")
        with open(plan_file, "w") as f:
            f.write(data["content"])
        return jsonify({"message": "Search plan updated successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/execute-search-plans", methods=["POST"])
def execute_search_plans():
    """Execute search plans and generate reports."""
    data = request.get_json() or {}
    chunk_size = data.get("chunk_size", 1024)
    overlap = data.get("overlap", 20)

    try:
        api = get_api()
        reports = api.execute_search_plans(chunk_size=chunk_size, overlap=overlap)
        return jsonify(
            {"message": f"Generated {len(reports)} reports", "reports": reports}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-reports", methods=["GET"])
def get_reports():
    """Get existing search reports."""
    try:
        reports = []
        report_files = sorted(Path(".").glob("report_search_plan_*.txt"))

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

    try:
        report_file = Path(f"{data['report_id']}.txt")
        with open(report_file, "w") as f:
            f.write(data["content"])
        return jsonify({"message": "Report updated successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/synthesize-final-report", methods=["POST"])
def synthesize_final_report():
    """Generate the final synthesized report."""
    data = request.get_json()
    if not data or "user_query" not in data:
        return jsonify({"error": "User query is required"}), 400

    try:
        api = get_api()
        final_report = api.evaluate_and_synthesize(data["user_query"])
        return jsonify(
            {"message": "Final report generated successfully", "content": final_report}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-final-report", methods=["GET"])
def get_final_report():
    """Get the final synthesized report."""
    try:
        if Path("final_report.md").exists():
            with open("final_report.md", "r") as f:
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

    try:
        with open("final_report.md", "w") as f:
            f.write(data["content"])
        return jsonify({"message": "Final report updated successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/database-stats", methods=["GET"])
def database_stats():
    """Get vector database statistics."""
    try:
        api = get_api()
        stats = api.get_database_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
