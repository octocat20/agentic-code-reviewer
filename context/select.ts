import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ChangedFile } from "../router/analyze.ts";
import { normalizeRelative, routeFor, staysInsideSnapshot } from "../router/paths.ts";
import { RESERVED_MODEL_TOKENS, countTokens } from "./tokens.ts";

export interface ContextFragment {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  contentDigest: string;
  source: "changed" | "import" | "test" | "guidance";
  rank: number;
  tokenCount: number;
  truncated: false;
}

export interface ContextOmission {
  path: string;
  source: ContextFragment["source"];
  rank: number;
  tokenCount: number;
  reason: "budget";
}

export interface ContextPack {
  outcome: "selected" | "insufficient-context";
  reservedTokens: number;
  budgetTokens: number;
  fragments: ContextFragment[];
  omissions: ContextOmission[];
}

interface Candidate {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  source: ContextFragment["source"];
  priority: number;
}

const IMPORT_FROM = /from\s+["'](\.[^"']+)["']/g;
const IMPORT_SIDE = /import\s+["'](\.[^"']+)["']/g;

export function selectContext(input: {
  headSnapshot: string;
  files: ChangedFile[];
  tokenBudget: number;
  reservedTokens?: number;
}): ContextPack {
  const root = path.resolve(input.headSnapshot);
  const reservedTokens = input.reservedTokens ?? RESERVED_MODEL_TOKENS;
  const candidates = rankCandidates(root, input.files);
  const fragments: ContextFragment[] = [];
  const omissions: ContextOmission[] = [];
  let remaining = input.tokenBudget - reservedTokens;
  let outcome: ContextPack["outcome"] = "selected";

  for (const [rank, candidate] of candidates.entries()) {
    const tokenCount = countTokens(candidate.text);
    const fragment = toFragment(candidate, rank, tokenCount);
    const required = candidate.source === "changed";
    if (tokenCount > remaining) {
      omissions.push({
        path: candidate.path,
        source: candidate.source,
        rank,
        tokenCount,
        reason: "budget",
      });
      if (required) {
        outcome = "insufficient-context";
        break;
      }
      continue;
    }
    fragments.push(fragment);
    remaining -= tokenCount;
  }

  return {
    outcome,
    reservedTokens,
    budgetTokens: input.tokenBudget,
    fragments,
    omissions,
  };
}

function rankCandidates(root: string, files: ChangedFile[]): Candidate[] {
  const candidates: Candidate[] = [];
  const changedPaths = new Set<string>();

  for (const file of files) {
    if (file.exclusionReason || file.changeType === "deleted") {
      continue;
    }
    if (file.route !== "source" && file.route !== "test") {
      continue;
    }
    const text = readInside(root, file.path);
    if (text === null) {
      continue;
    }
    changedPaths.add(file.path);
    const lines = splitLines(text);
    const ranges = file.headRanges.length > 0 ? file.headRanges : [{ startLine: 1, endLine: lines.length }];
    for (const range of ranges) {
      candidates.push({
        path: file.path,
        startLine: range.startLine,
        endLine: range.endLine,
        text: lines.slice(range.startLine - 1, range.endLine).join("\n"),
        source: "changed",
        priority: 0,
      });
    }
    for (const spec of importedSpecs(text)) {
      const resolved = resolveImport(root, file.path, spec);
      if (resolved && resolved !== file.path) {
        const imported = readInside(root, resolved);
        if (imported !== null) {
          const importedLines = splitLines(imported);
          candidates.push({
            path: resolved,
            startLine: 1,
            endLine: importedLines.length,
            text: importedLines.join("\n"),
            source: "import",
            priority: 1,
          });
        }
      }
    }
  }

  for (const relative of walkFiles(root, root)) {
    if (changedPaths.has(relative) || routeFor(relative) !== "test") {
      continue;
    }
    const text = readInside(root, relative);
    if (text === null) {
      continue;
    }
    const referencesChanged = importedSpecs(text).some((spec) => {
      const resolved = resolveImport(root, relative, spec);
      return resolved !== null && changedPaths.has(resolved);
    });
    if (!referencesChanged) {
      continue;
    }
    const lines = splitLines(text);
    candidates.push({
      path: relative,
      startLine: 1,
      endLine: lines.length,
      text: lines.join("\n"),
      source: "test",
      priority: 2,
    });
  }

  const guidance = readInside(root, "REVIEW.md");
  if (guidance !== null) {
    const lines = splitLines(guidance);
    candidates.push({
      path: "REVIEW.md",
      startLine: 1,
      endLine: lines.length,
      text: lines.join("\n"),
      source: "guidance",
      priority: 3,
    });
  }

  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = `${candidate.path}:${candidate.startLine}:${candidate.endLine}`;
    const existing = unique.get(key);
    if (!existing || candidate.priority < existing.priority) {
      unique.set(key, candidate);
    }
  }
  return [...unique.values()].sort(
    (left, right) => left.priority - right.priority || left.path.localeCompare(right.path) || left.startLine - right.startLine,
  );
}

function toFragment(candidate: Candidate, rank: number, tokenCount: number): ContextFragment {
  return {
    path: candidate.path,
    startLine: candidate.startLine,
    endLine: candidate.endLine,
    text: candidate.text,
    contentDigest: createHash("sha256").update(candidate.text).digest("hex"),
    source: candidate.source,
    rank,
    tokenCount,
    truncated: false,
  };
}

function importedSpecs(text: string): string[] {
  const specs = new Set<string>();
  for (const pattern of [IMPORT_FROM, IMPORT_SIDE]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        specs.add(match[1]);
      }
    }
  }
  return [...specs];
}

function resolveImport(root: string, fromFile: string, spec: string): string | null {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    const normalized = normalizeRelative(candidate);
    if (!normalized.ok || !staysInsideSnapshot(root, normalized.path)) {
      return null;
    }
    const full = path.join(root, normalized.path);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      return normalized.path;
    }
  }
  return null;
}

function readInside(root: string, relativePath: string): string | null {
  const normalized = normalizeRelative(relativePath);
  if (!normalized.ok || !staysInsideSnapshot(root, normalized.path)) {
    return null;
  }
  const full = path.join(root, normalized.path);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return null;
  }
  return fs.readFileSync(full, "utf8");
}

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function walkFiles(root: string, dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).split(path.sep).join("/");
    if (!staysInsideSnapshot(root, relative)) {
      continue;
    }
    if (entry.isDirectory()) {
      found.push(...walkFiles(root, full));
    } else if (entry.isFile()) {
      found.push(relative);
    }
  }
  return found;
}
