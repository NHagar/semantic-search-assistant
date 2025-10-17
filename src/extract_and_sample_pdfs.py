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


def extract_pdfs_to_txt(data_dir, output_dir=None, verbose=True):
    """
    Extract text from PDFs and save as txt files (no token sampling).

    Args:
        data_dir: Path to directory containing PDF files
        output_dir: Path to directory for output txt files (defaults to same as data_dir)
        verbose: Whether to print progress messages

    Returns:
        list: List of extracted files with metadata
    """
    data_dir = Path(data_dir)
    output_dir = Path(output_dir) if output_dir else data_dir

    if not data_dir.exists():
        if verbose:
            print(f"Error: Directory {data_dir} does not exist")
        return []

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    # Find all PDF files
    pdf_files = list(data_dir.glob("*.pdf"))
    if verbose:
        print(f"Found {len(pdf_files)} PDF files")

    if len(pdf_files) == 0:
        if verbose:
            print("No PDF files found in the data directory")
        return []

    # Process each PDF
    results = []

    for pdf_file in sorted(pdf_files):
        # Output txt file in the output directory
        txt_file = output_dir / pdf_file.with_suffix(".txt").name

        # Check if txt file already exists
        if txt_file.exists():
            if verbose:
                print(f"Skipping {pdf_file.name} - txt file already exists")

            # Read existing txt file to get stats
            with open(txt_file, "r", encoding="utf-8") as f:
                text = f.read()
        else:
            if verbose:
                print(f"Extracting text from {pdf_file.name}...")

            # Extract text
            text = extract_text_from_pdf(pdf_file)
            if not text.strip():
                if verbose:
                    print(f"Warning: No text extracted from {pdf_file.name}")
                continue

            # Save as txt file
            with open(txt_file, "w", encoding="utf-8") as f:
                f.write(text)

        # Get token count for stats
        token_count = count_tokens(text)

        results.append(
            {
                "filename": pdf_file.name,
                "txt_filename": txt_file.name,
                "token_count": token_count,
                "extracted": not txt_file.exists(),
            }
        )

    if verbose:
        print(f"\nExtraction complete!")
        print(f"Processed {len(results)} files")
        total_tokens = sum(r["token_count"] for r in results)
        print(f"Total tokens available: {total_tokens}")

    return results


def sample_from_txt_files(data_dir, n_tokens, token_budget=None, verbose=True):
    """
    Sample tokens from existing txt files.

    Args:
        data_dir: Path to directory containing txt files
        n_tokens: Number of tokens to sample from each document
        token_budget: Optional total token budget limit
        verbose: Whether to print progress messages

    Returns:
        str: Combined sampled text from all txt files
    """
    data_dir = Path(data_dir)
    if not data_dir.exists():
        if verbose:
            print(f"Error: Directory {data_dir} does not exist")
        return ""

    # Find all txt files
    txt_files = list(data_dir.glob("*.txt"))
    if verbose:
        print(f"Found {len(txt_files)} txt files")

    if len(txt_files) == 0:
        if verbose:
            print("No txt files found in the data directory")
        return ""

    # Check if token budget is sufficient
    if token_budget:
        total_tokens_needed = len(txt_files) * n_tokens
        if total_tokens_needed > token_budget:
            if verbose:
                print(
                    f"Warning: Total tokens needed ({total_tokens_needed}) exceeds budget ({token_budget})"
                )
                print("Consider reducing n-tokens or increasing token budget")

    # Process each txt file
    results = []
    total_tokens_used = 0

    for txt_file in sorted(txt_files):
        if verbose:
            print(f"Sampling from {txt_file.name}...")

        # Read text
        with open(txt_file, "r", encoding="utf-8") as f:
            text = f.read()
        
        if not text.strip():
            if verbose:
                print(f"Warning: No text in {txt_file.name}")
            continue

        # Sample tokens
        sampled_text = sample_tokens(text, n_tokens)
        tokens_used = count_tokens(sampled_text)
        total_tokens_used += tokens_used

        results.append(
            {
                "filename": txt_file.name,
                "sampled_text": sampled_text,
                "tokens_used": tokens_used,
            }
        )

        # Check if we're exceeding the token budget
        if token_budget and total_tokens_used > token_budget:
            if verbose:
                print(f"Token budget exceeded after processing {txt_file.name}")
            break

    # Combine sampled text
    combined_text = ""
    for result in results:
        combined_text += f"[{result['filename']}]\n"
        combined_text += result["sampled_text"]
        combined_text += "\n\n"

    if verbose:
        print("\nSampling complete!")
        print(f"Sampled from {len(results)} files")
        print(f"Total tokens used: {total_tokens_used}")
        print(f"Tokens in combined text: {count_tokens(combined_text)}")

    return combined_text


def process_pdfs_and_sample(
    data_dir, n_tokens, token_budget=None, save_txt_files=True, verbose=True
):
    """
    Process PDFs and return sampled text.

    Args:
        data_dir: Path to directory containing PDF files
        n_tokens: Number of tokens to sample from each document
        token_budget: Optional total token budget limit
        save_txt_files: Whether to save extracted text as .txt files
        verbose: Whether to print progress messages

    Returns:
        str: Combined sampled text from all PDFs
    """
    data_dir = Path(data_dir)
    if not data_dir.exists():
        if verbose:
            print(f"Error: Directory {data_dir} does not exist")
        return ""

    # Find all PDF files
    pdf_files = list(data_dir.glob("*.pdf"))
    if verbose:
        print(f"Found {len(pdf_files)} PDF files")

    if len(pdf_files) == 0:
        if verbose:
            print("No PDF files found in the data directory")
        return ""

    # Check if token budget is sufficient
    if token_budget:
        total_tokens_needed = len(pdf_files) * n_tokens
        if total_tokens_needed > token_budget:
            if verbose:
                print(
                    f"Warning: Total tokens needed ({total_tokens_needed}) exceeds budget ({token_budget})"
                )
                print("Consider reducing n-tokens or increasing token budget")

    # Process each PDF
    results = []
    total_tokens_used = 0

    for pdf_file in sorted(pdf_files):
        txt_file = pdf_file.with_suffix(".txt")
        
        # Check if txt file already exists
        if txt_file.exists():
            if verbose:
                print(f"Skipping {pdf_file.name} - txt file already exists")
            
            # Read existing txt file for sampling
            with open(txt_file, "r", encoding="utf-8") as f:
                text = f.read()
        else:
            if verbose:
                print(f"Processing {pdf_file.name}...")

            # Extract text
            text = extract_text_from_pdf(pdf_file)
            if not text.strip():
                if verbose:
                    print(f"Warning: No text extracted from {pdf_file.name}")
                continue

            # Save as txt file if requested
            if save_txt_files:
                with open(txt_file, "w", encoding="utf-8") as f:
                    f.write(text)

        # Sample tokens
        sampled_text = sample_tokens(text, n_tokens)
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
        if token_budget and total_tokens_used > token_budget:
            if verbose:
                print(f"Token budget exceeded after processing {pdf_file.name}")
            break

    # Combine sampled text
    combined_text = ""
    for result in results:
        combined_text += f"[{result['filename']}]\n"
        combined_text += result["sampled_text"]
        combined_text += "\n\n"

    if verbose:
        print("\nProcessing complete!")
        print(f"Processed {len(results)} files")
        print(f"Total tokens used: {total_tokens_used}")
        print(f"Tokens in combined text: {count_tokens(combined_text)}")

    return combined_text


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

    # Use the new function
    combined_text = process_pdfs_and_sample(
        data_dir=args.data_dir,
        n_tokens=args.n_tokens,
        token_budget=args.token_budget,
        save_txt_files=True,
        verbose=True,
    )

    if combined_text:
        # Write combined output
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(combined_text)
        print(f"Output written to: {args.output}")
        return 0
    else:
        return 1


if __name__ == "__main__":
    sys.exit(main())
