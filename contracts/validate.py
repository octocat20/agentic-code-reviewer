import json
import re
from pathlib import Path


HEX_DIGEST = re.compile(r"^[0-9a-f]{64}$")


class SchemaError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


def load_json(path: Path):
    return json.loads(path.read_text())


def validate_instance(instance, schema):
    errors = _validate(instance, schema, schema, "$")
    errors.extend(_location_rules(instance, "$"))
    return errors


def validate_file(instance_path: Path, schema_path: Path):
    return validate_instance(load_json(instance_path), load_json(schema_path))


def _validate(instance, schema, root, path):
    if "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/"):
            return [f"{path} has an unsupported ref"]
        target = root
        for part in ref[2:].split("/"):
            target = target[part]
        return _validate(instance, target, root, path)

    errors = []
    if "const" in schema and instance != schema["const"]:
        errors.append(f"{path} must be {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{path} must be one of {schema['enum']}")

    expected = schema.get("type")
    if expected == "object":
        if not isinstance(instance, dict):
            return errors + [f"{path} must be an object"]
        properties = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in instance:
                errors.append(f"{path}.{key} is required")
        if schema.get("additionalProperties") is False:
            for key in instance:
                if key not in properties:
                    errors.append(f"{path}.{key} is not allowed")
        for key, subschema in properties.items():
            if key in instance:
                errors.extend(_validate(instance[key], subschema, root, f"{path}.{key}"))
        return errors
    if expected == "array":
        if not isinstance(instance, list):
            return errors + [f"{path} must be an array"]
        item_schema = schema.get("items")
        if item_schema is not None:
            for index, item in enumerate(instance):
                errors.extend(_validate(item, item_schema, root, f"{path}[{index}]"))
        return errors
    if expected == "string":
        if not isinstance(instance, str):
            return errors + [f"{path} must be a string"]
        if len(instance) < schema.get("minLength", 0):
            errors.append(f"{path} is empty")
        pattern = schema.get("pattern")
        if pattern and re.search(pattern, instance) is None:
            errors.append(f"{path} has the wrong form")
        return errors
    if expected == "integer":
        if isinstance(instance, bool) or not isinstance(instance, int):
            return errors + [f"{path} must be an integer"]
        if instance < schema.get("minimum", instance):
            errors.append(f"{path} is below the minimum")
        return errors
    return errors


def _location_rules(instance, path):
    errors = []
    if not isinstance(instance, dict):
        return errors
    if {"path", "start_line", "end_line"} <= set(instance):
        relative = instance["path"]
        if not isinstance(relative, str) or relative.startswith("/") or ".." in Path(relative).parts:
            errors.append(f"{path}.path must stay inside the snapshot")
        start = instance["start_line"]
        end = instance["end_line"]
        if isinstance(start, int) and isinstance(end, int) and end < start:
            errors.append(f"{path}.end_line precedes start_line")
    for key, value in instance.items():
        if isinstance(value, dict):
            errors.extend(_location_rules(value, f"{path}.{key}"))
        elif isinstance(value, list):
            for index, item in enumerate(value):
                if isinstance(item, dict):
                    errors.extend(_location_rules(item, f"{path}.{key}[{index}]"))
    return errors
