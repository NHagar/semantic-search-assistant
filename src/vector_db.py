import hashlib
from pathlib import Path
from typing import Any, Dict, List, Optional

import chromadb
import torch.nn.functional as F
from sentence_transformers import SentenceTransformer

from .project_manager import ProjectManager


class VectorDB:
    def __init__(
        self,
        data_dir: Optional[str] = None,
        collection_name: str = "documents",
        corpus_name: str = "",
        model_name: str = "",
        project_manager: Optional[ProjectManager] = None
    ):
        """
        Initialize VectorDB.

        Args:
            data_dir: Deprecated parameter (ignored)
            collection_name: Name of the chroma collection
            corpus_name: Name of the corpus (used if project_manager not provided)
            model_name: Name of the model (used if project_manager not provided)
            project_manager: ProjectManager instance (recommended)
        """
        self.collection_name = collection_name
        self.corpus_name = corpus_name
        self.model_name = model_name

        # Use ProjectManager
        if project_manager:
            self.project_manager = project_manager
        else:
            # Create a project manager if not provided
            self.project_manager = ProjectManager(corpus_name, model_name)

        self.data_dir = self.project_manager.txt_dir
        db_path = self.project_manager.chroma_db_dir
        db_path.mkdir(parents=True, exist_ok=True)

        self.chroma_client = chromadb.PersistentClient(path=str(db_path))
        self.embedder = SentenceTransformer(
            "nomic-ai/nomic-embed-text-v1.5", trust_remote_code=True
        )
        self.embedding_dim = 512
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

    def get_existing_filenames(self) -> set[str]:
        """Get set of filenames that are already in the database."""
        try:
            # Get all documents from the collection
            results = self.collection.get()
            if not results or not results["metadatas"]:
                return set()

            filenames = {
                str(metadata["filename"])
                for metadata in results["metadatas"]
                if metadata.get("filename")
            }
            return filenames
        except Exception as e:
            print(f"Error getting existing filenames: {e}")
            return set()

    def is_document_processed(self, filename: str) -> bool:
        """Check if a document with the given filename is already processed."""
        existing_filenames = self.get_existing_filenames()
        return filename in existing_filenames

    def get_collection_stats(self) -> Dict[str, Any]:
        """Get statistics about the collection."""
        try:
            results = self.collection.get()
            if not results or not results["metadatas"]:
                return {"total_chunks": 0, "unique_files": 0, "filenames": []}

            total_chunks = len(results["metadatas"])
            unique_files = len(self.get_existing_filenames())
            filenames = list(self.get_existing_filenames())

            return {
                "total_chunks": total_chunks,
                "unique_files": unique_files,
                "filenames": filenames,
            }
        except Exception as e:
            print(f"Error getting collection stats: {e}")
            return {"total_chunks": 0, "unique_files": 0, "filenames": []}

    def get_document_by_filename(self, filename: str) -> Dict[str, Any]:
        """Retrieve a document's full text by reassembling its chunks.

        Args:
            filename: The filename to retrieve

        Returns:
            Dictionary with filename and reconstructed text
        """
        try:
            results = self.collection.get()
            if not results or not results["metadatas"]:
                return {"filename": filename, "text": "", "chunks": []}

            # Filter chunks for this filename and sort by chunk_id
            document_chunks = []
            for i, metadata in enumerate(results["metadatas"]):
                if metadata.get("filename") == filename:
                    document_chunks.append({
                        "chunk_id": metadata.get("chunk_id", 0),
                        "content": metadata.get("content", ""),
                        "citation_key": metadata.get("citation_key", "")
                    })

            # Sort by chunk_id to get proper order
            document_chunks.sort(key=lambda x: x["chunk_id"])

            # Reconstruct full text from chunks
            full_text = " ".join([chunk["content"] for chunk in document_chunks])

            return {
                "filename": filename,
                "text": full_text,
                "chunks": document_chunks
            }
        except Exception as e:
            print(f"Error getting document {filename}: {e}")
            return {"filename": filename, "text": "", "chunks": []}

    def get_all_documents(self) -> List[Dict[str, Any]]:
        """Retrieve all documents with their reconstructed text.

        Returns:
            List of documents with filename and text
        """
        filenames = self.get_existing_filenames()
        documents = []

        for filename in sorted(filenames):
            doc = self.get_document_by_filename(filename)
            documents.append({
                "filename": doc["filename"],
                "text": doc["text"]
            })

        return documents

    def delete_document(self, filename: str) -> bool:
        """Delete all chunks for a specific document.

        Args:
            filename: The filename to delete

        Returns:
            True if successful, False otherwise
        """
        try:
            results = self.collection.get()
            if not results or not results["metadatas"]:
                return False

            # Find all citation keys for this filename
            citation_keys_to_delete = []
            for i, metadata in enumerate(results["metadatas"]):
                if metadata.get("filename") == filename:
                    citation_key = results["ids"][i]
                    citation_keys_to_delete.append(citation_key)

            if citation_keys_to_delete:
                self.collection.delete(ids=citation_keys_to_delete)
                print(f"Deleted {len(citation_keys_to_delete)} chunks for {filename}")
                return True
            else:
                print(f"No chunks found for {filename}")
                return False
        except Exception as e:
            print(f"Error deleting document {filename}: {e}")
            return False

    def embed_texts(self, texts: List[str]) -> List[float]:
        """Embed a list of texts using the SentenceTransformer."""
        embeddings = self.embedder.encode(
            texts,
            convert_to_tensor=True,
            batch_size=64,
            show_progress_bar=True,
            device="mps",
        )
        embeddings = F.layer_norm(embeddings, normalized_shape=(embeddings.shape[1],))
        embeddings = embeddings[:, : self.embedding_dim]
        embeddings = F.normalize(embeddings, p=2, dim=1)
        return embeddings.tolist()

    def build_database(
        self, chunk_size: int = 512, overlap: int = 50, force_rebuild: bool = False
    ):
        """Build the vector database from txt files."""
        print("Loading txt files...")
        raw_documents = self.load_txt_files()
        print(f"Loaded {len(raw_documents)} documents")

        # Get existing filenames to avoid reprocessing
        existing_filenames = (
            self.get_existing_filenames() if not force_rebuild else set()
        )

        if existing_filenames:
            print(f"Found {len(existing_filenames)} already processed files")

        documents_to_process = []
        for doc in raw_documents:
            if doc["filename"] not in existing_filenames:
                documents_to_process.append(doc)
            else:
                print(f"Skipping already processed file: {doc['filename']}")

        if not documents_to_process:
            print("All documents are already processed!")
            return

        print(f"Processing {len(documents_to_process)} new documents...")

        for doc in documents_to_process:
            print(f"Processing {doc['filename']}...")
            chunks = self.chunk_text(doc["content"], chunk_size, overlap)
            embeddings = self.embed_texts(
                [f"search_document: {chunk}" for chunk in chunks]
            )
            # Create compact citation keys using filename hash + chunk number
            filename_hash = hashlib.md5(doc["filename"].encode()).hexdigest()[:6]
            citation_keys = [f"{filename_hash}:{i}" for i in range(len(chunks))]

            self.collection.add(
                ids=citation_keys,
                documents=chunks,
                metadatas=[
                    {
                        "filename": doc["filename"],
                        "path": doc["path"],
                        "chunk_id": i,
                        "citation_key": citation_keys[i],
                        "content": chunk,
                        "original_length": doc["length"],
                    }
                    for i, chunk in enumerate(chunks)
                ],
                embeddings=embeddings,
            )

        print(
            f"Database updated successfully! Processed {len(documents_to_process)} new documents."
        )

    def semantic_search(self, query: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """Perform semantic search using chroma."""
        query = f"search_query: {query}"
        query_embedding = self.embed_texts([query])[0]
        results = self.collection.query(
            query_embeddings=[query_embedding],
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
                    "citation_key": metadata.get(
                        "citation_key", f"unknown:{metadata['chunk_id']}"
                    ),
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
    db = VectorDB(corpus_name="default")

    # Show current database stats
    stats = db.get_collection_stats()
    print(
        f"Current database: {stats['total_chunks']} chunks from {stats['unique_files']} files"
    )

    # Build/update database
    db.build_database(chunk_size=1024, overlap=20)

    # Show updated stats
    stats = db.get_collection_stats()
    print(
        f"Updated database: {stats['total_chunks']} chunks from {stats['unique_files']} files"
    )

    while True:
        query = input("\nEnter your search query (or 'quit' to exit): ").strip()
        if query.lower() in ["quit", "exit", "q"]:
            break

        if query:
            db.search_and_display(query)


if __name__ == "__main__":
    main()
