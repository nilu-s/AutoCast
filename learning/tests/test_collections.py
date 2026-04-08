"""Tests for ChromaDB collections initialization and schema validation.

Tests the CollectionInitializer, SchemaValidator, and collection integrity.

Run with:
    python3 -m pytest learning/tests/test_collections.py -v
    
Or standalone:
    python3 learning/tests/test_collections.py
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime

# Add workspace to path
workspace_root = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..')
)
sys.path.insert(0, workspace_root)

from learning.db.init_collections import (
    CollectionInfo,
    CollectionInitializer,
    initialize_collections,
)
from learning.db.schema import (
    COLLECTION_SCHEMAS,
    METHOD_SCHEMA,
    METHOD_RUNS_SCHEMA,
    RUNS_SCHEMA,
    FieldDefinition,
    FieldType,
    SchemaValidator,
    ValidationResult,
    validate_collection_metadata,
)


class TestFieldTypes(unittest.TestCase):
    """Test field type definitions."""
    
    def test_field_type_enum_values(self):
        """Test that FieldType enum has expected values."""
        self.assertEqual(FieldType.STRING.value, "string")
        self.assertEqual(FieldType.FLOAT.value, "float")
        self.assertEqual(FieldType.INTEGER.value, "integer")
        self.assertEqual(FieldType.BOOLEAN.value, "boolean")
        self.assertEqual(FieldType.DATETIME.value, "datetime")
        self.assertEqual(FieldType.LIST.value, "list")
        self.assertEqual(FieldType.DICT.value, "dict")


class TestFieldDefinition(unittest.TestCase):
    """Test FieldDefinition dataclass."""
    
    def test_required_field(self):
        """Test required field definition."""
        field = FieldDefinition(
            field_type=FieldType.STRING,
            required=True,
            description="Test field"
        )
        self.assertTrue(field.required)
        self.assertIsNone(field.default)
    
    def test_optional_field_with_default(self):
        """Test optional field with default."""
        field = FieldDefinition(
            field_type=FieldType.FLOAT,
            required=False,
            default=0.0,
            min_value=0.0,
            max_value=1.0,
            description="Success rate field"
        )
        self.assertFalse(field.required)
        self.assertEqual(field.default, 0.0)
        self.assertEqual(field.min_value, 0.0)
        self.assertEqual(field.max_value, 1.0)


class TestMethodSchema(unittest.TestCase):
    """Test METHOD_SCHEMA definition."""
    
    def test_required_fields_exist(self):
        """Test that required fields exist in schema."""
        required_fields = ["category", "created_at"]
        for field in required_fields:
            self.assertIn(field, METHOD_SCHEMA)
            self.assertTrue(METHOD_SCHEMA[field].required)
    
    def test_optional_fields_exist(self):
        """Test that optional fields exist."""
        optional_fields = ["strategy", "success_rate", "attempts", "parameters"]
        for field in optional_fields:
            self.assertIn(field, METHOD_SCHEMA)
    
    def test_success_rate_constraints(self):
        """Test success_rate field constraints."""
        field = METHOD_SCHEMA["success_rate"]
        self.assertEqual(field.field_type, FieldType.FLOAT)
        self.assertEqual(field.min_value, 0.0)
        self.assertEqual(field.max_value, 1.0)
        self.assertEqual(field.default, 0.0)
    
    def test_attempts_constraints(self):
        """Test attempts field constraints."""
        field = METHOD_SCHEMA["attempts"]
        self.assertEqual(field.field_type, FieldType.INTEGER)
        self.assertEqual(field.min_value, 0)
        self.assertEqual(field.default, 0)
    
    def test_category_field(self):
        """Test category field definition."""
        field = METHOD_SCHEMA["category"]
        self.assertEqual(field.field_type, FieldType.STRING)
        self.assertTrue(field.required)


class TestRunsSchema(unittest.TestCase):
    """Test RUNS_SCHEMA definition."""
    
    def test_required_fields_exist(self):
        """Test that required fields exist."""
        required_fields = ["timestamp", "status"]
        for field in required_fields:
            self.assertIn(field, RUNS_SCHEMA)
            self.assertTrue(RUNS_SCHEMA[field].required)
    
    def test_status_allowed_values(self):
        """Test status field allowed values."""
        field = RUNS_SCHEMA["status"]
        expected = ["COMPLETED", "FAILED", "RUNNING", "PENDING"]
        self.assertEqual(field.allowed_values, expected)
    
    def test_score_fields(self):
        """Test score fields are optional floats."""
        for field_name in ["baseline_score", "final_score"]:
            field = RUNS_SCHEMA[field_name]
            self.assertEqual(field.field_type, FieldType.FLOAT)
            self.assertFalse(field.required)
    
    def test_methods_applied_field(self):
        """Test methods_applied field."""
        field = RUNS_SCHEMA["methods_applied"]
        self.assertEqual(field.field_type, FieldType.LIST)
        self.assertEqual(field.default, [])


class TestMethodRunsSchema(unittest.TestCase):
    """Test METHOD_RUNS_SCHEMA definition."""
    
    def test_required_fields_exist(self):
        """Test that required fields exist."""
        required_fields = ["method_id", "run_id"]
        for field in required_fields:
            self.assertIn(field, METHOD_RUNS_SCHEMA)
            self.assertTrue(METHOD_RUNS_SCHEMA[field].required)
    
    def test_decision_allowed_values(self):
        """Test decision field allowed values."""
        field = METHOD_RUNS_SCHEMA["decision"]
        expected = ["KEEP", "REJECT", "FAILED", "PENDING"]
        self.assertEqual(field.allowed_values, expected)
    
    def test_duration_ms_constraints(self):
        """Test duration_ms field constraints."""
        field = METHOD_RUNS_SCHEMA["duration_ms"]
        self.assertEqual(field.field_type, FieldType.INTEGER)
        self.assertEqual(field.min_value, 0)


class TestSchemaValidator(unittest.TestCase):
    """Test SchemaValidator class."""
    
    def setUp(self):
        """Set up test validator."""
        self.validator = SchemaValidator(embedding_dimension=384)
    
    def test_init_with_dimension(self):
        """Test validator initialization."""
        self.assertEqual(self.validator.embedding_dimension, 384)
    
    def test_validate_string_field(self):
        """Test string field validation."""
        result = self.validator.validate_metadata(
            {"category": "vad"},
            {"category": FieldDefinition(FieldType.STRING, required=True)}
        )
        self.assertTrue(result.is_valid)
        self.assertEqual(result.normalized_data["category"], "vad")
    
    def test_validate_float_field(self):
        """Test float field validation."""
        result = self.validator.validate_metadata(
            {"success_rate": 0.75},
            {"success_rate": FieldDefinition(FieldType.FLOAT, required=True)}
        )
        self.assertTrue(result.is_valid)
        self.assertEqual(result.normalized_data["success_rate"], 0.75)
    
    def test_validate_integer_field(self):
        """Test integer field validation."""
        result = self.validator.validate_metadata(
            {"attempts": 5},
            {"attempts": FieldDefinition(FieldType.INTEGER, required=True)}
        )
        self.assertTrue(result.is_valid)
        self.assertEqual(result.normalized_data["attempts"], 5)
    
    def test_validate_missing_required_field(self):
        """Test validation fails for missing required field."""
        result = self.validator.validate_metadata(
            {},
            {"category": FieldDefinition(FieldType.STRING, required=True)}
        )
        self.assertFalse(result.is_valid)
        self.assertIn("Required field 'category' is missing", result.errors)
    
    def test_validate_invalid_type(self):
        """Test validation fails for invalid type."""
        result = self.validator.validate_metadata(
            {"attempts": "not_a_number"},
            {"attempts": FieldDefinition(FieldType.INTEGER, required=True)}
        )
        self.assertFalse(result.is_valid)
        self.assertTrue(any("type conversion failed" in e for e in result.errors))
    
    def test_validate_allowed_values(self):
        """Test allowed values validation."""
        result = self.validator.validate_metadata(
            {"status": "INVALID"},
            {"status": FieldDefinition(
                FieldType.STRING,
                required=True,
                allowed_values=["VALID", "PENDING"]
            )}
        )
        self.assertFalse(result.is_valid)
        self.assertIn("Field 'status' has invalid value 'INVALID'", result.errors[0])
    
    def test_validate_min_value(self):
        """Test minimum value constraint."""
        result = self.validator.validate_metadata(
            {"success_rate": -0.1},
            {"success_rate": FieldDefinition(
                FieldType.FLOAT,
                required=True,
                min_value=0.0
            )}
        )
        self.assertFalse(result.is_valid)
        self.assertIn("Field 'success_rate' value -0.1 is below minimum 0.0", result.errors)
    
    def test_validate_max_value(self):
        """Test maximum value constraint."""
        result = self.validator.validate_metadata(
            {"success_rate": 1.5},
            {"success_rate": FieldDefinition(
                FieldType.FLOAT,
                required=True,
                max_value=1.0
            )}
        )
        self.assertFalse(result.is_valid)
        self.assertIn("Field 'success_rate' value 1.5 exceeds maximum 1.0", result.errors)
    
    def test_validate_datetime_field(self):
        """Test datetime field validation."""
        result = self.validator.validate_metadata(
            {"created_at": "2024-03-25T10:30:00Z"},
            {"created_at": FieldDefinition(FieldType.DATETIME, required=True)}
        )
        self.assertTrue(result.is_valid)
    
    def test_validate_invalid_datetime(self):
        """Test invalid datetime fails validation."""
        result = self.validator.validate_metadata(
            {"created_at": "not-a-datetime"},
            {"created_at": FieldDefinition(FieldType.DATETIME, required=True)}
        )
        self.assertFalse(result.is_valid)
    
    def test_validate_dict_field(self):
        """Test dict field validation."""
        result = self.validator.validate_metadata(
            {"parameters": {"key": "value"}},
            {"parameters": FieldDefinition(FieldType.DICT, required=True)}
        )
        self.assertTrue(result.is_valid)
        self.assertEqual(result.normalized_data["parameters"], {"key": "value"})
    
    def test_validate_list_field(self):
        """Test list field validation."""
        result = self.validator.validate_metadata(
            {"methods_applied": ["method1", "method2"]},
            {"methods_applied": FieldDefinition(FieldType.LIST, required=True)}
        )
        self.assertTrue(result.is_valid)
    
    def test_default_value_applied(self):
        """Test default values are applied."""
        result = self.validator.validate_metadata(
            {},
            {"attempts": FieldDefinition(
                FieldType.INTEGER,
                required=False,
                default=0
            )}
        )
        self.assertTrue(result.is_valid)
        self.assertEqual(result.normalized_data["attempts"], 0)
    
    def test_extra_fields_warning(self):
        """Test extra fields generate warnings."""
        result = self.validator.validate_metadata(
            {"extra_field": "value"},
            {}
        )
        self.assertTrue(result.is_valid)
        self.assertIn("extra_field", str(result.warnings))


class TestSchemaValidatorEmbeddings(unittest.TestCase):
    """Test embedding validation."""
    
    def setUp(self):
        """Set up test validator."""
        self.validator = SchemaValidator(embedding_dimension=384)
    
    def test_validate_valid_embedding(self):
        """Test valid embedding passes."""
        embedding = [0.1] * 384
        result = self.validator.validate_embedding(embedding)
        self.assertTrue(result.is_valid)
    
    def test_validate_wrong_dimension(self):
        """Test wrong dimension fails."""
        embedding = [0.1] * 100
        result = self.validator.validate_embedding(embedding)
        self.assertFalse(result.is_valid)
        self.assertIn("dimension mismatch", result.errors[0])
    
    def test_validate_non_numeric(self):
        """Test non-numeric values fail."""
        embedding = ["string"] * 384
        result = self.validator.validate_embedding(embedding)
        self.assertFalse(result.is_valid)
        self.assertIn("not numeric", result.errors[0])
    
    def test_validate_not_list(self):
        """Test non-list fails."""
        result = self.validator.validate_embedding("not a list")
        self.assertFalse(result.is_valid)


class TestCollectionSchemas(unittest.TestCase):
    """Test COLLECTION_SCHEMAS mapping."""
    
    def test_all_collections_defined(self):
        """Test all expected collections are defined."""
        expected = ["methods", "runs", "method_runs"]
        for name in expected:
            self.assertIn(name, COLLECTION_SCHEMAS)
    
    def test_methods_schema_matches(self):
        """Test methods schema matches METHOD_SCHEMA."""
        self.assertEqual(COLLECTION_SCHEMAS["methods"], METHOD_SCHEMA)
    
    def test_runs_schema_matches(self):
        """Test runs schema matches RUNS_SCHEMA."""
        self.assertEqual(COLLECTION_SCHEMAS["runs"], RUNS_SCHEMA)
    
    def test_method_runs_schema_matches(self):
        """Test method_runs schema matches METHOD_RUNS_SCHEMA."""
        self.assertEqual(COLLECTION_SCHEMAS["method_runs"], METHOD_RUNS_SCHEMA)


class TestValidateCollectionMetadata(unittest.TestCase):
    """Test validate_collection_metadata convenience function."""
    
    def test_valid_method_metadata(self):
        """Test valid method metadata passes."""
        metadata = {
            "category": "vad",
            "created_at": datetime.utcnow().isoformat(),
            "success_rate": 0.75,
            "attempts": 5
        }
        result = validate_collection_metadata("methods", metadata)
        self.assertTrue(result.is_valid)
    
    def test_invalid_collection_name(self):
        """Test invalid collection name fails."""
        result = validate_collection_metadata("invalid", {})
        self.assertFalse(result.is_valid)
        self.assertIn("Unknown collection", result.errors[0])


class TestCollectionInfo(unittest.TestCase):
    """Test CollectionInfo dataclass."""
    
    def test_basic_creation(self):
        """Test basic creation."""
        info = CollectionInfo(name="methods")
        self.assertEqual(info.name, "methods")
        self.assertFalse(info.exists)
        self.assertEqual(info.count, 0)
        # schema_valid is False by default until validated
        self.assertFalse(info.schema_valid)
    
    def test_with_errors(self):
        """Test creation with errors."""
        info = CollectionInfo(
            name="methods",
            exists=True,
            count=10,
            schema_valid=False,
            validation_errors=["Error 1", "Error 2"]
        )
        self.assertEqual(len(info.validation_errors), 2)


class TestCollectionInitializer(unittest.TestCase):
    """Test CollectionInitializer class."""
    
    def setUp(self):
        """Set up test directory."""
        self.temp_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        """Clean up test directory."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_init(self):
        """Test initializer creation."""
        initializer = CollectionInitializer(persist_dir=self.temp_dir)
        self.assertEqual(initializer.persist_dir, self.temp_dir)
        self.assertIsNotNone(initializer.validator)
    
    def test_get_collection_schemas(self):
        """Test getting collection schemas."""
        initializer = CollectionInitializer(persist_dir=self.temp_dir)
        schemas = initializer.get_collection_schemas()
        
        self.assertIn("methods", schemas)
        self.assertIn("runs", schemas)
        self.assertIn("method_runs", schemas)
        
        # Check structure
        for name, schema in schemas.items():
            for field_name, field_def in schema.items():
                self.assertIn("type", field_def)
                self.assertIn("required", field_def)


class TestNormalizeForChromaDB(unittest.TestCase):
    """Test metadata normalization for ChromaDB."""
    
    def setUp(self):
        """Set up validator."""
        self.validator = SchemaValidator()
    
    def test_normalize_dict(self):
        """Test dict normalization."""
        metadata = {"parameters": {"key": "value"}}
        normalized = self.validator.normalize_for_chromadb(metadata)
        self.assertIsInstance(normalized["parameters"], str)
        self.assertIn('"key": "value"', normalized["parameters"])
    
    def test_normalize_list(self):
        """Test list normalization."""
        metadata = {"methods": ["m1", "m2"]}
        normalized = self.validator.normalize_for_chromadb(metadata)
        self.assertIsInstance(normalized["methods"], str)
        self.assertIn("m1", normalized["methods"])
    
    def test_preserve_primitives(self):
        """Test primitive values are preserved."""
        metadata = {
            "string": "value",
            "float": 1.5,
            "int": 42,
            "bool": True
        }
        normalized = self.validator.normalize_for_chromadb(metadata)
        self.assertEqual(normalized["string"], "value")
        self.assertEqual(normalized["float"], 1.5)
        self.assertEqual(normalized["int"], 42)
        self.assertEqual(normalized["bool"], True)


class TestDenormalizeFromChromaDB(unittest.TestCase):
    """Test metadata denormalization from ChromaDB."""
    
    def setUp(self):
        """Set up validator."""
        self.validator = SchemaValidator()
    
    def test_denormalize_dict(self):
        """Test dict denormalization."""
        metadata = {"parameters": '{"key": "value"}'}
        denormalized = self.validator.denormalize_from_chromadb(
            metadata, METHOD_SCHEMA
        )
        self.assertIsInstance(denormalized["parameters"], dict)
        self.assertEqual(denormalized["parameters"]["key"], "value")
    
    def test_denormalize_list(self):
        """Test list denormalization."""
        metadata = {"methods_applied": '["m1", "m2"]'}
        denormalized = self.validator.denormalize_from_chromadb(
            metadata, RUNS_SCHEMA
        )
        self.assertIsInstance(denormalized["methods_applied"], list)
        self.assertEqual(denormalized["methods_applied"], ["m1", "m2"])
    
    def test_denormalize_float(self):
        """Test float denormalization."""
        metadata = {"success_rate": "0.75"}
        denormalized = self.validator.denormalize_from_chromadb(
            metadata, METHOD_SCHEMA
        )
        self.assertIsInstance(denormalized["success_rate"], float)
        self.assertEqual(denormalized["success_rate"], 0.75)


class TestInitializeCollections(unittest.TestCase):
    """Test initialize_collections convenience function."""
    
    def setUp(self):
        """Set up test directory."""
        self.temp_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        """Clean up test directory."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_returns_initializer(self):
        """Test function returns CollectionInitializer."""
        initializer = initialize_collections(
            persist_dir=self.temp_dir,
            overwrite=False
        )
        self.assertIsInstance(initializer, CollectionInitializer)


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestFieldTypes))
    suite.addTests(loader.loadTestsFromTestCase(TestFieldDefinition))
    suite.addTests(loader.loadTestsFromTestCase(TestMethodSchema))
    suite.addTests(loader.loadTestsFromTestCase(TestRunsSchema))
    suite.addTests(loader.loadTestsFromTestCase(TestMethodRunsSchema))
    suite.addTests(loader.loadTestsFromTestCase(TestSchemaValidator))
    suite.addTests(loader.loadTestsFromTestCase(TestSchemaValidatorEmbeddings))
    suite.addTests(loader.loadTestsFromTestCase(TestCollectionSchemas))
    suite.addTests(loader.loadTestsFromTestCase(TestValidateCollectionMetadata))
    suite.addTests(loader.loadTestsFromTestCase(TestCollectionInfo))
    suite.addTests(loader.loadTestsFromTestCase(TestCollectionInitializer))
    suite.addTests(loader.loadTestsFromTestCase(TestNormalizeForChromaDB))
    suite.addTests(loader.loadTestsFromTestCase(TestDenormalizeFromChromaDB))
    suite.addTests(loader.loadTestsFromTestCase(TestInitializeCollections))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
