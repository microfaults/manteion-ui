/**
 * AST → OPA rego compiler.
 *
 * Output shape (single-file policy):
 *
 *     package faults.match
 *
 *     default allow := false
 *
 *     allow if {
 *       <leaf expr>
 *       <leaf expr>
 *     }  # AND
 *
 *     allow if { <OR branch 1> }
 *     allow if { <OR branch 2> }
 *
 * A top-level OR is expanded into multiple `allow if {...}` blocks (rego's
 * canonical disjunction). A top-level NOT wraps a single child with `not`.
 * Nested groups compile recursively. Leaves reference `input.<field>`.
 */
import type { MatchGroup, MatchLeaf, MatchNode, MatchOperator } from "./ast";
import { isGroup, isLeaf } from "./ast";

export function compile(root: MatchNode): string {
  const header = "package faults.match\n\ndefault allow := false\n\n";
  const branches = unfoldTopOr(root).map((branch) => {
    const body = compileBody(branch);
    return `allow if {\n${indent(body)}\n}`;
  });
  return header + branches.join("\n\n") + "\n";
}

/** If the root is an OR group, return each child as an independent branch.
 *  Otherwise the whole root is a single branch. */
function unfoldTopOr(root: MatchNode): MatchNode[] {
  if (isGroup(root) && root.combinator === "or") {
    return root.children.length === 0 ? [emptyAnd()] : root.children;
  }
  return [root];
}

function emptyAnd(): MatchGroup {
  return { kind: "group", combinator: "and", children: [] };
}

/** Compile a single branch (AND body). */
function compileBody(node: MatchNode): string {
  if (isLeaf(node)) return compileLeaf(node);
  if (!isGroup(node)) return "true";
  const { combinator, children } = node;
  if (children.length === 0) return "true";
  if (combinator === "and") {
    return children.map(compileBody).join("\n");
  }
  if (combinator === "or") {
    // Nested OR inside AND body — use rego's `any` helper over a set.
    const parts = children.map((c) => `(${compileInlineExpr(c)})`).join(" || ");
    return parts;
  }
  if (combinator === "not") {
    // NOT wraps exactly one child (UI-enforced).
    const [child] = children;
    if (!child) return "true";
    return `not ${compileInlineExpr(child)}`;
  }
  return "true";
}

/** Compile a node as a single-line rego expression (for use inside `||` or `not`). */
function compileInlineExpr(node: MatchNode): string {
  if (isLeaf(node)) return leafExpr(node);
  if (!isGroup(node)) return "true";
  const { combinator, children } = node;
  if (children.length === 0) return "true";
  const parts = children.map(compileInlineExpr);
  if (combinator === "and") return parts.join(" && ");
  if (combinator === "or") return parts.map((p) => `(${p})`).join(" || ");
  if (combinator === "not") return `not ${parts[0] ?? "true"}`;
  return "true";
}

function compileLeaf(leaf: MatchLeaf): string {
  return leafExpr(leaf);
}

function leafExpr(leaf: MatchLeaf): string {
  const field = inputRef(leaf.field);
  const value = literal(leaf.value);
  switch (leaf.op satisfies MatchOperator) {
    case "eq":
      return `${field} == ${value}`;
    case "neq":
      return `${field} != ${value}`;
    case "in":
      return `${field} in ${value}`;
    case "not_in":
      return `not ${field} in ${value}`;
    case "matches":
      return `regex.match(${value}, ${field})`;
    case "starts_with":
      return `startswith(${field}, ${value})`;
    case "ends_with":
      return `endswith(${field}, ${value})`;
    case "gt":
      return `${field} > ${value}`;
    case "gte":
      return `${field} >= ${value}`;
    case "lt":
      return `${field} < ${value}`;
    case "lte":
      return `${field} <= ${value}`;
  }
}

/** `foo.bar` → `input.foo.bar`. Also supports `header.x-trace-id` → `input.header["x-trace-id"]`. */
function inputRef(field: string): string {
  const parts = field.split(".");
  let out = "input";
  for (const part of parts) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part)) out += `.${part}`;
    else out += `["${escapeRegoString(part)}"]`;
  }
  return out;
}

function literal(value: MatchLeaf["value"]): string {
  if (typeof value === "string") return `"${escapeRegoString(value)}"`;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => literal(v as MatchLeaf["value"])).join(", ")}]`;
  }
  return "null";
}

function escapeRegoString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((line) => (line.length ? `  ${line}` : line))
    .join("\n");
}
