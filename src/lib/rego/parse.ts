/**
 * Rego → AST parser (BEST-EFFORT, intentionally narrow).
 *
 * We accept only the subset of rego that `compile.ts` emits:
 *   - package header (ignored for shape)
 *   - `default allow := false` (ignored)
 *   - one or more `allow if { ... }` blocks (top-level OR if >1)
 *   - inside each block, newline-separated leaf expressions AND-combined
 *   - supported leaf shapes: `input.x.y == "v"`, `... != ...`, `... in [...]`,
 *     `not <leaf>`, `startswith(..., "..")`, `endswith(..., "..")`,
 *     `regex.match("re", input.x)`
 *
 * If anything falls outside this grammar, we return `{ custom: true, raw }`
 * and the UI's rule editor switches to "rego-only" mode.
 */
import type { MatchGroup, MatchLeaf, MatchNode, MatchOperator } from "./ast";

export interface ParseOk {
  ok: true;
  ast: MatchNode;
}
export interface ParseCustom {
  ok: false;
  reason: string;
  raw: string;
}
export type ParseResult = ParseOk | ParseCustom;

export function parse(rego: string): ParseResult {
  try {
    const stripped = rego
      .replace(/^package\s+[^\n]+\n/m, "")
      .replace(/^\s*default\s+allow\s*:=\s*false\s*\n/m, "")
      .trim();

    const branches = extractAllowBranches(stripped);
    if (branches.length === 0) {
      return { ok: false, reason: "no `allow if` branches found", raw: rego };
    }
    const branchAsts: MatchNode[] = [];
    for (const body of branches) {
      const parsed = parseBranchBody(body);
      if (!parsed) {
        return {
          ok: false,
          reason: `unsupported expression in branch: ${truncate(body)}`,
          raw: rego,
        };
      }
      branchAsts.push(parsed);
    }
    if (branchAsts.length === 1) {
      const only = branchAsts[0] as MatchNode;
      return { ok: true, ast: only };
    }
    const root: MatchGroup = {
      kind: "group",
      combinator: "or",
      children: branchAsts,
    };
    return { ok: true, ast: root };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      raw: rego,
    };
  }
}

function extractAllowBranches(s: string): string[] {
  const branches: string[] = [];
  const re = /allow\s+if\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null = re.exec(s);
  while (m !== null) {
    branches.push((m[1] ?? "").trim());
    m = re.exec(s);
  }
  return branches;
}

function parseBranchBody(body: string): MatchNode | null {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { kind: "group", combinator: "and", children: [] };
  }
  const leaves: MatchNode[] = [];
  for (const line of lines) {
    const leaf = parseLine(line);
    if (!leaf) return null;
    leaves.push(leaf);
  }
  if (leaves.length === 1) return leaves[0] as MatchNode;
  return { kind: "group", combinator: "and", children: leaves };
}

function parseLine(line: string): MatchNode | null {
  // NOT
  if (line.startsWith("not ")) {
    const child = parseLine(line.slice(4).trim());
    if (!child) return null;
    return { kind: "group", combinator: "not", children: [child] };
  }
  // regex.match("re", input.x)
  let m = /^regex\.match\(\s*"([^"]*)"\s*,\s*(input(?:\.[a-zA-Z0-9_]+|\["[^"]*"\])+)\s*\)$/.exec(
    line,
  );
  if (m) {
    return leaf(unref(m[2] ?? ""), "matches", m[1] ?? "");
  }
  // startswith(input.x, "v")
  m = /^startswith\(\s*(input(?:\.[a-zA-Z0-9_]+|\["[^"]*"\])+)\s*,\s*"([^"]*)"\s*\)$/.exec(
    line,
  );
  if (m) {
    return leaf(unref(m[1] ?? ""), "starts_with", m[2] ?? "");
  }
  // endswith(input.x, "v")
  m = /^endswith\(\s*(input(?:\.[a-zA-Z0-9_]+|\["[^"]*"\])+)\s*,\s*"([^"]*)"\s*\)$/.exec(
    line,
  );
  if (m) {
    return leaf(unref(m[1] ?? ""), "ends_with", m[2] ?? "");
  }
  // input.x in [...]
  m = /^(input(?:\.[a-zA-Z0-9_]+|\["[^"]*"\])+)\s+in\s+\[(.*)\]$/.exec(line);
  if (m) {
    const arr = parseArrayLiteral(m[2] ?? "");
    if (arr == null) return null;
    return leaf(unref(m[1] ?? ""), "in", arr);
  }
  // input.x <op> <value>
  m = /^(input(?:\.[a-zA-Z0-9_]+|\["[^"]*"\])+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(
    line,
  );
  if (m) {
    const opMap: Record<string, MatchOperator> = {
      "==": "eq",
      "!=": "neq",
      ">": "gt",
      ">=": "gte",
      "<": "lt",
      "<=": "lte",
    };
    const op = opMap[m[2] ?? ""];
    if (!op) return null;
    const parsedValue = parseScalar(m[3] ?? "");
    if (parsedValue === undefined) return null;
    return leaf(unref(m[1] ?? ""), op, parsedValue);
  }
  return null;
}

function leaf(
  field: string,
  op: MatchOperator,
  value: MatchLeaf["value"],
): MatchLeaf {
  return { kind: "leaf", field, op, value };
}

function unref(inputRef: string): string {
  const m = /^input(.*)$/.exec(inputRef);
  if (!m) return inputRef;
  const rest = m[1] ?? "";
  const parts: string[] = [];
  const re = /\.([a-zA-Z_][a-zA-Z0-9_]*)|\["([^"]*)"\]/g;
  let match: RegExpExecArray | null = re.exec(rest);
  while (match !== null) {
    parts.push(match[1] ?? match[2] ?? "");
    match = re.exec(rest);
  }
  return parts.join(".");
}

function parseScalar(s: string): MatchLeaf["value"] | undefined {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  if (t === "true") return true;
  if (t === "false") return false;
  const n = Number(t);
  if (!Number.isNaN(n)) return n;
  return undefined;
}

function parseArrayLiteral(inner: string): string[] | number[] | null {
  const parts = splitCsv(inner).map((p) => parseScalar(p));
  if (parts.some((p) => p === undefined)) return null;
  if (parts.every((p) => typeof p === "string"))
    return parts as unknown as string[];
  if (parts.every((p) => typeof p === "number"))
    return parts as unknown as number[];
  return null;
}

function splitCsv(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  let inStr = false;
  for (const ch of s) {
    if (inStr) {
      buf += ch;
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      buf += ch;
      continue;
    }
    if (ch === "[" || ch === "(") {
      depth++;
      buf += ch;
      continue;
    }
    if (ch === "]" || ch === ")") {
      depth--;
      buf += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function truncate(s: string, n = 60) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
