#!/usr/bin/env python3
"""
Script to extract text from PDF files, sample tokens, and output to a single file.
"""

import argparse
import sys
from pathlib import Path

import PyPDF2
import tiktoken


def extract_text_from_pdf(pdf_path):
    """Extract text from a PDF file."""
    try:
        with open(pdf_path, "rb") as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
            return text
    except Exception as e:
        print(f"Error extracting text from {pdf_path}: {e}", file=sys.stderr)
        return ""


def count_tokens(text, encoding_name="cl100k_base"):
    """Count tokens in text using tiktoken."""
    encoding = tiktoken.get_encoding(encoding_name)
    return len(encoding.encode(text))


def sample_tokens(text, n_tokens, encoding_name="cl100k_base"):
    """Sample the first n tokens from text."""
    encoding = tiktoken.get_encoding(encoding_name)
    tokens = encoding.encode(text)
    if len(tokens) <= n_tokens:
        return text
    sampled_tokens = tokens[:n_tokens]
    return encoding.decode(sampled_tokens)


def main():
    parser = argparse.ArgumentParser(description="Extract and sample text from PDFs")
    parser.add_argument(
        "--token-budget",
        type=int,
        required=True,
        help="Total token budget for all documents",
    )
    parser.add_argument(
        "--n-tokens",
        type=int,
        required=True,
        help="Number of tokens to sample from each document",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default="data",
        help="Directory containing PDF files (default: data)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="sampled_texts.txt",
        help="Output file name (default: sampled_texts.txt)",
    )

    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f"Error: Directory {data_dir} does not exist")
        return 1

    # Find all PDF files
    pdf_files = list(data_dir.glob("*.pdf"))
    print(f"Found {len(pdf_files)} PDF files")

    if len(pdf_files) == 0:
        print("No PDF files found in the data directory")
        return 1

    # Check if token budget is sufficient
    total_tokens_needed = len(pdf_files) * args.n_tokens
    if total_tokens_needed > args.token_budget:
        print(
            f"Warning: Total tokens needed ({total_tokens_needed}) exceeds budget ({args.token_budget})"
        )
        print("Consider reducing n-tokens or increasing token budget")

    # Process each PDF
    results = []
    total_tokens_used = 0

    for pdf_file in sorted(pdf_files):
        print(f"Processing {pdf_file.name}...")

        # Extract text
        text = extract_text_from_pdf(pdf_file)
        if not text.strip():
            print(f"Warning: No text extracted from {pdf_file.name}")
            continue

        # Save as txt file
        txt_file = pdf_file.with_suffix(".txt")
        with open(txt_file, "w", encoding="utf-8") as f:
            f.write(text)

        # Sample tokens
        sampled_text = sample_tokens(text, args.n_tokens)
        tokens_used = count_tokens(sampled_text)
        total_tokens_used += tokens_used

        results.append(
            {
                "filename": pdf_file.name,
                "sampled_text": sampled_text,
                "tokens_used": tokens_used,
            }
        )

        # Check if we're exceeding the token budget
        if total_tokens_used > args.token_budget:
            print(f"Token budget exceeded after processing {pdf_file.name}")
            break

    # Write combined output
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(f"# Sampled Text from {len(results)} PDF Files\n")
        for result in results:
            f.write(f"## FILE: {result['filename']}\n")
            f.write("## " "\n")
            f.write(result["sampled_text"])
            f.write("\n##" + "\n\n")

    print("\nProcessing complete!")
    print(f"Processed {len(results)} files")
    print(f"Total tokens used: {total_tokens_used}")
    print(f"Output written to: {args.output}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
