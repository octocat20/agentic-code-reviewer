import fs from "node:fs";
import path from "node:path";

export type Route = "source" | "test" | "configuration" | "generated" | "unsupported" | "excluded";

export interface NormalizedPath {
  ok: boolean;
  path: string;
  reason?: "path-escape" | "invalid-path";
}

const TEST_FILE = /(?:^|\/)(?:__tests__\/.+|.+\.(?:test|spec)\.tsx?)$/;
const GENERATED_FILE = /(?:^|\/)generated\/|\.generated\.tsx?$/;
const SOURCE_FILE = /\.tsx?$/;
const CONFIG_FILE = /\.(?:json|ya?ml|md)$/;

export function normalizeRelative(input: string): NormalizedPath {
  if (input.includes("\0") || input.startsWith("/")) {
    return { ok: false, path: input, reason: "invalid-path" };
  }
  const parts: string[] = [];
  for (const part of input.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length === 0) {
        return { ok: false, path: input, reason: "path-escape" };
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  if (parts.length === 0) {
    return { ok: false, path: input, reason: "invalid-path" };
  }
  return { ok: true, path: parts.join("/") };
}

export function routeFor(relativePath: string): Route {
  if (GENERATED_FILE.test(relativePath)) {
    return "generated";
  }
  if (TEST_FILE.test(relativePath)) {
    return "test";
  }
  if (CONFIG_FILE.test(relativePath)) {
    return "configuration";
  }
  if (SOURCE_FILE.test(relativePath)) {
    return "source";
  }
  return "unsupported";
}

export function staysInsideSnapshot(snapshotRoot: string, relativePath: string): boolean {
  const root = fs.realpathSync(snapshotRoot);
  const lexical = path.resolve(root, relativePath);
  const lexicalRelative = path.relative(root, lexical);
  if (lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative)) {
    return false;
  }
  if (!fs.existsSync(lexical)) {
    return true;
  }
  const real = fs.realpathSync(lexical);
  const realRelative = path.relative(root, real);
  return !realRelative.startsWith("..") && !path.isAbsolute(realRelative);
}
