/**
 * DSL v2 workflow types. Mirrors the shape of the workflow editor in the
 * Figma source of truth ("MicroService Fault Testing Kit (Copy)"). These
 * types are decoupled from the wire schema in `types/api.ts` so the picker
 * UI can evolve independently of the server payload.
 *
 * Per-step probability + think-time is what folded out of the deprecated
 * "Persona" concept: a customer-archetype enum (browser/buyer/...) didn't
 * generalize across arbitrary frontend/backend DAGs, but node-level
 * `optional.probability` + `delay.minMs/maxMs` does.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type WaitPolicy = "all" | "any" | "n_of_m";

export interface RequestNode {
  type: "request";
  id: string;
  method: HttpMethod;
  path: string;
  /** Variable to bind from response (e.g. "session_id"). */
  extract?: string;
  retries?: number;
}

export interface DelayNode {
  type: "delay";
  id: string;
  /** Friendly label like "think (persona)". */
  label?: string;
  minMs?: number;
  maxMs?: number;
}

export interface SequenceNode {
  type: "sequence";
  id: string;
  label?: string;
  children: WorkflowNode[];
}

export interface ParallelNode {
  type: "parallel";
  id: string;
  label?: string;
  waitPolicy: WaitPolicy;
  /** Only used when waitPolicy === "n_of_m". */
  n?: number;
  children: WorkflowNode[];
}

export interface OptionalNode {
  type: "optional";
  id: string;
  label?: string;
  /** Probability the child executes [0, 1]. */
  probability: number;
  child: WorkflowNode;
}

export type WorkflowNode = RequestNode | DelayNode | SequenceNode | ParallelNode | OptionalNode;

/** UI-side projection of GET /api/v1/workflows list rows. The wire shape
 *  (snake_case, separate created/updated timestamps) lives in
 *  `types/api.ts`; this struct is what the cards consume. */
export interface WorkflowSummary {
  id: string;
  name: string;
  /** Major DSL version, e.g. "v2". Backend doesn't model versioning yet; the
   *  UI hard-codes "v2" until /api/v1/workflows starts returning it. */
  version: string;
  /** Services this workflow exercises. */
  targets: string[];
  /** Estimated requests-per-second per VU. */
  estRpsPerVu: number;
  /** ISO timestamp. Backend currently exposes only `created_at`, surfaced as
   *  the card's "updated" label until an explicit update timestamp lands. */
  updatedAt: string;
  description?: string;
  requestNodeCount: number;
}

/** Full workflow served by GET /api/v1/workflows/{id}. */
export interface Workflow extends WorkflowSummary {
  root: WorkflowNode;
}

/** Recursively count request nodes — what the card subtitle says "N request nodes". */
export function countRequestNodes(node: WorkflowNode): number {
  switch (node.type) {
    case "request":
      return 1;
    case "delay":
      return 0;
    case "sequence":
    case "parallel":
      return node.children.reduce((sum, c) => sum + countRequestNodes(c), 0);
    case "optional":
      return countRequestNodes(node.child);
  }
}
