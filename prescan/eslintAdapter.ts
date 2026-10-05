import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

export interface StaticFinding {
  id: string;
  adapter: "eslint";
  ruleId: string;
  path: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  message: string;
  configDigest: string;
}

const CONFIG_PATH = fileURLToPath(new URL("./eslint.config.js", import.meta.url));

export function trustedConfigDigest(): string {
  return createHash("sha256").update(fs.readFileSync(CONFIG_PATH)).digest("hex");
}

export async function lintTrusted(snapshotRoot: string, relativePaths: string[]): Promise<StaticFinding[]> {
  if (relativePaths.length === 0) {
    return [];
  }
  const configDigest = trustedConfigDigest();
  const eslint = new ESLint({
    cwd: snapshotRoot,
    overrideConfigFile: CONFIG_PATH,
    ignore: false,
  });
  const results = await eslint.lintFiles(relativePaths.map((relative) => path.join(snapshotRoot, relative)));
  const findings: StaticFinding[] = [];
  for (const result of results) {
    const relative = path.relative(snapshotRoot, result.filePath);
    for (const message of result.messages) {
      if (!message.ruleId || message.line === undefined) {
        continue;
      }
      const column = message.column ?? 0;
      findings.push({
        id: `eslint:${message.ruleId}:${relative}:${message.line}:${column}`,
        adapter: "eslint",
        ruleId: message.ruleId,
        path: relative,
        line: message.line,
        column,
        severity: message.severity === 2 ? "error" : "warning",
        message: message.message,
        configDigest,
      });
    }
  }
  findings.sort((left, right) =>
    left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column || left.ruleId.localeCompare(right.ruleId),
  );
  return findings;
}
