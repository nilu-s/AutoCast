"""Document storage for Markdown documentation in ChromaDB.

Provides functions to store and manage MD documentation files in ChromaDB
with automatic embedding generation and metadata extraction.

Example:
    >>> from learning.db.store_documents import store_document, store_all_documents
    >>> store_document("docs/architecture.md", content)
    >>> store_all_documents("/home/node/.openclaw/workspace/AutoCast/docs")
"""

import os
import re
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
import logging

logger = logging.getLogger(__name__)

# Try to import ChromaDB
try:
    from learning.chroma_client import ChromaLearningDB, EmbeddingGenerator
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    logger.warning("ChromaDB not available. Store functions will use mock mode.")

# Default persist directory
DEFAULT_PERSIST_DIR = "method_results/chroma_db"
DOCUMENTS_COLLECTION = "documents"


def extract_title(content: str) -> str:
    """Extract title from markdown content.
    
    Args:
        content: Markdown file content.
        
    Returns:
        Title string (first H1 heading or filename).
    """
    # Look for first H1 heading
    h1_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    if h1_match:
        return h1_match.group(1).strip()
    
    # Fallback: return first non-empty line
    for line in content.split('\n'):
        stripped = line.strip()
        if stripped:
            return stripped[:100]  # Limit length
    
    return "Untitled"


def extract_section(file_path: str) -> str:
    """Extract section/category from file path.
    
    Args:
        file_path: Path to the markdown file.
        
    Returns:
        Section name (e.g., 'architecture', 'llm/autoresearch').
    """
    path_parts = Path(file_path).parts
    
    # Skip 'docs' prefix if present
    if path_parts and path_parts[0] == 'docs':
        path_parts = path_parts[1:]
    
    # Join all directories except filename
    if len(path_parts) > 1:
        return '/'.join(path_parts[:-1])
    
    return 'root'


def get_last_updated(file_path: str) -> str:
    """Get last modified timestamp of file.
    
    Args:
        file_path: Path to the file.
        
    Returns:
        ISO 8601 timestamp string.
    """
    try:
        mtime = os.path.getmtime(file_path)
        return datetime.fromtimestamp(mtime).isoformat()
    except (OSError, FileNotFoundError):
        return datetime.now().isoformat()


def encode_content(content: str) -> List[float]:
    """Generate embedding vector from document content.
    
    Args:
        content: Document text content.
        
    Returns:
        Embedding vector as list of floats.
    """
    if not CHROMADB_AVAILABLE:
        # Mock embedding: return zeros
        return [0.0] * 384
    
    try:
        generator = EmbeddingGenerator()
        return generator.encode(content)
    except Exception as e:
        logger.error(f"Failed to encode content: {e}")
        return [0.0] * 384


def store_document(
    file_path: str,
    content: str,
    persist_dir: str = DEFAULT_PERSIST_DIR
) -> bool:
    """Store a single document in ChromaDB.
    
    Args:
        file_path: Original path of the document (used as ID).
        content: Document content.
        persist_dir: ChromaDB persistence directory.
        
    Returns:
        True if storage succeeded, False otherwise.
        
    Example:
        >>> store_document("docs/architecture.md", "# Architecture...")
        True
    """
    if not CHROMADB_AVAILABLE:
        logger.warning("ChromaDB not available. Skipping store.")
        return False
    
    try:
        # Initialize ChromaDB
        db = ChromaLearningDB(persist_dir=persist_dir)
        
        # Get or create documents collection
        try:
            collection = db.client.get_collection(DOCUMENTS_COLLECTION)
        except Exception:
            collection = db.client.create_collection(
                name=DOCUMENTS_COLLECTION,
                metadata={
                    "description": "AutoCast documentation collection",
                    "created_at": datetime.utcnow().isoformat()
                }
            )
        
        # Generate embedding
        embedding = encode_content(content)
        
        # Extract metadata
        metadata = {
            "file_path": file_path,
            "title": extract_title(content),
            "section": extract_section(file_path),
            "last_updated": get_last_updated(file_path) if os.path.exists(file_path) else datetime.now().isoformat(),
            "content_hash": hash(content) & 0xFFFFFFFF  # Simple content hash
        }
        
        # Store in ChromaDB
        collection.add(
            ids=[file_path],
            embeddings=[embedding],
            metadatas=[metadata],
            documents=[content]
        )
        
        logger.info(f"Stored document: {file_path}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to store document {file_path}: {e}")
        return False


def store_all_documents(
    docs_dir: str,
    exclude_files: Optional[List[str]] = None,
    persist_dir: str = DEFAULT_PERSIST_DIR
) -> Tuple[int, int]:
    """Store all markdown documents from a directory in ChromaDB.
    
    Args:
        docs_dir: Root directory to scan for .md files.
        exclude_files: List of filenames to exclude (e.g., ["CLAUDE.md"]).
        persist_dir: ChromaDB persistence directory.
        
    Returns:
        Tuple of (success_count, total_count).
        
    Example:
        >>> store_all_documents("/home/node/.openclaw/workspace/AutoCast/docs", 
        ...                      exclude_files=["CLAUDE.md"])
        (25, 25)
    """
    if exclude_files is None:
        exclude_files = ["CLAUDE.md"]
    
    success_count = 0
    total_count = 0
    
    docs_path = Path(docs_dir)
    
    if not docs_path.exists():
        logger.error(f"Directory not found: {docs_dir}")
        return (0, 0)
    
    # Find all .md files
    md_files = list(docs_path.rglob("*.md"))
    
    for md_file in md_files:
        # Skip excluded files
        if md_file.name in exclude_files:
            logger.info(f"Skipping excluded file: {md_file.name}")
            continue
        
        total_count += 1
        
        try:
            content = md_file.read_text(encoding='utf-8')
            
            # Store relative path from docs root
            relative_path = str(md_file.relative_to(docs_path.parent if str(docs_path).endswith('docs') else docs_path))
            
            if store_document(relative_path, content, persist_dir):
                success_count += 1
                
        except Exception as e:
            logger.error(f"Failed to read/store {md_file}: {e}")
    
    logger.info(f"Stored {success_count}/{total_count} documents")
    return (success_count, total_count)


def delete_document(file_path: str, persist_dir: str = DEFAULT_PERSIST_DIR) -> bool:
    """Delete a document from ChromaDB.
    
    Args:
        file_path: Path of the document to delete.
        persist_dir: ChromaDB persistence directory.
        
    Returns:
        True if deletion succeeded, False otherwise.
    """
    if not CHROMADB_AVAILABLE:
        logger.warning("ChromaDB not available. Cannot delete.")
        return False
    
    try:
        db = ChromaLearningDB(persist_dir=persist_dir)
        collection = db.client.get_collection(DOCUMENTS_COLLECTION)
        collection.delete(ids=[file_path])
        
        logger.info(f"Deleted document: {file_path}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to delete document {file_path}: {e}")
        return False


def get_collection_stats(persist_dir: str = DEFAULT_PERSIST_DIR) -> Dict[str, Any]:
    """Get statistics about the documents collection.
    
    Args:
        persist_dir: ChromaDB persistence directory.
        
    Returns:
        Dictionary with collection statistics.
    """
    if not CHROMADB_AVAILABLE:
        return {"error": "ChromaDB not available"}
    
    try:
        db = ChromaLearningDB(persist_dir=persist_dir)
        
        try:
            collection = db.client.get_collection(DOCUMENTS_COLLECTION)
            count = collection.count()
            
            # Get all documents for section analysis
            all_docs = collection.get()
            
            sections = {}
            for meta in all_docs.get('metadatas', []):
                section = meta.get('section', 'unknown')
                sections[section] = sections.get(section, 0) + 1
            
            return {
                "collection_name": DOCUMENTS_COLLECTION,
                "total_documents": count,
                "sections": sections,
                "status": "active"
            }
            
        except Exception:
            return {
                "collection_name": DOCUMENTS_COLLECTION,
                "total_documents": 0,
                "sections": {},
                "status": "not_found"
            }
            
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    # CLI interface for manual execution
    import argparse
    
    parser = argparse.ArgumentParser(description="Store MD documents in ChromaDB")
    parser.add_argument("--docs-dir", default="/home/node/.openclaw/workspace/AutoCast/docs",
                       help="Directory containing markdown files")
    parser.add_argument("--exclude", nargs="+", default=["CLAUDE.md"],
                       help="Files to exclude")
    parser.add_argument("--persist-dir", default=DEFAULT_PERSIST_DIR,
                       help="ChromaDB persistence directory")
    parser.add_argument("--stats", action="store_true",
                       help="Show collection statistics")
    
    args = parser.parse_args()
    
    if args.stats:
        stats = get_collection_stats(args.persist_dir)
        print(json.dumps(stats, indent=2))
    else:
        success, total = store_all_documents(
            args.docs_dir,
            exclude_files=args.exclude,
            persist_dir=args.persist_dir
        )
        print(f"Stored {success}/{total} documents")
