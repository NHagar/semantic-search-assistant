# Semantic Search Assistant API

This document describes the new structured API that replaces the previous sequential scripts workflow.

## Overview

The new API provides a clean, organized interface to all functionality through the `SemanticSearchAPI` class and convenience functions. Instead of running separate scripts in sequence, you can now use Python imports to access all features programmatically.

## Migration from Scripts

### Old Workflow (Sequential Scripts)
```bash
# 1. Extract and sample PDFs
python extract_and_sample_pdfs.py --token-budget 6500 --n-tokens 100 --data-dir data

# 2. Compress documents
python compress.py

# 3. Generate search plans
python plan.py

# 4. Execute searches
python search.py

# 5. Evaluate and synthesize
python evaluate_and_synthesize.py
```

### New Workflow (API)
```python
from src.api import SemanticSearchAPI

# Initialize API
api = SemanticSearchAPI()

# Run complete pipeline
final_report = api.full_research_pipeline(
    user_query="What do we know about LLM energy usage?",
    n_tokens=100,
    token_budget=6500
)
```

## Core Classes

### `SemanticSearchAPI`

Main API class that orchestrates the entire workflow.

**Initialization:**
```python
api = SemanticSearchAPI(
    openai_base_url="http://localhost:1234/v1",  # OpenAI-compatible API endpoint
    openai_api_key="lm_studio",                 # API key
    data_dir="data",                            # Directory with PDF/text files
    model="qwen/qwen3-14b"                      # Model name
)
```

**Key Methods:**

#### Document Processing
- `process_documents(n_tokens=100, token_budget=6500)` - Extract and sample text from PDFs
- `compress_documents(documents=None)` - Compress documents using LLM

#### Search & Planning  
- `generate_search_plans(user_query)` - Create search plans based on user question
- `execute_search_plans(search_plans=None)` - Execute searches using vector database
- `semantic_search(query, n_results=5)` - Direct semantic search

#### Analysis & Synthesis
- `evaluate_and_synthesize(user_query)` - Evaluate reports and create final synthesis
- `chat_with_documents(user_message)` - Interactive chat with document collection

#### Complete Pipeline
- `full_research_pipeline(user_query)` - Run entire workflow from start to finish

#### Utilities
- `get_database_stats()` - Get vector database statistics

## Convenience Functions

For quick operations without class initialization:

```python
from src.api import research_question, chat_with_docs, search_docs

# Quick research
report = research_question("What factors affect LLM energy usage?")

# Quick chat
answer = chat_with_docs("How much energy do LLMs consume?")

# Quick search
results = search_docs("carbon footprint machine learning", n_results=5)
```

## Usage Examples

### Example 1: Complete Research Pipeline
```python
from src.api import SemanticSearchAPI

api = SemanticSearchAPI()

# Research a complex question
final_report = api.full_research_pipeline(
    user_query="I want to understand LLM energy usage factors and perspectives",
    n_tokens=100,
    token_budget=6500,
    chunk_size=1024,
    overlap=20
)

print(final_report)
```

### Example 2: Step-by-Step Control
```python
from src.api import SemanticSearchAPI

api = SemanticSearchAPI()

# Step 1: Process documents
documents = api.process_documents(n_tokens=100, token_budget=6500)

# Step 2: Compress for overview
compressed = api.compress_documents(documents)

# Step 3: Generate targeted search plans
plans = api.generate_search_plans("What are the energy costs of training vs inference?")

# Step 4: Execute searches
reports = api.execute_search_plans(plans)

# Step 5: Get final synthesis
final_answer = api.evaluate_and_synthesize("What are the energy costs of training vs inference?")
```

### Example 3: Interactive Usage
```python
from src.api import SemanticSearchAPI

api = SemanticSearchAPI()

# Build database once
api.vector_db.build_database(chunk_size=1024, overlap=20)

# Interactive chat session
while True:
    question = input("Ask about the documents: ")
    if question.lower() == 'quit':
        break
    
    answer = api.chat_with_documents(question)
    print(f"Answer: {answer}\n")
```

### Example 4: Direct Search
```python
from src.api import search_docs

# Search without full pipeline
results = search_docs("energy efficiency neural networks", n_results=10)

for result in results:
    print(f"File: {result['filename']}")
    print(f"Similarity: {result['similarity']:.4f}")
    print(f"Content: {result['content'][:200]}...")
    print("-" * 50)
```

## Configuration

### OpenAI API Settings
The API uses OpenAI-compatible endpoints. Configure your local LLM server:

```python
api = SemanticSearchAPI(
    openai_base_url="http://localhost:1234/v1",  # Your LM Studio or similar endpoint
    openai_api_key="lm_studio",                 # API key (often not needed for local)
    model="qwen/qwen3-14b"                      # Model name available on your server
)
```

### Data Directory
Place your PDF files in the `data` directory or specify a custom path:

```python
api = SemanticSearchAPI(data_dir="/path/to/your/documents")
```

### Vector Database
The API automatically manages a ChromaDB vector database for semantic search. The database is built incrementally - only new documents are processed on subsequent runs.

## File Structure

After running the API, you'll find these generated files:

- `doc_report.txt` - Compressed document overview
- `search_plan_*.txt` - Generated search plans  
- `report_search_plan_*.txt` - Search execution reports
- `final_report.md` - Final synthesized research report
- `chroma_db/` - Vector database storage

## Error Handling

The API includes comprehensive error handling. Common issues:

1. **Missing prompts directory**: Ensure `prompts/` exists with required `.md` files
2. **No PDF files**: Check that `data/` directory contains `.pdf` files
3. **API connection**: Verify your OpenAI-compatible server is running
4. **Model name**: Ensure the specified model is available on your server

## Frontend Integration

The API is designed for easy frontend integration:

```python
from src.api import SemanticSearchAPI

# Initialize once
api = SemanticSearchAPI()

# Expose these methods to your frontend:
def api_search(query: str, max_results: int = 5):
    return api.semantic_search(query, n_results=max_results)

def api_chat(message: str):
    return api.chat_with_documents(message)

def api_research(question: str):
    return api.full_research_pipeline(user_query=question)

def api_stats():
    return api.get_database_stats()
```

This provides clean endpoints for:
- Semantic document search
- Interactive chat with documents  
- Full research pipeline execution
- Database statistics and health checks

The API maintains all the functionality of the original scripts while providing a much more structured and maintainable interface suitable for integration with web frontends, APIs, or other applications.