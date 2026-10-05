export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

export interface ParsedDiffFile {
  oldPath: string | null;
  newPath: string | null;
  hunks: Hunk[];
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function pathToken(rest: string): string | null {
  const token = rest.trim().split("\t")[0] ?? "";
  if (token === "/dev/null") {
    return null;
  }
  if (token.startsWith("a/") || token.startsWith("b/")) {
    return token.slice(2);
  }
  return token;
}

export function parseUnifiedDiff(diff: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  let current: ParsedDiffFile | null = null;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("--- ")) {
      if (current) {
        files.push(current);
      }
      current = { oldPath: pathToken(line.slice(4)), newPath: null, hunks: [] };
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith("+++ ")) {
      current.newPath = pathToken(line.slice(4));
      continue;
    }
    const match = HUNK.exec(line);
    if (match) {
      current.hunks.push({
        oldStart: Number(match[1]),
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newCount: match[4] === undefined ? 1 : Number(match[4]),
      });
    }
  }
  if (current) {
    files.push(current);
  }
  return files;
}

export function lineRanges(start: number, count: number): { startLine: number; endLine: number }[] {
  if (count <= 0) {
    return [];
  }
  return [{ startLine: start, endLine: start + count - 1 }];
}
