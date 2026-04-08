"""Database module for learning engine.

Provides ChromaDB collections management and schema validation.

Document Storage (NEW):
    store_documents: Store MD documentation in ChromaDB
    query_documents: Query documentation with semantic search
"""

from learning.db.init_collections import CollectionInitializer, initialize_collections
from learning.db.schema import SchemaValidator, validate_collection_metadata

# Document storage (optional - may not be available)
try:
    from learning.db.store_documents import (
        store_document,
        store_all_documents,
        delete_document,
        get_collection_stats,
    )
    from learning.db.query_documents import (
        search_documents,
        get_document_by_path,
        update_document,
        get_documents_by_section,
        list_all_sections,
        get_similar_documents,
    )
    DOCUMENTS_AVAILABLE = True
except ImportError:
    DOCUMENTS_AVAILABLE = False

__all__ = [
    "CollectionInitializer",
    "initialize_collections",
    "SchemaValidator",
    "validate_collection_metadata",
]

if DOCUMENTS_AVAILABLE:
    __all__.extend([
        "store_document",
        "store_all_documents",
        "delete_document",
        "get_collection_stats",
        "search_documents",
        "get_document_by_path",
        "update_document",
        "get_documents_by_section",
        "list_all_sections",
        "get_similar_documents",
    ])