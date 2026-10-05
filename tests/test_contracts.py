import json
import unittest
from pathlib import Path

from contracts.digest import file_digest, snapshot_digest
from contracts.validate import load_json, validate_instance


ROOT = Path(__file__).resolve().parents[1]
TASK_SCHEMA = load_json(ROOT / "contracts" / "review-task.schema.json")
RESULT_SCHEMA = load_json(ROOT / "contracts" / "review-result.schema.json")
POLICY = ROOT / "fixtures" / "policy.json"
FIXTURES = ("clean", "local-defect", "cross-file", "renamed-file")


def line_count(path: Path) -> int:
    return len(path.read_text().splitlines())


class SchemaExamples(unittest.TestCase):
    def test_examples_match_their_schema(self):
        examples = ROOT / "contracts" / "examples"
        seen = set()
        for path in sorted(examples.glob("*.json")):
            instance = load_json(path)
            version = instance["schema_version"]
            if version == "review-task/v1":
                schema = TASK_SCHEMA
            elif version == "review-result/v1":
                schema = RESULT_SCHEMA
            else:
                self.fail(f"{path.name} has no known schema")
            self.assertEqual(validate_instance(instance, schema), [], path.name)
            seen.add(version)
        self.assertEqual(seen, {"review-task/v1", "review-result/v1"})

    def test_empty_finding_list_is_a_complete_result(self):
        result = load_json(ROOT / "contracts" / "examples" / "result-complete-empty.json")
        self.assertEqual(result["outcome"], "complete")
        self.assertEqual(result["findings"], [])

    def test_path_escape_is_rejected(self):
        result = load_json(ROOT / "contracts" / "examples" / "result-complete-finding.json")
        result["findings"][0]["location"]["path"] = "../secret.ts"
        errors = validate_instance(result, RESULT_SCHEMA)
        self.assertTrue(any("snapshot" in error for error in errors), errors)


class FixtureOracle(unittest.TestCase):
    def test_tasks_match_snapshot_and_diff_bytes(self):
        for name in FIXTURES:
            with self.subTest(name=name):
                fixture_dir = ROOT / "fixtures" / name
                task = load_json(fixture_dir / "task.json")
                self.assertEqual(validate_instance(task, TASK_SCHEMA), [])
                head = fixture_dir / "snapshot" / "head"
                self.assertEqual(task["snapshot_digest"], snapshot_digest(head))
                self.assertEqual(task["diff_digest"], file_digest(fixture_dir / "diff.patch"))
                self.assertEqual(task["policy_digest"], file_digest(POLICY))
                self.assertEqual(task["run_mode"], "recorded")

    def test_expected_findings_cite_real_head_lines(self):
        for name in FIXTURES:
            with self.subTest(name=name):
                fixture_dir = ROOT / "fixtures" / name
                manifest = load_json(fixture_dir / "fixture.json")
                expected = load_json(fixture_dir / "expected-findings.json")
                head = fixture_dir / manifest["head_snapshot"]
                for finding in expected["findings"]:
                    self.assertIn(finding["head"]["path"], manifest["changed_paths"])
                    self._assert_line_exists(head, finding["head"])
                    for support in finding["supporting"]:
                        self._assert_line_exists(head, support)
                        self.assertIn(support["path"], manifest.get("unchanged_paths", []))
                        self.assertNotIn(support["path"], manifest["changed_paths"])
                for forbidden in expected.get("forbidden_head_paths", []):
                    self.assertNotIn(forbidden, manifest.get("allowed_head_paths", [finding["head"]["path"] for finding in expected["findings"]]))
                    self.assertFalse((head / forbidden).exists(), forbidden)

    def test_clean_fixture_expects_no_finding(self):
        expected = load_json(ROOT / "fixtures" / "clean" / "expected-findings.json")
        self.assertEqual(expected["findings"], [])

    def test_malformed_task_fails_closed(self):
        fixture_dir = ROOT / "fixtures" / "malformed-input"
        task = load_json(fixture_dir / "task.json")
        expected = load_json(fixture_dir / "expected-error.json")
        errors = validate_instance(task, TASK_SCHEMA)
        self.assertTrue(errors)
        for field in expected["missing"]:
            self.assertTrue(any(field in error for error in errors), errors)
        self.assertFalse((fixture_dir / "expected-findings.json").exists())

    def _assert_line_exists(self, head: Path, location: dict):
        source = head / location["path"]
        self.assertTrue(source.is_file(), location["path"])
        count = line_count(source)
        self.assertGreaterEqual(location["start_line"], 1)
        self.assertLessEqual(location["end_line"], count)


if __name__ == "__main__":
    unittest.main()
