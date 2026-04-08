"""Query interface for ChromaDB documentation.

Provides search and retrieval functions for documents stored in ChromaDB
with semantic similarity search and metadata filtering.

Example:
    >>> from learning.db.query_documents import search_documents, get_document_by_path
    >>> results = search_documents("architecture patterns")
    >>> doc = get_document_by_path("docs/architecture.md")
"""

import os
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

# Try to import ChromaDB
try:
    from learning.chroma_client import ChromaLearningDB, EmbeddingGenerator
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    logger.warning("ChromaDB not available. Query functions will use mock mode.")

# Default settings
DEFAULT_PERSIST_DIR = "method_results/chroma_db"
DOCUMENTS_COLLECTION = "documents"
DEFAULT_N_RESULTS = 5


def search_documents(
    query: str,
    n_results: int = DEFAULT_N_RESULTS,
    section_filter: Optional[str] = None,
    persist_dir: str = DEFAULT_PERSIST_DIR
) -> List[Dict[str, Any]]:
    """Search documents by semantic similarity.
    
    Args:
        query: Search query string.
        n_results: Number of results to return.
        section_filter: Optional section filter (e.g., 'llm/autoresearch').
        persist_dir: ChromaDB persistence directory.
        
    Returns:
        List of result dictionaries with document info and similarity scores.
        
    Example:
        >>> results = search_documents("ChromaDB migration")
        >>> results[0]['title']
        'ChromaDB Migration Summary'
        >>> results[0]['score']
        0.85
    """
    if not CHROMADB_AVAILABLE:
        logger.warning("ChromaDB not available. Returning empty results.")
        return []
    
    try:
        db = ChromaLearningDB(persist_dir=persist_dir)
        
        try:
            collection = db.client.get_collection(DOCUMENTS_COLLECTION)
        except Exception:
            logger.error(f"Collection '{DOCUMENTS_COLLECTION}' not found")
            return []
        
        # Generate query embedding
        generator = EmbeddingGenerator()
        query_embedding = generator.encode(query)
        
        # Build where clause if section filter provided
        where_clause = None
        if section_filter:
            where_clause = {"section": section_filter}
        
        # Query ChromaDB
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where_clause,
            include=["metadatas", "documents", "distances"]
        )
        
        # Format results
        formatted_results = []
        
        if results.get('ids') and len(results['ids'][0]) > 0:
            for i, doc_id in enumerate(results['ids'][0]):
                metadata = results['metadatas'][0][i] if results.get('metadatas') else {}
                document = results['documents'][0][i] if results.get('documents') else ""
                distance = results['distances'][0][i] if results.get('distances') else 1.0
                
                # Convert distance to similarity score (cosine similarity)
                # ChromaDB returns L2 distance, convert to similarity
                similarity = 1.0 / (1.0 + distance)
                
                formatted_results.append({
                    "file_path": doc_id,
                    "title": metadata.get('title', 'Untitled'),
                    "section": metadata.get('section', 'unknown'),
                    "last_updated": metadata.get('last_updated', ''),
                    "content": document[:500] + "..." if len(document) > 500 else document,
                    "score": round(similarity, 4)
                })
        
        return formatted_results
        
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return []


def get_document_by_path(
    file_path: str,
    persist_dir: str = DEFAULT_PERSIST_DIR
) -> Optional[Dict[str, Any]]:
    """Retrieve a specific document by its file path.
    
    Args:
        file_path: Exact file path (ID) of the document.
        persist_dir: ChromaDB persistence directory.
        
    Returns:
        Document dictionary or None if not found.
        
    Example:
        >>> doc = get_document_by_path("docs/architecture.md")
        >>> doc['title']
        'AutoCast Architecture'
    """
    if not CHROMADB_AVAILABLE:
        logger.warning("ChromaDB not available. Cannot retrieve document.")
        return None
    
    try:
        db = ChromaLearningDB(persist_dir=persist_dir)
        
        try:
            collection = db.client.get_collection(DOCUMENTS_COLLECTION)
        except Exception:
            logger.error(f"Collection '{DOCUMENTS_COLLECTION}' not found")
            return None
        
        # Get document by ID
        result = collection.get(
            ids=[file_path],
            include=["metadatas", "documents"]
        )
        
        if result.get('ids') and len(result['ids']) > 0:
            metadata = result['metadatas'][0] if result.get('metadatas') else {}
            document = result['documents'][0] if result.get('documents') else ""
            
            return {
                "file_path": file_path,
                "title": metadata.get('title', 'Untitled'),
                "section": metadata.get('section', 'unknown'),
                "last_updated": metadata.get('last_updated', ''),
                "content": document,
                "content_hash": metadata.get('content_hash', 0)
            }
        
        return None
        
    except Exception as e:
        logger.error(f"Failed to get document {file_path}: {e}")
        return None


def update_document(
    file_path: str,
    new_content: str,
    persist_dir: str = DEFAULT_PERSIST_DIR
) -> bool:
    """Update an existing document with new content.
    
    Args:
        file_path: Path of the document to update.
        new_content: New document content.
        persist_dir: ChromaDB persistence directory.
        
    Returns:
        True if update succeeded, False otherwise.
        
    Example:
        >>> update_document("docs/architecture.md", "# New Content...")
        True
    """
    from learning.db.store_documents import (
        encode_content, extract_title, extract_section, get_last_updated
    )
    
    if not CHROMADB_AVAILABLE:
        logger.warning("ChromaDB not available. Cannot update document.")
        return False
    
    try:
        db = ChromaLearningDB(persist_dir=persist_dir)
        
        try:
            collection = db.client.get_collection(DOCUMENTS_COLLECTION)
        except Exception:
            logger.error(f"Collection '{DOCUMENTS_COLLECTION}' not found")
            return False
        
        # Generate new embedding
        embedding = encode_content(new_content)
        
        # Extract metadata
        metadata = {
            "file_path": file_path,
            "title": extract_title(new_content),
            "section": extract_section(file_path),
            "last_updated": datetime.now().isoformat(),
            "content_hash": hash(new_content) & 0xFFFFFFFF
        }
        
        # Update in ChromaDB
        collection.update(
            ids=[file_path],
            embeddings=[embedding],
            metadatas=[metadata],
            documents=[new_content]
        )
        
        logger.info(f"Updated document: {file_path}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to update document {file_path}: {e}")
        return False


def get_documents_by_section(
    section: str,
    persist_dir: str = DEFAULT_PERSIST_DIR
) -> List[Dict[str, Any]]:
    """Get all documents in a specific section.
    
    Args:
        section: Section path (e.g., 'llm/autoresearch').
        persist_dir: ChromaDB persistence directory.
        
    Returns:
        List of document dictionaries in the section.
    """
    if not CHROMADB_AVAILABLE:
        logger.warning("ChromaDB not available. Returning empty results.")
        return []
    
    try:
        db = ChromaLearningDB(persist_dir=persist_dir)
        
        try:
            collection = db.client.get_collection(DOCUMENTS_COLLECTION)
        except Exception:
            logger.error(f"Collection '{DOCUMENTS_COLLECTION}' not found")
            return []
        
        # Query by section metadata
        results = collection.get(
            where={"section": section},
            include=["metadatas"]
        )
        
        formatted_results = []
        
        if results.get('ids'):
            for i, doc_id in enumerate(results['ids']):
                metadata = results['metadatas'][i] if results.get('metadatas') else {}
                
                formatted_results.append({
                    "file_path": doc_id,
                    "title": metadata.get('title', 'Untitled'),
                    "last_updated": metadata.get('last_updated', '')
                })
        
        return formatted_results
        
    except Exception as e:
        logger.error(f"Failed to get documents by section: {e}")
        return []


def list_all_sections(persist_dir: str = DEFAULT_PERSIST_DIR) -> List[str]:
    """List all document sections in the collection.
    
    Args:
        persist_dir: ChromaDB persistence directory.
        
    Returns:
        List of unique section names.
    """
    if not CHROMADB_AVAILABLE:
        logger.warning("ChromaDB not available. Returning empty results.")
        return []
    
    try:
        db = ChromaLearningDB(persist_dir=persist_dir)
        
        try:
            collection = db.client.get_collection(DOCUMENTS_COLLECTION)
        except Exception:
            return []
        
        # Get all documents
        results = collection.get(include=["metadatas"])
        
        sections = set()
        if results.get('metadatas'):
            for metadata in results['metadatas']:
                section = metadata.get('section', 'unknown')
                sections.add(section)
        
        return sorted(list(sections))
        
    except Exception as e:
        logger.error(f"Failed to list sections: {e}")
        return []


def get_similar_documents(
    file_path: str,
    n_results: int = 5,
    persist_dir: str = DEFAULT_PERSIST_DIR
) -> List[Dict[str, Any]]:
    """Find documents similar to a given document.
    
    Args:
        file_path: Reference document path.
        n_results: Number of similar documents to return.
        persist_dir: ChromaDB persistence directory.
        
    Returns:
        List of similar document dictionaries.
    """
    # First get the reference document
    doc = get_document_by_path(file_path, persist_dir)
    
    if not doc:
        logger.error(f"Reference document not found: {file_path}")
        return []
    
    # Search for similar documents
    results = search_documents(
        doc['content'][:1000],  # Use first 1000 chars for similarity
        n_results=n_results + 1,  # +1 to exclude self
        persist_dir=persist_dir
    )
    
    # Filter out the reference document itself
    return [r for r in results if r['file_path'] != file_path][:n_results]


if __name__ == "__main__":
    # CLI interface for manual execution
    import argparse
    
    parser = argparse.ArgumentParser(description="Query documents in ChromaDB")
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    # Search command
    search_parser = subparsers.add_parser('search', help='Search documents')
    search_parser.add_argument('query', help='Search query')
    search_parser.add_argument('-n', '--n-results', type=int, default=5,
                               help='Number of results')
    search_parser.add_argument('--section', help='Filter by section')
    
    # Get command
    get_parser = subparsers.add_parser('get', help='Get document by path')
    get_parser.add_argument('file_path', help='Document path')
    
    # List sections command
    subparsers.add_parser('sections', help='List all sections')
    
    # Section documents command
    section_parser = subparsers.add_parser('section-docs', 
                                          help='List documents in section')
    section_parser.add_argument('section', help='Section path')
    
    # Similar documents command
    similar_parser = subparsers.add_parser('similar', 
                                           help='Find similar documents')
    similar_parser.add_argument('file_path', help='Reference document')
    similar_parser.add_argument('-n', '--n-results', type=int, default=5,
                               help='Number of results')
    
    args = parser.parse_args()
    
    if args.command == 'search':
        results = search_documents(
            args.query,
            n_results=args.n_results,
            section_filter=args.section
        )
        for i, r in enumerate(results, 1):
            print(f"{i}. {r['title']} ({r['score']})")
            print(f"   Path: {r['file_path']}")
            print(f"   {r['content'][:200]}...")
            print()
            
    elif args.command == 'get':
        doc = get_document_by_path(args.file_path)
        if doc:
            print(f"Title: {doc['title']}")
            print(f"Section: {doc['section']}")
            print(f"Last Updated: {doc['last_updated']}")
            print(f"\n{doc['content']}")
        else:
            print(f"Document not found: {args.file_path}")
            
    elif args.command == 'sections':
        sections = list_all_sections()
        for section in sections:
            print(section)
            
    elif args.command == 'section-docs':
        docs = get_documents_by_section(args.section)
        for doc in docs:
            print(f"- {doc['title']}: {doc['file_path']}")
            
    elif args.command == 'similar':
        results = get_similar_documents(args.file_path, args.n_results)
        print(f"Documents similar to {args.file_path}:")
        for r in results:
            print(f"  - {r['title']} ({r['file_path']})")
    else:
        parser.print_help()
