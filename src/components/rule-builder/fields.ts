import catalog from "@/config/match-fields.json";
/**
 * Field catalog for the rule builder.
 * Known fields get typed operators + optional enum values; unknown fields
 * (typed free-form by the operator) default to string ops.
 *
 * The catalog itself lives in src/config/match-fields.json so it can grow
 * without code changes. The types and helpers stay here.
 */
import type { MatchOperator } from "@/lib/rego/ast";

export interface FieldSpec {
  name: string;
  label: string;
  kind: "string" | "number" | "enum";
  /** Operators allowed on this field. */
  ops: MatchOperator[];
  /** Enum values (only for kind="enum"). */
  values?: string[];
  description?: string;
}

const stringOps: MatchOperator[] = [
  "eq",
  "neq",
  "in",
  "not_in",
  "matches",
  "starts_with",
  "ends_with",
];

export const KNOWN_FIELDS: FieldSpec[] = catalog as FieldSpec[];

/** Lookup a field spec; fall back to a free-form string field. */
export function fieldSpec(name: string): FieldSpec {
  const known = KNOWN_FIELDS.find((f) => f.name === name);
  if (known) return known;
  return { name, label: name, kind: "string", ops: stringOps };
}

/** Operators allowed on a leaf, given the current field. */
export function operatorsForField(field: string): MatchOperator[] {
  return fieldSpec(field).ops;
}

export const OPERATOR_LABELS: Record<MatchOperator, string> = {
  eq: "=",
  neq: "≠",
  in: "in",
  not_in: "not in",
  matches: "matches",
  starts_with: "starts with",
  ends_with: "ends with",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};
