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
  id?: string;
  kind: "leaf";
  field: string;
  op: MatchOperator;
  value: string | number | boolean | string[] | number[];
}

export interface MatchGroup {
  id?: string;
  kind: "group";
  combinator: "and" | "or" | "not";
  children: MatchNode[];
}

export function nodeId(): string {
  return crypto.randomUUID();
}

export type HydratedLeaf = MatchLeaf & { id: string };
export type HydratedGroup = Omit<MatchGroup, "children"> & {
  id: string;
  children: HydratedNode[];
};
export type HydratedNode = HydratedLeaf | HydratedGroup;

export function hydrateIds(node: MatchNode): HydratedNode {
  if (isLeaf(node)) {
    return { ...node, id: node.id ?? nodeId() };
  }
  return {
    ...node,
    id: node.id ?? nodeId(),
    children: node.children.map(hydrateIds),
  };
}

export type MatchNode = MatchLeaf | MatchGroup;

/** Convenience — create an empty root group (AND). */
export function emptyRoot(): MatchGroup {
  return { id: nodeId(), kind: "group", combinator: "and", children: [] };
}

export function sampleLeaf(): MatchLeaf {
  return { id: nodeId(), kind: "leaf", field: "service", op: "eq", value: "" };
}

export function isLeaf(n: MatchNode): n is MatchLeaf {
  return n.kind === "leaf";
}
export function isGroup(n: MatchNode): n is MatchGroup {
  return n.kind === "group";
}
