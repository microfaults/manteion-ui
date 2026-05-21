/**
 * Workflow client — talks to manteion-go's workflow-definition endpoints:
 *   GET    /api/v1/workflows                  paginated list cards
 *   GET    /api/v1/workflows/{id}             detail view (full DSL tree)
 *   POST   /api/v1/workflows                  create
 *   DELETE /api/v1/workflows/{id}             delete
 *
 * Manteion owns workflow DEFINITIONS (this client); zeus owns workflow
 * EXECUTION (runs, attacks, validation results). For the detail page the
 * UI fans out two parallel queries — one here for the definition, one to
 * /api/v1/zeus/runs?workflow_id=... for live state.
 *
 * Backend models live in manteion-go/internal/model/workflow.go and the
 * DTOs in internal/api/workflow_handler.go. This module is the boundary
 * where the snake_case JSON gets mapped to the UI types.
 */

import {
  PageEnvelope,
  type Workflow as WireWorkflow,
  type WorkflowListItem,
  WorkflowListItemSchema,
  WorkflowSchema,
} from "@/types/api";
import type { Workflow, WorkflowNode, WorkflowSummary } from "../workflow-types";
import { apiClient } from "./client";

const WorkflowListPageSchema = PageEnvelope(WorkflowListItemSchema);

/** Hard-coded until backend Workflow grows a `version` column. The Figma
 *  calls these "DSL v2 workflow definitions" so we render that string. */
const DSL_VERSION = "v2";

function summaryFromListItem(w: WorkflowListItem): WorkflowSummary {
  return {
    id: w.id,
    name: w.name,
    version: DSL_VERSION,
    targets: w.targets,
    estRpsPerVu: w.estimated_rps_per_vu,
    updatedAt: w.updated_at ?? w.created_at,
    description: w.description,
    requestNodeCount: w.request_node_count,
  };
}

function workflowFromWire(w: WireWorkflow): Workflow {
  return {
    ...summaryFromListItem({
      id: w.id,
      name: w.name,
      description: w.description,
      targets: w.targets,
      estimated_rps_per_vu: w.estimated_rps_per_vu,
      // The detail payload omits this; it's a list-only field. Render
      // a tree-walk count once instead of hoping the backend filled it.
      request_node_count: countRequestNodes(w.steps),
      created_at: w.created_at,
      updated_at: w.updated_at,
    }),
    root: parseStepsTree(w.steps),
  };
}

function countRequestNodes(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  const obj = node as { type?: string; children?: unknown[]; child?: unknown };
  switch (obj.type) {
    case "request":
      return 1;
    case "sequence":
    case "parallel":
      return Array.isArray(obj.children)
        ? obj.children.reduce<number>((n, c) => n + countRequestNodes(c), 0)
        : 0;
    case "optional":
    case "delay":
      return obj.child ? countRequestNodes(obj.child) : 0;
    default:
      return Array.isArray(obj.children)
        ? obj.children.reduce<number>((n, c) => n + countRequestNodes(c), 0)
        : 0;
  }
}

/** Coerce the opaque `steps` JSON into the WorkflowNode discriminated union.
 *  We don't run a strict zod schema here because the tree shapes are highly
 *  recursive (sequence/parallel children, optional child) and zod's
 *  discriminated union is awkward with `child` vs `children`. Backend
 *  already validates that `steps` is non-empty JSON; we trust the shape and
 *  fall back to an empty sequence root if something is genuinely missing
 *  so the UI can still render. */
function parseStepsTree(steps: unknown): WorkflowNode {
  if (steps && typeof steps === "object") {
    return steps as WorkflowNode;
  }
  return { type: "sequence", id: "root", children: [] };
}

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  // High enough limit that the picker doesn't paginate today; the API
  // caps at 200 and we'll add proper pagination once the list scales.
  const envelope = await apiClient.get("/api/v1/workflows?limit=200", WorkflowListPageSchema);
  return envelope.data.map(summaryFromListItem).sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteWorkflow(id: string): Promise<void> {
  await apiClient.del(`/api/v1/workflows/${encodeURIComponent(id)}`);
}

export async function getWorkflow(id: string): Promise<Workflow | undefined> {
  try {
    const wf = await apiClient.get(`/api/v1/workflows/${encodeURIComponent(id)}`, WorkflowSchema);
    return workflowFromWire(wf);
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
}

/** Endpoint shape consumed by createWorkflow — kept loose so callers can
 *  pass the raw CatalogEndpoint from the catalog without an intermediate
 *  copy. */
export interface PickedEndpoint {
  id: string;
  service: string;
  method: string;
  path: string;
}

/** A probability gate the runtime evaluates per execution. Wraps a single
 *  child via the DSL `optional` node — kept here as a flat marker on the
 *  step so the picker UI doesn't need a recursive editor.
 *
 *  This is the lever the deprecated "Persona" concept used to provide:
 *  per-step probability + think-time at the node level generalizes to any
 *  DAG-shaped workflow, where a fixed-set persona enum (browser/buyer/...)
 *  did not. See docs/design/figma-changes.md for the rationale. */
export interface OptionalFlag {
  probability: number;
}

/** Leaf step kinds — concrete actions the runtime takes (HTTP request or
 *  pause). Both can be wrapped in an optional gate. */
export type WorkflowLeafInput =
  | { kind: "request"; endpoint: PickedEndpoint; optional?: OptionalFlag }
  | { kind: "delay"; minMs: number; maxMs: number; label?: string; optional?: OptionalFlag };

/** A parallel group runs its children concurrently. Limited to leaves in
 *  v1 (no nested groups) — the DSL allows nesting but the picker UI doesn't
 *  surface it; if we need it later, swap WorkflowLeafInput → WorkflowStepInput. */
export interface WorkflowParallelInput {
  kind: "parallel";
  children: WorkflowLeafInput[];
  optional?: OptionalFlag;
  /** Optional wait policy mirror of the DSL — defaults to all-children. */
  waitPolicy?: "all" | "any" | "n_of_m";
  /** Required when waitPolicy is "n_of_m". */
  n?: number;
}

export type WorkflowStepInput = WorkflowLeafInput | WorkflowParallelInput;

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  /** Ordered steps to splice into a top-level `sequence` tree. When empty,
   *  the backend falls back to a minimal one-request scaffold. */
  steps?: WorkflowStepInput[];
}

interface CreateWorkflowBody {
  id?: string;
  name: string;
  description?: string;
  targets?: string[];
  estimated_rps_per_vu?: number;
  steps?: unknown;
}

export async function createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
  const slug = slugify(input.name);
  if (!slug) throw new Error("Name required");

  const picked = input.steps ?? [];

  // Derive `targets` from request steps' owning services only — delay nodes
  // and parallel-group wrappers don't exercise any service themselves. Fall
  // back to frontend (the load-test entrypoint) when nothing was picked or
  // only delays are present. Targets are metadata only; direct fault
  // injection lives on the Faults page.
  const requestServices: string[] = [];
  for (const step of picked) {
    if (step.kind === "request") requestServices.push(step.endpoint.service);
    else if (step.kind === "parallel") {
      for (const c of step.children) {
        if (c.kind === "request") requestServices.push(c.endpoint.service);
      }
    }
  }
  const targets = requestServices.length > 0 ? Array.from(new Set(requestServices)) : ["frontend"];

  const children = picked.length
    ? picked.map((step, i) => stepToNode(step, slug, i))
    : [{ type: "request", id: `r-${slug}-init`, method: "GET", path: "/" }];

  const body: CreateWorkflowBody = {
    id: slug,
    name: slug,
    description: input.description,
    targets,
    steps: {
      type: "sequence",
      id: "root",
      label: slug,
      children,
    },
  };

  const wf = await apiClient.post("/api/v1/workflows", body, WorkflowSchema);
  return workflowFromWire(wf);
}

/** stepToNode maps a single picker step to its DSL v2 node. Stable per-workflow
 *  ids (slug + index + step-discriminator) keep things deterministic across
 *  resubmits and let us move toward in-place editing later. Optional flags
 *  are lifted into the proper `optional` wrapper here so the picker UI
 *  doesn't have to model the wrapper itself. */
function stepToNode(step: WorkflowStepInput, slug: string, i: number): unknown {
  const inner = innerNode(step, slug, i);
  if (step.optional) {
    return {
      type: "optional",
      id: `o-${slug}-${i}`,
      probability: clampProbability(step.optional.probability),
      child: inner,
    };
  }
  return inner;
}

function innerNode(step: WorkflowStepInput, slug: string, i: number): unknown {
  if (step.kind === "delay") {
    return {
      type: "delay",
      id: `d-${slug}-${i}`,
      ...(step.label ? { label: step.label } : {}),
      minMs: step.minMs,
      maxMs: step.maxMs,
    };
  }
  if (step.kind === "parallel") {
    return {
      type: "parallel",
      id: `p-${slug}-${i}`,
      ...(step.waitPolicy ? { waitPolicy: step.waitPolicy } : {}),
      ...(step.waitPolicy === "n_of_m" && typeof step.n === "number" ? { n: step.n } : {}),
      children: step.children.map((c, j) => stepToNode(c, slug, i * 100 + j)),
    };
  }
  return {
    type: "request",
    id: `r-${slug}-${i}-${step.endpoint.id}`,
    method: step.endpoint.method,
    path: step.endpoint.path,
  };
}

function clampProbability(p: number): number {
  if (!Number.isFinite(p)) return 0.5;
  return Math.max(0, Math.min(1, p));
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: unknown }).status === 404
  );
}

export type { Workflow, WorkflowNode, WorkflowSummary };
