/**
 * Pure step-tree logic for the workflow builder (extracted from
 * routes/workflows/index.tsx so it is unit-testable). The tree is a flat-ish
 * two-level structure: top-level `PickedStep[]` where a step is a leaf
 * (request | delay) or a `parallel` group of leaves — no nested groups in v1.
 */
import type { WorkflowLeafInput, WorkflowStepInput } from "@/lib/api/workflows";
import type { CatalogEndpoint } from "@/types/api";

/** Probability gate the workflow runtime applies to an optional step. */
export type OptionalFlag = { probability: number };

/** A leaf step is either an HTTP request or a think-time delay. */
export type LeafStep =
  | { rowId: string; kind: "request"; endpoint: CatalogEndpoint; optional?: OptionalFlag }
  | { rowId: string; kind: "delay"; minMs: number; maxMs: number; optional?: OptionalFlag };

/** A parallel group runs its children concurrently. Always ≥2 children. */
export type GroupStep = {
  rowId: string;
  kind: "parallel";
  children: LeafStep[];
  optional?: OptionalFlag;
};

export type PickedStep = LeafStep | GroupStep;

export function isLeaf(s: PickedStep): s is LeafStep {
  return s.kind === "request" || s.kind === "delay";
}

/** Every endpoint id present anywhere in the tree (top level or in groups). */
export function pickedEndpointIds(tree: PickedStep[]): Set<string> {
  const ids = new Set<string>();
  for (const s of tree) {
    if (s.kind === "request") ids.add(s.endpoint.id);
    else if (s.kind === "parallel") {
      for (const c of s.children) if (c.kind === "request") ids.add(c.endpoint.id);
    }
  }
  return ids;
}

/**
 * Depth-first, post-order walk of an endpoint's declared deps so the result
 * has prerequisites before dependents — exactly the order the workflow's
 * sequence node should run them. Already-seen ids short-circuit so cycles
 * don't loop and shared deps aren't duplicated.
 */
export function expandWithDeps(
  target: CatalogEndpoint,
  byId: Map<string, CatalogEndpoint>,
): CatalogEndpoint[] {
  const out: CatalogEndpoint[] = [];
  const seen = new Set<string>();
  const visit = (e: CatalogEndpoint) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    for (const depId of e.depends_on ?? []) {
      const dep = byId.get(depId);
      if (dep) visit(dep);
    }
    out.push(e);
  };
  visit(target);
  return out;
}

/**
 * If the endpoint is picked anywhere, remove every instance of it (unwrapping
 * groups left degenerate). Otherwise append it at the top level, prepending
 * any missing transitive deps in topological order.
 */
export function togglePick(
  tree: PickedStep[],
  endpoint: CatalogEndpoint,
  byId: Map<string, CatalogEndpoint>,
  newRowId: () => string,
): PickedStep[] {
  const have = pickedEndpointIds(tree);
  if (have.has(endpoint.id)) {
    return tree
      .map((s): PickedStep | null => {
        if (s.kind === "parallel") {
          const kids = s.children.filter(
            (c) => !(c.kind === "request" && c.endpoint.id === endpoint.id),
          );
          if (kids.length === s.children.length) return s;
          if (kids.length >= 2) return { ...s, children: kids };
          return kids[0] ?? null;
        }
        return s.kind === "request" && s.endpoint.id === endpoint.id ? null : s;
      })
      .filter((s): s is PickedStep => s !== null);
  }
  const additions: LeafStep[] = expandWithDeps(endpoint, byId)
    .filter((x) => !have.has(x.id))
    .map((e) => ({ rowId: newRowId(), kind: "request", endpoint: e }));
  return [...tree, ...additions];
}

export function findRow(
  tree: PickedStep[],
  rowId: string,
): { step: PickedStep; parent: GroupStep | null; index: number } | null {
  for (let i = 0; i < tree.length; i++) {
    const s = tree[i];
    if (!s) continue;
    if (s.rowId === rowId) return { step: s, parent: null, index: i };
    if (s.kind === "parallel") {
      for (let j = 0; j < s.children.length; j++) {
        const c = s.children[j];
        if (c?.rowId === rowId) return { step: c, parent: s, index: j };
      }
    }
  }
  return null;
}

/** Replace one row anywhere in the tree, preserving parent group identity. */
export function mapRow(
  tree: PickedStep[],
  rowId: string,
  fn: (s: PickedStep) => PickedStep,
): PickedStep[] {
  return tree.map((s) => {
    if (s.rowId === rowId) return fn(s);
    if (s.kind === "parallel") {
      const updated = s.children.map((c) => (c.rowId === rowId ? (fn(c) as LeafStep) : c));
      return { ...s, children: updated };
    }
    return s;
  });
}

/** Remove one row anywhere; groups left with <2 children unwrap or drop. */
export function removeRow(tree: PickedStep[], rowId: string): PickedStep[] {
  const out: PickedStep[] = [];
  for (const s of tree) {
    if (s.rowId === rowId) continue;
    if (s.kind === "parallel") {
      const kids = s.children.filter((c) => c.rowId !== rowId);
      if (kids.length === s.children.length) out.push(s);
      else if (kids.length >= 2) out.push({ ...s, children: kids });
      else if (kids.length === 1 && kids[0]) out.push(kids[0]);
      // 0 children → drop entirely
    } else {
      out.push(s);
    }
  }
  return out;
}

/** Move a row up/down within its parent (top level or inside its group). */
export function moveRow(tree: PickedStep[], rowId: string, dir: -1 | 1): PickedStep[] {
  const found = findRow(tree, rowId);
  if (!found) return tree;
  const swap = <T>(arr: T[], i: number, j: number): T[] => {
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    const a = next[i];
    const b = next[j];
    if (!a || !b) return arr;
    next[i] = b;
    next[j] = a;
    return next;
  };
  if (found.parent === null) return swap(tree, found.index, found.index + dir);
  const parentRowId = found.parent.rowId;
  return tree.map((s) => {
    if (s.rowId !== parentRowId || s.kind !== "parallel") return s;
    return { ...s, children: swap(s.children, found.index, found.index + dir) };
  });
}

/**
 * Wrap the selected top-level leaves into one parallel group at the position
 * of the first selected row. Only top-level leaves are eligible (no nested
 * groups in v1); returns the tree unchanged when fewer than two qualify.
 */
export function groupSelected(
  tree: PickedStep[],
  selected: ReadonlySet<string>,
  newRowId: () => string,
): PickedStep[] {
  if (selected.size < 2) return tree;
  const eligible: LeafStep[] = [];
  const positions: number[] = [];
  tree.forEach((s, i) => {
    if (selected.has(s.rowId) && isLeaf(s)) {
      eligible.push(s);
      positions.push(i);
    }
  });
  if (eligible.length < 2) return tree;
  const insertAt = positions[0] ?? 0;
  const remaining = tree.filter((_, i) => !positions.includes(i));
  const group: GroupStep = { rowId: newRowId(), kind: "parallel", children: eligible };
  const next = [...remaining];
  next.splice(insertAt, 0, group);
  return next;
}

/** Replace a parallel group with its children, restoring sequence order. */
export function ungroup(tree: PickedStep[], groupRowId: string): PickedStep[] {
  const out: PickedStep[] = [];
  for (const s of tree) {
    if (s.rowId === groupRowId && s.kind === "parallel") out.push(...s.children);
    else out.push(s);
  }
  return out;
}

/** Convert a picker row into the API client's wire-shaped step (drops rowIds). */
export function pickedToStepInput(s: PickedStep): WorkflowStepInput {
  if (s.kind === "delay") {
    return { kind: "delay", minMs: s.minMs, maxMs: s.maxMs, optional: s.optional };
  }
  if (s.kind === "request") {
    return { kind: "request", endpoint: s.endpoint, optional: s.optional };
  }
  return {
    kind: "parallel",
    optional: s.optional,
    children: s.children.map(
      (c): WorkflowLeafInput =>
        c.kind === "delay"
          ? { kind: "delay", minMs: c.minMs, maxMs: c.maxMs, optional: c.optional }
          : { kind: "request", endpoint: c.endpoint, optional: c.optional },
    ),
  };
}

/** Draft-level checks the submit handler runs before createWorkflow. */
export function validateWorkflowDraft(name: string, steps: PickedStep[]): string[] {
  const issues: string[] = [];
  if (!name.trim()) issues.push("Name is required.");
  if (steps.length === 0) {
    issues.push("Add at least one step — a workflow with no steps generates no load.");
  }

  const leaves: LeafStep[] = [];
  for (const s of steps) {
    if (s.kind === "parallel") {
      if (s.children.length < 2) issues.push("Parallel groups need at least two steps.");
      leaves.push(...s.children);
    } else {
      leaves.push(s);
    }
    if (s.optional && (s.optional.probability < 0 || s.optional.probability > 1)) {
      issues.push("Optional probability must be between 0 and 1.");
    }
  }
  for (const leaf of leaves) {
    if (leaf.kind === "delay") {
      if (leaf.minMs < 0 || leaf.maxMs < 0) issues.push("Delay bounds must be non-negative.");
      if (leaf.minMs > leaf.maxMs) issues.push("Delay min must be ≤ max.");
    }
    if (leaf.optional && (leaf.optional.probability < 0 || leaf.optional.probability > 1)) {
      issues.push("Optional probability must be between 0 and 1.");
    }
  }
  return issues;
}
