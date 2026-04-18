/**
 * Field catalog for the rule builder.
 * Known fields get typed operators + optional enum values; unknown fields
 * (typed free-form by the operator) default to string ops.
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
const numericOps: MatchOperator[] = ["eq", "neq", "gt", "gte", "lt", "lte"];

export const KNOWN_FIELDS: FieldSpec[] = [
  {
    name: "service",
    label: "Service",
    kind: "string",
    ops: stringOps,
    description: "Service name from the SDK registration.",
  },
  {
    name: "injection_point",
    label: "Injection point",
    kind: "enum",
    ops: ["eq", "neq", "in", "not_in"],
    values: ["ingress", "egress", "transient", "custom"],
    description: "Where in the request lifecycle atropos applies the rule.",
  },
  {
    name: "atropos.workflow",
    label: "atropos.workflow",
    kind: "string",
    ops: stringOps,
    description: "Workflow identifier (e.g. browse, checkout).",
  },
  {
    name: "tenant",
    label: "Tenant",
    kind: "string",
    ops: stringOps,
  },
  {
    name: "method",
    label: "HTTP method",
    kind: "enum",
    ops: ["eq", "neq", "in", "not_in"],
    values: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
  },
  {
    name: "path",
    label: "HTTP path",
    kind: "string",
    ops: stringOps,
  },
  {
    name: "priority",
    label: "Priority",
    kind: "number",
    ops: numericOps,
  },
];

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
