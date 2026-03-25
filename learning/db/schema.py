"""Schema validation for ChromaDB collections.

Provides validation for metadata fields, embedding types, and collection integrity
to ensure data consistency across the learning database.

Example:
    >>> from learning.db.schema import SchemaValidator, METHOD_SCHEMA
    >>> validator = SchemaValidator()
    >>> is_valid, errors = validator.validate_metadata(
    ...     {"category": "vad", "strategy": "aggressive"},
    ...     METHOD_SCHEMA
    ... )
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union
import logging

logger = logging.getLogger(__name__)


class FieldType(Enum):
    """Supported metadata field types."""
    STRING = "string"
    FLOAT = "float"
    INTEGER = "integer"
    BOOLEAN = "boolean"
    DATETIME = "datetime"
    LIST = "list"
    DICT = "dict"


@dataclass
class FieldDefinition:
    """Definition of a schema field.
    
    Attributes:
        field_type: Type of the field (from FieldType).
        required: Whether the field is required.
        default: Default value if field is missing.
        allowed_values: Optional list of allowed values for enums.
        min_value: Optional minimum value for numeric fields.
        max_value: Optional maximum value for numeric fields.
        description: Human-readable description of the field.
    """
    field_type: FieldType
    required: bool = True
    default: Any = None
    allowed_values: Optional[List[Any]] = None
    min_value: Optional[Union[int, float]] = None
    max_value: Optional[Union[int, float]] = None
    description: str = ""


# Schema definitions for each collection
METHOD_SCHEMA: Dict[str, FieldDefinition] = {
    "category": FieldDefinition(
        field_type=FieldType.STRING,
        required=True,
        description="Method category (e.g., 'vad', 'postprocess', 'analysis')"
    ),
    "strategy": FieldDefinition(
        field_type=FieldType.STRING,
        required=False,
        description="Specific strategy used within the category"
    ),
    "success_rate": FieldDefinition(
        field_type=FieldType.FLOAT,
        required=False,
        default=0.0,
        min_value=0.0,
        max_value=1.0,
        description="Success rate between 0.0 and 1.0"
    ),
    "attempts": FieldDefinition(
        field_type=FieldType.INTEGER,
        required=False,
        default=0,
        min_value=0,
        description="Number of attempts for this method"
    ),
    "parameters": FieldDefinition(
        field_type=FieldType.DICT,
        required=False,
        default={},
        description="Method parameters as a dictionary"
    ),
    "created_at": FieldDefinition(
        field_type=FieldType.DATETIME,
        required=True,
        description="ISO timestamp when method was created"
    ),
}

RUNS_SCHEMA: Dict[str, FieldDefinition] = {
    "timestamp": FieldDefinition(
        field_type=FieldType.DATETIME,
        required=True,
        description="ISO timestamp of the run"
    ),
    "baseline_score": FieldDefinition(
        field_type=FieldType.FLOAT,
        required=False,
        description="Baseline score before methods were applied"
    ),
    "final_score": FieldDefinition(
        field_type=FieldType.FLOAT,
        required=False,
        description="Final score after methods were applied"
    ),
    "status": FieldDefinition(
        field_type=FieldType.STRING,
        required=True,
        allowed_values=["COMPLETED", "FAILED", "RUNNING", "PENDING"],
        description="Status of the run"
    ),
    "methods_applied": FieldDefinition(
        field_type=FieldType.LIST,
        required=False,
        default=[],
        description="List of method IDs applied in this run"
    ),
}

METHOD_RUNS_SCHEMA: Dict[str, FieldDefinition] = {
    "decision": FieldDefinition(
        field_type=FieldType.STRING,
        required=False,
        allowed_values=["KEEP", "REJECT", "FAILED", "PENDING"],
        description="Decision made for this method run"
    ),
    "improvement": FieldDefinition(
        field_type=FieldType.FLOAT,
        required=False,
        description="Score improvement achieved"
    ),
    "duration_ms": FieldDefinition(
        field_type=FieldType.INTEGER,
        required=False,
        min_value=0,
        description="Duration in milliseconds"
    ),
    "method_id": FieldDefinition(
        field_type=FieldType.STRING,
        required=True,
        description="Reference to the method"
    ),
    "run_id": FieldDefinition(
        field_type=FieldType.STRING,
        required=True,
        description="Reference to the run"
    ),
}

# Collection schemas mapping
COLLECTION_SCHEMAS: Dict[str, Dict[str, FieldDefinition]] = {
    "methods": METHOD_SCHEMA,
    "runs": RUNS_SCHEMA,
    "method_runs": METHOD_RUNS_SCHEMA,
}


@dataclass
class ValidationResult:
    """Result of a validation operation.
    
    Attributes:
        is_valid: Whether validation passed.
        errors: List of error messages if validation failed.
        warnings: List of warning messages for non-critical issues.
        normalized_data: Cleaned/normalized data if validation passed.
    """
    is_valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    normalized_data: Optional[Dict[str, Any]] = None


class SchemaValidator:
    """Validator for ChromaDB collection metadata.
    
    Validates metadata fields against defined schemas, ensuring type safety
    and data integrity before storage.
    
    Attributes:
        embedding_dimension: Expected dimension for embedding vectors.
    """
    
    def __init__(self, embedding_dimension: int = 384):
        """Initialize the schema validator.
        
        Args:
            embedding_dimension: Expected dimension for embedding vectors.
                Default 384 matches all-MiniLM-L6-v2 model.
        """
        self.embedding_dimension = embedding_dimension
        logger.debug(f"SchemaValidator initialized with embedding_dim={embedding_dimension}")
    
    def validate_metadata(
        self,
        metadata: Dict[str, Any],
        schema: Dict[str, FieldDefinition]
    ) -> ValidationResult:
        """Validate metadata against a schema.
        
        Args:
            metadata: Metadata dictionary to validate.
            schema: Schema dictionary to validate against.
            
        Returns:
            ValidationResult with validation status and any errors.
        """
        errors = []
        warnings = []
        normalized = {}
        
        # Check required fields
        for field_name, field_def in schema.items():
            if field_def.required and field_name not in metadata:
                errors.append(f"Required field '{field_name}' is missing")
                continue
            
            if field_name not in metadata:
                # Use default if available
                if field_def.default is not None:
                    normalized[field_name] = field_def.default
                continue
            
            value = metadata[field_name]
            
            # Type validation and conversion
            is_valid, converted_value, error = self._validate_field_type(
                field_name, value, field_def
            )
            
            if not is_valid:
                errors.append(error)
            else:
                normalized[field_name] = converted_value
                
                # Check allowed values
                if field_def.allowed_values is not None:
                    if converted_value not in field_def.allowed_values:
                        errors.append(
                            f"Field '{field_name}' has invalid value '{converted_value}'. "
                            f"Allowed: {field_def.allowed_values}"
                        )
                
                # Check numeric ranges
                if field_def.field_type in (FieldType.FLOAT, FieldType.INTEGER):
                    if field_def.min_value is not None and converted_value < field_def.min_value:
                        errors.append(
                            f"Field '{field_name}' value {converted_value} is below minimum "
                            f"{field_def.min_value}"
                        )
                    if field_def.max_value is not None and converted_value > field_def.max_value:
                        errors.append(
                            f"Field '{field_name}' value {converted_value} exceeds maximum "
                            f"{field_def.max_value}"
                        )
        
        # Check for extra fields not in schema
        extra_fields = set(metadata.keys()) - set(schema.keys())
        if extra_fields:
            warnings.append(f"Extra fields not in schema: {extra_fields}")
            # Include extra fields in normalized data
            for field in extra_fields:
                normalized[field] = metadata[field]
        
        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            normalized_data=normalized if len(errors) == 0 else None
        )
    
    def _validate_field_type(
        self,
        field_name: str,
        value: Any,
        field_def: FieldDefinition
    ) -> Tuple[bool, Any, Optional[str]]:
        """Validate and convert a single field value.
        
        Args:
            field_name: Name of the field being validated.
            value: Value to validate.
            field_def: Field definition from schema.
            
        Returns:
            Tuple of (is_valid, converted_value, error_message).
        """
        try:
            if field_def.field_type == FieldType.STRING:
                if isinstance(value, str):
                    return True, value, None
                return True, str(value), None
                
            elif field_def.field_type == FieldType.FLOAT:
                if isinstance(value, float):
                    return True, value, None
                converted = float(value)
                return True, converted, None
                
            elif field_def.field_type == FieldType.INTEGER:
                if isinstance(value, int) and not isinstance(value, bool):
                    return True, value, None
                converted = int(float(value))
                return True, converted, None
                
            elif field_def.field_type == FieldType.BOOLEAN:
                if isinstance(value, bool):
                    return True, value, None
                if isinstance(value, str):
                    lowered = value.lower()
                    if lowered in ('true', '1', 'yes', 'on'):
                        return True, True, None
                    elif lowered in ('false', '0', 'no', 'off'):
                        return True, False, None
                return False, None, f"Field '{field_name}' cannot be converted to boolean"
                
            elif field_def.field_type == FieldType.DATETIME:
                if isinstance(value, str):
                    # Validate ISO format
                    try:
                        datetime.fromisoformat(value.replace('Z', '+00:00'))
                        return True, value, None
                    except ValueError:
                        return False, None, f"Field '{field_name}' is not a valid ISO datetime"
                return False, None, f"Field '{field_name}' must be a string (ISO datetime)"
                
            elif field_def.field_type == FieldType.LIST:
                if isinstance(value, list):
                    return True, value, None
                if isinstance(value, str):
                    # Try to parse as JSON list
                    import json
                    try:
                        parsed = json.loads(value)
                        if isinstance(parsed, list):
                            return True, parsed, None
                    except json.JSONDecodeError:
                        pass
                return False, None, f"Field '{field_name}' must be a list"
                
            elif field_def.field_type == FieldType.DICT:
                if isinstance(value, dict):
                    return True, value, None
                if isinstance(value, str):
                    # Try to parse as JSON dict
                    import json
                    try:
                        parsed = json.loads(value)
                        if isinstance(parsed, dict):
                            return True, parsed, None
                    except json.JSONDecodeError:
                        pass
                    # Could be a Python dict repr
                    try:
                        parsed = eval(value)  # noqa: S307
                        if isinstance(parsed, dict):
                            return True, parsed, None
                    except Exception:
                        pass
                return False, None, f"Field '{field_name}' must be a dictionary"
                
            else:
                return False, None, f"Unknown field type for '{field_name}'"
                
        except (ValueError, TypeError) as e:
            return False, None, f"Field '{field_name}' type conversion failed: {e}"
    
    def validate_embedding(
        self,
        embedding: List[float],
        expected_dimension: Optional[int] = None
    ) -> ValidationResult:
        """Validate an embedding vector.
        
        Args:
            embedding: Embedding vector to validate.
            expected_dimension: Expected dimension (defaults to self.embedding_dimension).
            
        Returns:
            ValidationResult with validation status.
        """
        errors = []
        expected_dim = expected_dimension or self.embedding_dimension
        
        if not isinstance(embedding, list):
            errors.append("Embedding must be a list")
        else:
            if len(embedding) != expected_dim:
                errors.append(
                    f"Embedding dimension mismatch: got {len(embedding)}, "
                    f"expected {expected_dim}"
                )
            
            # Check all elements are numeric
            for i, val in enumerate(embedding):
                if not isinstance(val, (int, float)):
                    errors.append(f"Embedding value at index {i} is not numeric")
                    break
        
        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors
        )
    
    def validate_collection_metadata(
        self,
        collection_name: str,
        metadata: Dict[str, Any]
    ) -> ValidationResult:
        """Validate metadata for a specific collection.
        
        Args:
            collection_name: Name of the collection (methods, runs, method_runs).
            metadata: Metadata dictionary to validate.
            
        Returns:
            ValidationResult with validation status.
        """
        if collection_name not in COLLECTION_SCHEMAS:
            return ValidationResult(
                is_valid=False,
                errors=[f"Unknown collection: {collection_name}"]
            )
        
        schema = COLLECTION_SCHEMAS[collection_name]
        return self.validate_metadata(metadata, schema)
    
    def get_schema(self, collection_name: str) -> Optional[Dict[str, FieldDefinition]]:
        """Get schema for a collection.
        
        Args:
            collection_name: Name of the collection.
            
        Returns:
            Schema dictionary or None if collection not found.
        """
        return COLLECTION_SCHEMAS.get(collection_name)
    
    def normalize_for_chromadb(
        self,
        metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Normalize metadata for ChromaDB storage.
        
        ChromaDB requires all values to be strings, numbers, or booleans.
        Complex types like dicts and lists must be serialized.
        
        Args:
            metadata: Metadata dictionary to normalize.
            
        Returns:
            Normalized metadata dictionary.
        """
        import json
        normalized = {}
        
        for key, value in metadata.items():
            if isinstance(value, (str, int, float, bool)):
                normalized[key] = value
            elif isinstance(value, list):
                normalized[key] = json.dumps(value)
            elif isinstance(value, dict):
                normalized[key] = json.dumps(value)
            else:
                normalized[key] = str(value)
        
        return normalized
    
    def denormalize_from_chromadb(
        self,
        metadata: Dict[str, Any],
        schema: Optional[Dict[str, FieldDefinition]] = None
    ) -> Dict[str, Any]:
        """Denormalize metadata from ChromaDB storage.
        
        Attempts to restore original types for serialized values.
        
        Args:
            metadata: Metadata dictionary from ChromaDB.
            schema: Optional schema to guide type restoration.
            
        Returns:
            Denormalized metadata dictionary.
        """
        import json
        denormalized = {}
        
        for key, value in metadata.items():
            if schema and key in schema:
                field_def = schema[key]
                
                if field_def.field_type == FieldType.DICT:
                    if isinstance(value, dict):
                        denormalized[key] = value
                    elif isinstance(value, str):
                        try:
                            denormalized[key] = json.loads(value)
                        except json.JSONDecodeError:
                            try:
                                denormalized[key] = eval(value)  # noqa: S307
                            except Exception:
                                denormalized[key] = value
                    else:
                        denormalized[key] = value
                        
                elif field_def.field_type == FieldType.LIST:
                    if isinstance(value, list):
                        denormalized[key] = value
                    elif isinstance(value, str):
                        try:
                            denormalized[key] = json.loads(value)
                        except json.JSONDecodeError:
                            denormalized[key] = value
                    else:
                        denormalized[key] = value
                        
                elif field_def.field_type == FieldType.FLOAT:
                    try:
                        denormalized[key] = float(value)
                    except (ValueError, TypeError):
                        denormalized[key] = value
                        
                elif field_def.field_type == FieldType.INTEGER:
                    try:
                        denormalized[key] = int(float(value))
                    except (ValueError, TypeError):
                        denormalized[key] = value
                        
                else:
                    denormalized[key] = value
            else:
                # No schema, try to parse JSON strings
                if isinstance(value, str):
                    try:
                        denormalized[key] = json.loads(value)
                    except json.JSONDecodeError:
                        denormalized[key] = value
                else:
                    denormalized[key] = value
        
        return denormalized


def validate_collection_metadata(
    collection_name: str,
    metadata: Dict[str, Any],
    embedding_dimension: int = 384
) -> ValidationResult:
    """Convenience function to validate collection metadata.
    
    Args:
        collection_name: Name of the collection.
        metadata: Metadata to validate.
        embedding_dimension: Expected embedding dimension.
        
    Returns:
        ValidationResult with validation status.
    """
    validator = SchemaValidator(embedding_dimension=embedding_dimension)
    return validator.validate_collection_metadata(collection_name, metadata)
