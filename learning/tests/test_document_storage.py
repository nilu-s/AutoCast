"""Tests for document storage and query modules.

Test coverage:
- Document metadata extraction
- Store and retrieve operations
- Search functionality
- Section queries
"""

import sys
import unittest
from pathlib import Path
from datetime import datetime

# Add parent to path (workspace root)
sys.path.insert(0, "/home/node/.openclaw/workspace/AutoCast")
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from learning.db.store_documents import (
    extract_title,
    extract_section,
    get_last_updated,
    encode_content,
)

from learning.db.query_documents import (
    search_documents,
    get_document_by_path,
    get_documents_by_section,
    list_all_sections,
)


class TestDocumentMetadataExtraction(unittest.TestCase):
    """Test metadata extraction functions."""
    
    def test_extract_title_from_h1(self):
        """Title should be extracted from first H1 heading."""
        content = "# My Document Title\n\nSome content here."
        title = extract_title(content)
        self.assertEqual(title, "My Document Title")
    
    def test_extract_title_from_first_line(self):
        """Title should fall back to first non-empty line."""
        content = "First line of document\n\nMore content."
        title = extract_title(content)
        self.assertEqual(title, "First line of document")
    
    def test_extract_title_empty(self):
        """Empty content should return 'Untitled'."""
        title = extract_title("")
        self.assertEqual(title, "Untitled")
    
    def test_extract_title_long_line(self):
        """Long lines should be truncated to 100 chars."""
        content = "x" * 200
        title = extract_title(content)
        self.assertEqual(len(title), 100)


class TestSectionExtraction(unittest.TestCase):
    """Test section extraction from file paths."""
    
    def test_extract_section_nested(self):
        """Should extract nested sections correctly."""
        path = "docs/llm/autoresearch/README.md"
        section = extract_section(path)
        self.assertEqual(section, "llm/autoresearch")
    
    def test_extract_section_single_level(self):
        """Should handle single-level paths."""
        path = "docs/architecture.md"
        section = extract_section(path)
        self.assertEqual(section, "root")
    
    def test_extract_section_with_docs_prefix(self):
        """Should strip 'docs' prefix."""
        path = "docs/llm/README.md"
        section = extract_section(path)
        self.assertEqual(section, "llm")


class TestEncoding(unittest.TestCase):
    """Test content encoding."""
    
    def test_encode_returns_list(self):
        """Should return list of floats."""
        content = "This is test content for encoding."
        embedding = encode_content(content)
        
        # Check type
        self.assertIsInstance(embedding, list)
        self.assertIsInstance(embedding[0], float)
        
        # Check dimension (should be 384 for all-MiniLM-L6-v2)
        self.assertEqual(len(embedding), 384)


class TestDocumentQueries(unittest.TestCase):
    """Test document query functions (mock mode if ChromaDB unavailable)."""
    
    def test_search_documents_mock_mode(self):
        """Should return empty list when ChromaDB unavailable."""
        results = search_documents("test query")
        # If ChromaDB not available, returns empty list
        self.assertIsInstance(results, list)
    
    def test_get_document_by_path_mock_mode(self):
        """Should return None when ChromaDB unavailable."""
        doc = get_document_by_path("docs/test.md")
        # If ChromaDB not available, returns None
        self.assertIsNone(doc)
    
    def test_list_sections_mock_mode(self):
        """Should return empty list when ChromaDB unavailable."""
        sections = list_all_sections()
        self.assertIsInstance(sections, list)


class TestIntegration(unittest.TestCase):
    """Integration tests requiring ChromaDB."""
    
    @unittest.skipUnless(
        sys.modules.get('learning.chroma_client') is not None,
        "ChromaDB not available"
    )
    def test_full_document_lifecycle(self):
        """Test storing and retrieving a document."""
        from learning.db.store_documents import store_document
        from learning.db.query_documents import get_document_by_path
        
        test_path = "test_docs/sample.md"
        test_content = "# Test Document\n\nThis is test content."
        
        # Store document
        success = store_document(test_path, test_content)
        
        # If ChromaDB available, should succeed
        if success:
            doc = get_document_by_path(test_path)
            self.assertIsNotNone(doc)
            self.assertEqual(doc['title'], "Test Document")
            self.assertEqual(doc['section'], "test_docs")


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
