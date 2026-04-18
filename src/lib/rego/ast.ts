/**
 * Match-criteria AST.
 * Leaves are `{field, op, value}` conditions; groups combine children with and/or/not.
 * This is the in-UI model for the rule builder; it round-trips to rego via
 * `compile.ts` and (best-effort) back via `parse.ts`.
 */
export type MatchOperator =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "matches"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export interface MatchLeaf {
  kind: "leaf";
  field: string;
  op: MatchOperator;
  value: string | number | boolean | string[] | number[];
}

export interface MatchGroup {
  kind: "group";
  combinator: "and" | "or" | "not";
  children: MatchNode[];
}

export type MatchNode = MatchLeaf | MatchGroup;

/** Convenience — create an empty root group (AND). */
export function emptyRoot(): MatchGroup {
  return { kind: "group", combinator: "and", children: [] };
}

/** A single sample leaf for initial form state. */
export function sampleLeaf(): MatchLeaf {
  return { kind: "leaf", field: "service", op: "eq", value: "" };
}

export function isLeaf(n: MatchNode): n is MatchLeaf {
  return n.kind === "leaf";
}
export function isGroup(n: MatchNode): n is MatchGroup {
  return n.kind === "group";
}
