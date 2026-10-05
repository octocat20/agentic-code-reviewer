import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyze } from "../router/analyze.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

function fixtureDiff(name: string): { diff: string; headSnapshot: string } {
  const dir = path.join(ROOT, "fixtures", name);
  return {
    diff: fs.readFileSync(path.join(dir, "diff.patch"), "utf8"),
    headSnapshot: path.join(dir, "snapshot", "head"),
  };
}

test("repeat runs return the same routes and static findings", async () => {
  for (const name of ["clean", "local-defect", "cross-file", "renamed-file"]) {
    const input = fixtureDiff(name);
    const first = await analyze(input);
    const second = await analyze(input);
    assert.deepEqual(second, first, name);
  }
});

test("renamed fixture keeps the deleted path off the head side", async () => {
  const analysis = await analyze(fixtureDiff("renamed-file"));
  const deleted = analysis.files.find((file) => file.path === "src/old-tax.ts");
  const added = analysis.files.find((file) => file.path === "src/tax.ts");
  assert.equal(deleted?.changeType, "deleted");
  assert.deepEqual(deleted?.headRanges, []);
  assert.equal(added?.changeType, "added");
  assert.deepEqual(added?.baseRanges, []);
  assert.equal(added?.route, "source");
});

test("path escape is excluded and not linted", async () => {
  const head = fs.mkdtempSync(path.join(os.tmpdir(), "review-head-"));
  const analysis = await analyze({
    diff: ["--- a/../outside.ts", "+++ b/../outside.ts", "@@ -1 +1 @@", "-export const a = 1;", "+export const a = 2;", ""].join("\n"),
    headSnapshot: head,
  });
  assert.equal(analysis.files.length, 1);
  assert.equal(analysis.files[0]?.route, "excluded");
  assert.equal(analysis.files[0]?.exclusionReason, "path-escape");
  assert.deepEqual(analysis.findings, []);
});

test("symlink escape is excluded", async () => {
  const head = fs.mkdtempSync(path.join(os.tmpdir(), "review-head-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "review-outside-"));
  fs.mkdirSync(path.join(head, "src"));
  fs.writeFileSync(path.join(outside, "secret.ts"), "const unused = 1;\nexport const kept = 2;\n");
  fs.symlinkSync(path.join(outside, "secret.ts"), path.join(head, "src", "linked.ts"));
  const analysis = await analyze({
    diff: ["--- a/src/linked.ts", "+++ b/src/linked.ts", "@@ -1 +1 @@", "-export const kept = 1;", "+export const kept = 2;", ""].join("\n"),
    headSnapshot: head,
  });
  assert.equal(analysis.files[0]?.route, "excluded");
  assert.equal(analysis.files[0]?.exclusionReason, "symlink-escape");
  assert.deepEqual(analysis.findings, []);
});

test("snapshot eslint config cannot suppress a trusted finding", async () => {
  const head = fs.mkdtempSync(path.join(os.tmpdir(), "review-lint-"));
  fs.mkdirSync(path.join(head, "src"));
  fs.writeFileSync(path.join(head, "src", "unused.ts"), "const unused = 1;\nexport const kept = 2;\n");
  fs.writeFileSync(path.join(head, "eslint.config.js"), 'throw new Error("untrusted config loaded");\n');
  const diff = ["--- a/src/unused.ts", "+++ b/src/unused.ts", "@@ -0,0 +1,2 @@", "+const unused = 1;", "+export const kept = 2;", ""].join("\n");
  const first = await analyze({ diff, headSnapshot: head });
  const second = await analyze({ diff, headSnapshot: head });
  assert.deepEqual(second, first);
  assert.equal(first.files[0]?.route, "source");
  assert.equal(first.findings.length, 1);
  assert.equal(first.findings[0]?.ruleId, "@typescript-eslint/no-unused-vars");
  assert.equal(first.findings[0]?.path, "src/unused.ts");
  assert.match(first.findings[0]?.id ?? "", /^eslint:@typescript-eslint\/no-unused-vars:src\/unused\.ts:1:/);
});

test("unsupported and generated files stay in the route list", async () => {
  const head = fs.mkdtempSync(path.join(os.tmpdir(), "review-routes-"));
  fs.mkdirSync(path.join(head, "src", "generated"), { recursive: true });
  fs.writeFileSync(path.join(head, "README.md"), "# notes\n");
  fs.writeFileSync(path.join(head, "src", "generated", "api.ts"), "export const n = 1;\n");
  fs.writeFileSync(path.join(head, "src", "native.py"), "print('x')\n");
  const diff = [
    "--- a/README.md",
    "+++ b/README.md",
    "@@ -1 +1 @@",
    "-# old",
    "+# notes",
    "--- a/src/generated/api.ts",
    "+++ b/src/generated/api.ts",
    "@@ -1 +1 @@",
    "-export const n = 0;",
    "+export const n = 1;",
    "--- a/src/native.py",
    "+++ b/src/native.py",
    "@@ -1 +1 @@",
    "-print('y')",
    "+print('x')",
    "",
  ].join("\n");
  const analysis = await analyze({ diff, headSnapshot: head });
  const routes = Object.fromEntries(analysis.files.map((file) => [file.path, file.route]));
  assert.deepEqual(routes, {
    "README.md": "configuration",
    "src/generated/api.ts": "generated",
    "src/native.py": "unsupported",
  });
});
