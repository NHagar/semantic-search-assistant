import uuid
from pathlib import Path
from typing import Any, Dict, List

import chromadb
from sentence_transformers import SentenceTransformer


class VectorDB:
    def __init__(self, data_dir: str = "data", collection_name: str = "documents"):
        self.data_dir = Path(data_dir)
        self.collection_name = collection_name
        self.chroma_client = chromadb.PersistentClient(path="chroma_db")
        self.embedder = SentenceTransformer("Qwen/Qwen3-Embedding-0.6B")
        self.tokenizer = self.embedder.tokenizer

        print("Initializing collection...")
        self.collection = self.chroma_client.get_or_create_collection(
            name=self.collection_name
        )
        print("Collection created successfully")

    def load_txt_files(self) -> List[Dict[str, Any]]:
        """Load all txt files from the data directory."""
        documents = []

        for txt_file in self.data_dir.glob("*.txt"):
            try:
                with open(txt_file, "r", encoding="utf-8") as f:
                    content = f.read().strip()

                if content:
                    documents.append(
                        {
                            "filename": txt_file.name,
                            "path": str(txt_file),
                            "content": content,
                            "length": len(content),
                        }
                    )
            except Exception as e:
                print(f"Error reading {txt_file}: {e}")

        return documents

    def chunk_text(
        self, text: str, chunk_size: int = 512, overlap: int = 50
    ) -> List[str]:
        """Split text into overlapping chunks based on tokens."""
        tokens = self.tokenizer.encode(text)

        if len(tokens) <= chunk_size:
            return [text]

        chunks = []
        start = 0

        while start < len(tokens):
            end = min(start + chunk_size, len(tokens))
            chunk_tokens = tokens[start:end]
            chunk_text = self.tokenizer.decode(chunk_tokens)
            chunks.append(chunk_text)

            if end >= len(tokens):
                break

            start = end - overlap

        return chunks

    def embed_texts(self, texts: List[str]) -> List[float]:
        """Embed a list of texts using the SentenceTransformer."""
        return self.embedder.encode(
            texts, batch_size=64, show_progress_bar=True, device="mps"
        ).tolist()

    def build_database(self, chunk_size: int = 512, overlap: int = 50):
        """Build the vector database from txt files."""
        print("Loading txt files...")
        raw_documents = self.load_txt_files()
        print(f"Loaded {len(raw_documents)} documents")

        for doc in raw_documents:
            print(f"Processing {doc['filename']}...")
            chunks = self.chunk_text(doc["content"], chunk_size, overlap)
            embeddings = self.embed_texts(chunks)
            self.collection.add(
                ids=[str(uuid.uuid4()) for _ in range(len(chunks))],
                documents=chunks,
                metadatas=[
                    {
                        "filename": doc["filename"],
                        "path": doc["path"],
                        "chunk_id": i,
                        "content": chunk,
                        "original_length": doc["length"],
                    }
                    for i, chunk in enumerate(chunks)
                ],
                embeddings=embeddings,
            )

        print("Database built successfully")

    def semantic_search(self, query: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """Perform semantic search using chroma."""
        query = f"query: {query}"
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
        )
        if not results or not results["documents"]:
            return []

        results_text = results["documents"][0] if results["documents"] else []
        results_metadata = results["metadatas"][0] if results["metadatas"] else []
        results_distances = results["distances"][0] if results["distances"] else []

        output = []
        for text, metadata, distance in zip(
            results_text, results_metadata, results_distances
        ):
            similarity = 1 - distance  # Convert distance to similarity
            output.append(
                {
                    "filename": metadata["filename"],
                    "chunk_id": metadata["chunk_id"],
                    "content": text,
                    "similarity": similarity,
                }
            )

        return output

    def search_and_display(self, query: str, top_k: int = 5):
        """Search and display results in a formatted way."""
        print(f"\nSearching for: '{query}'")
        print("=" * 50)

        results = self.semantic_search(query, top_k)

        if not results:
            print("No results found.")
            return

        for i, result in enumerate(results, 1):
            print(f"\n{i}. {result['filename']} (chunk {result['chunk_id']})")
            print(f"   Similarity: {result['similarity']:.4f}")
            print(f"   Content preview: {result['content'][:200]}...")
            if len(result["content"]) > 200:
                print("   [Content truncated]")


def main():
    """Example usage of the VectorDB class."""
    db = VectorDB()
    db.build_database(chunk_size=1024, overlap=20)

    while True:
        query = input("\nEnter your search query (or 'quit' to exit): ").strip()
        if query.lower() in ["quit", "exit", "q"]:
            break

        if query:
            db.search_and_display(query)


if __name__ == "__main__":
    main()
