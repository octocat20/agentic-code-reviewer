import path from "node:path";
import { lineRanges, parseUnifiedDiff } from "./diff.ts";
import { normalizeRelative, routeFor, staysInsideSnapshot, type Route } from "./paths.ts";
import { lintTrusted, type StaticFinding } from "../prescan/eslintAdapter.ts";

export interface ChangedFile {
  path: string;
  changeType: "added" | "modified" | "deleted" | "renamed";
  baseRanges: { startLine: number; endLine: number }[];
  headRanges: { startLine: number; endLine: number }[];
  language: string;
  route: Route;
  exclusionReason?: string;
}

export interface Analysis {
  files: ChangedFile[];
  findings: StaticFinding[];
}

export async function analyze(input: { diff: string; headSnapshot: string }): Promise<Analysis> {
  const files: ChangedFile[] = [];
  for (const parsed of parseUnifiedDiff(input.diff)) {
    const displayPath = parsed.newPath ?? parsed.oldPath ?? "";
    const normalized = normalizeRelative(displayPath);
    const baseRanges = parsed.hunks.flatMap((hunk) => lineRanges(hunk.oldStart, hunk.oldCount));
    const headRanges = parsed.hunks.flatMap((hunk) => lineRanges(hunk.newStart, hunk.newCount));
    let changeType: ChangedFile["changeType"] = "modified";
    if (parsed.oldPath === null && parsed.newPath !== null) {
      changeType = "added";
    } else if (parsed.newPath === null && parsed.oldPath !== null) {
      changeType = "deleted";
    } else if (parsed.oldPath !== parsed.newPath) {
      changeType = "renamed";
    }

    if (!normalized.ok) {
      files.push({
        path: displayPath,
        changeType,
        baseRanges,
        headRanges: changeType === "deleted" ? [] : headRanges,
        language: "unknown",
        route: "excluded",
        exclusionReason: normalized.reason,
      });
      continue;
    }

    const inside = staysInsideSnapshot(input.headSnapshot, normalized.path);
    const route = inside ? routeFor(normalized.path) : "excluded";
    files.push({
      path: normalized.path,
      changeType,
      baseRanges,
      headRanges: changeType === "deleted" ? [] : headRanges,
      language: languageFor(normalized.path),
      route,
      ...(inside ? {} : { exclusionReason: "symlink-escape" as const }),
    });
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  const lintPaths = files
    .filter((file) => file.route === "source" || file.route === "test")
    .filter((file) => file.changeType !== "deleted")
    .map((file) => file.path);
  const findings = await lintTrusted(path.resolve(input.headSnapshot), lintPaths);
  return { files, findings };
}

function languageFor(relativePath: string): string {
  if (relativePath.endsWith(".tsx")) {
    return "tsx";
  }
  if (relativePath.endsWith(".ts")) {
    return "typescript";
  }
  if (relativePath.endsWith(".json")) {
    return "json";
  }
  if (relativePath.endsWith(".md")) {
    return "markdown";
  }
  return "unknown";
}
