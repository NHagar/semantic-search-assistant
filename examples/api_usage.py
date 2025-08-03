#!/usr/bin/env python3
"""
Example usage of the Semantic Search API.

This script demonstrates how to use the new structured API instead of
the previous sequential scripts.
"""

import sys
from pathlib import Path

# Add parent directory to Python path so we can import src
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.api import SemanticSearchAPI, research_question, chat_with_docs, search_docs


def main():
    """Demonstrate various API usage patterns."""
    
    print("=== Semantic Search API Examples ===\n")
    
    # Example 1: Using the convenience function for quick research
    print("1. Quick Research Question:")
    print("-" * 40)
    
    user_query = "I want to understand what we know about LLM energy usage. It seems like a complicated topic with a lot of ambiguity, so I'd like to see what factors are relevant and what perspectives are out there."
    
    try:
        # This runs the full pipeline
        final_report = research_question(
            query=user_query,
            n_tokens=100,
            token_budget=6500
        )
        print(f"Final report saved! Length: {len(final_report)} characters")
    except Exception as e:
        print(f"Error in research pipeline: {e}")
    
    print("\n" + "="*60 + "\n")
    
    # Example 2: Using the main API class for step-by-step control
    print("2. Step-by-step API Usage:")
    print("-" * 40)
    
    # Initialize API
    api = SemanticSearchAPI(
        openai_base_url="http://localhost:1234/v1",
        openai_api_key="lm_studio",
        data_dir="data",
        model="qwen/qwen3-14b"
    )
    
    try:
        # Step 1: Process documents
        print("Processing documents...")
        documents = api.process_documents(n_tokens=100, token_budget=6500)
        print(f"Processed {len(documents)} characters of text")
        
        # Step 2: Get database stats
        stats = api.get_database_stats()
        print(f"Database: {stats['total_chunks']} chunks from {stats['unique_files']} files")
        
        # Step 3: Try semantic search
        search_results = api.semantic_search("energy consumption", n_results=3)
        print(f"Found {len(search_results)} search results")
        
        # Step 4: Chat with documents
        response = api.chat_with_documents("What are the main factors affecting LLM energy usage?")
        print(f"Chat response: {response[:200]}...")
        
    except Exception as e:
        print(f"Error in step-by-step usage: {e}")
    
    print("\n" + "="*60 + "\n")
    
    # Example 3: Using convenience functions
    print("3. Convenience Functions:")
    print("-" * 40)
    
    try:
        # Quick search
        results = search_docs("machine learning carbon footprint", n_results=2)
        print(f"Quick search found {len(results)} results")
        
        # Quick chat
        answer = chat_with_docs("How much energy do large language models consume?")
        print(f"Quick chat response: {answer[:150]}...")
        
    except Exception as e:
        print(f"Error in convenience functions: {e}")
    
    print("\n=== Examples Complete ===")


if __name__ == "__main__":
    main()