import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { catalogApi, workflowsApi } from "@/lib/api";
import type { WorkflowLeafInput, WorkflowStepInput } from "@/lib/api/workflows";
import { cn, formatRelative } from "@/lib/utils";
import type { WorkflowSummary } from "@/lib/workflow-types";
import type { CatalogEndpoint } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  GitFork,
  GripVertical,
  Percent,
  Plus,
  Search,
  Timer,
  Ungroup,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/workflows/")({
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["workflows"],
    queryFn: workflowsApi.listWorkflows,
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (w) =>
        w.name.toLowerCase().includes(needle) ||
        w.targets.some((t) => t.toLowerCase().includes(needle)),
    );
  }, [data, query]);

  return (
    <>
      <Topbar
        breadcrumbs={["online-boutique", "Workflows"]}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New workflow
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            DSL v2 workflow definitions for load generation.
          </p>
        </div>

        <div className="mb-4 mt-6 flex max-w-md items-center gap-2">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search workflows…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Could not load workflows.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query
              ? `No workflows match "${query}".`
              : "No workflows yet. Create one with New workflow."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((wf) => (
              <WorkflowCard key={wf.id} workflow={wf} />
            ))}
          </div>
        )}
      </div>

      <NewWorkflowDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function WorkflowCard({ workflow }: { workflow: WorkflowSummary }) {
  const requestCount = workflow.requestNodeCount;
  const visibleTargets = workflow.targets.slice(0, 3);
  const extra = workflow.targets.length - visibleTargets.length;

  return (
    <Link to="/workflows/$workflowId" params={{ workflowId: workflow.id }} className="group block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-mono text-sm font-semibold">{workflow.name}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {workflow.version} · {requestCount} request {requestCount === 1 ? "node" : "nodes"}
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>

          <div className="flex flex-wrap gap-1">
            {visibleTargets.map((t) => (
              <Badge key={t} variant="secondary" className="font-mono text-[10px]">
                {t}
              </Badge>
            ))}
            {extra > 0 ? (
              <Badge variant="secondary" className="font-mono text-[10px]">
                +{extra}
              </Badge>
            ) : null}
          </div>

          <div className="mt-auto flex items-end justify-between text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                est. RPS/VU
              </div>
              <div className="font-mono text-base font-semibold tabular-nums">
                {workflow.estRpsPerVu.toFixed(1)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Updated
              </div>
              <div className="font-mono text-muted-foreground">
                {formatRelative(workflow.updatedAt)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Optional wraps any step with a probability gate at execution time. We
 *  keep it as a flag on the step itself rather than a separate node kind so
 *  the picked list stays a flat-ish two-level tree (top-level `Step` array
 *  with optional `parallel` groups containing leaves). createWorkflow lifts
 *  the flag into the proper DSL `optional` wrapper at submit time. */
type OptionalFlag = { probability: number };

/** A leaf step is either an HTTP request or a think-time delay. Both can
 *  carry an `optional` flag that the workflow runtime gates by probability. */
type LeafStep =
  | { rowId: string; kind: "request"; endpoint: CatalogEndpoint; optional?: OptionalFlag }
  | { rowId: string; kind: "delay"; minMs: number; maxMs: number; optional?: OptionalFlag };

/** A parallel group runs its children concurrently. We deliberately don't
 *  allow nested groups (parallel-in-parallel) in v1 — keeps the UI a
 *  predictable two-level list. The DSL itself supports arbitrary nesting; we
 *  lift this restriction by replacing the union if/when there's a real need. */
type GroupStep = {
  rowId: string;
  kind: "parallel";
  children: LeafStep[];
  optional?: OptionalFlag;
};

/** Top-level entries in the picked column. Either a leaf or a group. */
type PickedStep = LeafStep | GroupStep;

/** Convert a picker row into the API client's wire-shaped step. Strips the
 *  picker-only `rowId` and reuses the LeafStep optional flag verbatim. */
function pickedToStepInput(s: PickedStep): WorkflowStepInput {
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

function NewWorkflowDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<PickedStep[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Stable row id generator. Refs (vs. useState) so increments don't
  // re-render and ids stay monotonically unique even when React batches.
  const rowIdSeq = useRef(0);
  const newRowId = () => `row-${++rowIdSeq.current}`;

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const catalog = useQuery({
    queryKey: ["catalog-endpoints"],
    queryFn: catalogApi.listEndpoints,
    enabled: open,
  });

  // Catalog rows mark themselves "picked" when the same endpoint id appears
  // anywhere in the tree (top-level leaves or inside parallel groups).
  const pickedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of picked) {
      if (s.kind === "request") ids.add(s.endpoint.id);
      else if (s.kind === "parallel") {
        for (const c of s.children) {
          if (c.kind === "request") ids.add(c.endpoint.id);
        }
      }
    }
    return ids;
  }, [picked]);

  // Multi-select state for "Group as parallel" — uses rowIds so it survives
  // reorders. Auto-clears when picked changes shape (e.g. group formed).
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }
  // catalog.data is the new envelope shape: { endpoints, hint }. `hint` is
  // surfaced separately as the empty-state copy when endpoints is empty.
  const catalogEndpoints = catalog.data?.endpoints ?? [];
  const catalogHint = catalog.data?.hint;
  const catalogById = useMemo(() => {
    const m = new Map<string, CatalogEndpoint>();
    for (const e of catalogEndpoints) m.set(e.id, e);
    return m;
  }, [catalogEndpoints]);
  const filteredCatalog = useMemo(() => {
    const needle = catalogQuery.trim().toLowerCase();
    if (!needle) return catalogEndpoints;
    return catalogEndpoints.filter(
      (e) =>
        e.path.toLowerCase().includes(needle) ||
        e.service.toLowerCase().includes(needle) ||
        e.method.toLowerCase().includes(needle) ||
        (e.description?.toLowerCase().includes(needle) ?? false),
    );
  }, [catalogEndpoints, catalogQuery]);

  // expandWithDeps does a depth-first, post-order walk of an endpoint's
  // declared deps so the result has prerequisites before dependents — exactly
  // the order the workflow's sequence node should run them. Already-seen ids
  // short-circuit so cycles don't loop and shared deps aren't duplicated.
  function expandWithDeps(
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

  // --- tree helpers (top-level + parallel-group children) ---
  // We flatten/replace by rowId so callers don't need to know whether a row
  // lives at the top level or inside a parallel group.
  function isLeaf(s: PickedStep): s is LeafStep {
    return s.kind === "request" || s.kind === "delay";
  }
  function findRow(
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
  function mapRow(
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
  /** Remove one row anywhere; if a parallel group ends up with <2 children,
   *  unwrap it (a parallel of 0 or 1 is degenerate and noise in the tree). */
  function removeRow(tree: PickedStep[], rowId: string): PickedStep[] {
    const out: PickedStep[] = [];
    for (const s of tree) {
      if (s.rowId === rowId) continue;
      if (s.kind === "parallel") {
        const kids = s.children.filter((c) => c.rowId !== rowId);
        if (kids.length === s.children.length) {
          out.push(s);
        } else if (kids.length >= 2) {
          out.push({ ...s, children: kids });
        } else if (kids.length === 1) {
          // unwrap singleton group back into the sequence at this position
          const only = kids[0];
          if (only) out.push(only);
        }
        // 0 children → drop entirely
      } else {
        out.push(s);
      }
    }
    return out;
  }

  // togglePick removes every instance of an endpoint (top-level or inside a
  // group). Otherwise appends the new request at top-level, prepending any
  // missing transitive deps in topological order. Group-internal deps are
  // honored when checking "already have".
  function togglePick(e: CatalogEndpoint) {
    setPicked((prev) => {
      if (pickedIds.has(e.id)) {
        return prev
          .map((s): PickedStep | null => {
            if (s.kind === "parallel") {
              const kids = s.children.filter(
                (c) => !(c.kind === "request" && c.endpoint.id === e.id),
              );
              if (kids.length >= 2) return { ...s, children: kids };
              if (kids.length === 1) return kids[0] ?? null;
              return null;
            }
            return s.kind === "request" && s.endpoint.id === e.id ? null : s;
          })
          .filter((s): s is PickedStep => s !== null);
      }
      const haveIds = new Set<string>();
      for (const s of prev) {
        if (s.kind === "request") haveIds.add(s.endpoint.id);
        else if (s.kind === "parallel") {
          for (const c of s.children) {
            if (c.kind === "request") haveIds.add(c.endpoint.id);
          }
        }
      }
      const additions: LeafStep[] = expandWithDeps(e, catalogById)
        .filter((x) => !haveIds.has(x.id))
        .map((endpoint) => ({ rowId: newRowId(), kind: "request", endpoint }));
      return [...prev, ...additions];
    });
  }

  // addDelayAfter inserts a fresh delay step right after the given top-level
  // index. Delays are intentionally only allowed at the top level — they
  // represent inter-step think time; inside a parallel group every child
  // races, so a "delay child" is a confusing no-op.
  function addDelayAfter(i: number) {
    setPicked((prev) => {
      const next = [...prev];
      next.splice(i + 1, 0, { rowId: newRowId(), kind: "delay", minMs: 300, maxMs: 900 });
      return next;
    });
  }
  function appendDelay() {
    setPicked((prev) => [...prev, { rowId: newRowId(), kind: "delay", minMs: 300, maxMs: 900 }]);
  }
  function updateDelay(rowId: string, patch: Partial<{ minMs: number; maxMs: number }>) {
    setPicked((prev) => mapRow(prev, rowId, (s) => (s.kind === "delay" ? { ...s, ...patch } : s)));
  }

  function removeRowById(rowId: string) {
    setPicked((prev) => removeRow(prev, rowId));
    setSelectedRowIds((prev) => {
      if (!prev.has(rowId)) return prev;
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });
  }

  /** Moves a row up/down within its parent (top-level or inside its group). */
  function moveRow(rowId: string, dir: -1 | 1) {
    setPicked((prev) => {
      const found = findRow(prev, rowId);
      if (!found) return prev;
      const swap = <T,>(arr: T[], i: number, j: number): T[] => {
        if (j < 0 || j >= arr.length) return arr;
        const next = [...arr];
        const a = next[i];
        const b = next[j];
        if (!a || !b) return arr;
        next[i] = b;
        next[j] = a;
        return next;
      };
      if (found.parent === null) {
        return swap(prev, found.index, found.index + dir);
      }
      const parentRowId = found.parent.rowId;
      return prev.map((s) => {
        if (s.rowId !== parentRowId || s.kind !== "parallel") return s;
        return { ...s, children: swap(s.children, found.index, found.index + dir) };
      });
    });
  }

  /** Toggle the optional flag on a row; default probability 0.5 matches the
   *  seeded social-net "compose-post" optional. */
  function toggleOptional(rowId: string) {
    setPicked((prev) =>
      mapRow(prev, rowId, (s) =>
        s.optional
          ? ({ ...s, optional: undefined } as PickedStep)
          : ({ ...s, optional: { probability: 0.5 } } as PickedStep),
      ),
    );
  }
  function updateOptionalProbability(rowId: string, raw: number) {
    const p = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
    setPicked((prev) =>
      mapRow(prev, rowId, (s) =>
        s.optional ? ({ ...s, optional: { probability: p } } as PickedStep) : s,
      ),
    );
  }

  /** Wraps the currently selected top-level leaves into a single parallel
   *  group, inserted at the position of the first selected row. Only
   *  top-level leaves are eligible: nesting parallel-in-parallel and grouping
   *  rows that are already inside a different group both break the v1 model
   *  (and the latter is rarely what the user means anyway). */
  function groupSelectedAsParallel() {
    const ids = selectedRowIds;
    if (ids.size < 2) return;
    setPicked((prev) => {
      const eligible: LeafStep[] = [];
      const positions: number[] = [];
      prev.forEach((s, i) => {
        if (ids.has(s.rowId) && isLeaf(s)) {
          eligible.push(s);
          positions.push(i);
        }
      });
      if (eligible.length < 2) return prev;
      const insertAt = positions[0] ?? 0;
      const remaining = prev.filter((_, i) => !positions.includes(i));
      const group: GroupStep = {
        rowId: newRowId(),
        kind: "parallel",
        children: eligible,
      };
      const next = [...remaining];
      next.splice(insertAt, 0, group);
      return next;
    });
    setSelectedRowIds(new Set());
  }

  /** Replace a parallel group with its children, restoring sequence order. */
  function ungroup(groupRowId: string) {
    setPicked((prev) => {
      const out: PickedStep[] = [];
      for (const s of prev) {
        if (s.rowId === groupRowId && s.kind === "parallel") {
          out.push(...s.children);
        } else {
          out.push(s);
        }
      }
      return out;
    });
  }

  function reset() {
    setName("");
    setDescription("");
    setPicked([]);
    setSelectedRowIds(new Set());
    setCatalogQuery("");
    setError(null);
  }

  const mutation = useMutation({
    mutationFn: workflowsApi.createWorkflow,
    onSuccess: async (wf) => {
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      onOpenChange(false);
      reset();
      navigate({ to: "/workflows/$workflowId", params: { workflowId: wf.id } });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
          <DialogDescription>
            Pick the APIs you want to hit, in order. They become the request nodes of a{" "}
            <code className="font-mono">sequence</code> tree.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              setError("Name is required");
              return;
            }
            mutation.mutate({
              name,
              description: description.trim() || undefined,
              steps: picked.map((s) => pickedToStepInput(s)),
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wf-name">Name</Label>
              <Input
                id="wf-name"
                autoFocus
                placeholder="checkout-burst"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Lowercase, dashes only — used as the URL slug.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wf-desc">Description (optional)</Label>
              <Input
                id="wf-desc"
                placeholder="Hammer the checkout path"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>API catalog</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search endpoints…"
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/20">
                {catalog.isLoading ? (
                  <p className="p-3 text-xs text-muted-foreground">Loading endpoints…</p>
                ) : catalog.isError ? (
                  <p className="p-3 text-xs text-muted-foreground">Could not load catalog.</p>
                ) : filteredCatalog.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    {catalogEndpoints.length === 0
                      ? (catalogHint ?? "No endpoints available.")
                      : "No matches."}
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredCatalog.map((e) => {
                      const isPicked = pickedIds.has(e.id);
                      const depRows = (e.depends_on ?? [])
                        .map((id) => catalogById.get(id))
                        .filter((x): x is CatalogEndpoint => Boolean(x));
                      return (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => togglePick(e)}
                            className={cn(
                              "flex w-full items-start gap-2 px-2 py-1.5 text-left hover:bg-muted/60",
                              isPicked && "bg-accent/40",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                                isPicked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input",
                              )}
                            >
                              {isPicked ? <Check className="size-3" /> : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1 font-mono text-xs">
                                <MethodChip method={e.method} />
                                <span className="truncate">{e.path}</span>
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {e.service}
                                {e.description ? ` · ${e.description}` : ""}
                              </span>
                              {depRows.length > 0 ? (
                                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                                  <span className="opacity-70">requires</span>
                                  {depRows.map((d) => (
                                    <span
                                      key={d.id}
                                      className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-px font-mono"
                                    >
                                      <MethodChip method={d.method} />
                                      <span>{d.path}</span>
                                    </span>
                                  ))}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label>
                  Workflow steps{" "}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    ({picked.length})
                  </span>
                </Label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={groupSelectedAsParallel}
                    disabled={selectedRowIds.size < 2}
                    className="inline-flex items-center gap-1 rounded border border-input px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                    title="Group selected rows into a parallel block"
                  >
                    <GitFork className="size-3" />
                    Group as parallel
                  </button>
                  <button
                    type="button"
                    onClick={appendDelay}
                    className="inline-flex items-center gap-1 rounded border border-input px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Timer className="size-3" />
                    Add delay
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Sequence runs top to bottom. Select 2+ leaves and{" "}
                <span className="font-medium">Group as parallel</span> to fan them out. Toggle{" "}
                <Percent className="inline size-2.5" /> to make a step probabilistic.
              </p>
              <div className="max-h-80 min-h-[8rem] overflow-y-auto rounded-md border bg-muted/20">
                {picked.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    Pick endpoints from the left to build the sequence.
                  </p>
                ) : (
                  <ol className="divide-y divide-border">
                    {picked.map((step, i) => {
                      const canMoveUp = i > 0;
                      const canMoveDown = i < picked.length - 1;
                      if (step.kind === "parallel") {
                        return (
                          <li key={step.rowId} className="px-2 py-1.5 text-xs">
                            <div className="flex items-center gap-1">
                              <RowMoveButtons
                                onUp={() => moveRow(step.rowId, -1)}
                                onDown={() => moveRow(step.rowId, 1)}
                                upDisabled={!canMoveUp}
                                downDisabled={!canMoveDown}
                              />
                              <span className="w-5 shrink-0 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
                                {i + 1}
                              </span>
                              <span className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded bg-violet-500/15 px-1 font-mono text-[10px] font-semibold text-violet-700 dark:text-violet-400">
                                <GitFork className="size-2.5" />
                                PARALLEL · {step.children.length}
                              </span>
                              <OptionalControls
                                step={step}
                                onToggle={() => toggleOptional(step.rowId)}
                                onProbChange={(v) => updateOptionalProbability(step.rowId, v)}
                              />
                              <div className="flex-1" />
                              <button
                                type="button"
                                onClick={() => ungroup(step.rowId)}
                                className="text-muted-foreground hover:text-foreground"
                                aria-label="Ungroup"
                                title="Ungroup back into sequence"
                              >
                                <Ungroup className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeRowById(step.rowId)}
                                className="text-muted-foreground hover:text-destructive"
                                aria-label="Remove"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                            <ol className="mt-1 space-y-0.5 border-l-2 border-violet-500/30 pl-3">
                              {step.children.map((child, ci) => (
                                <li key={child.rowId} className="flex items-center gap-1">
                                  <RowMoveButtons
                                    onUp={() => moveRow(child.rowId, -1)}
                                    onDown={() => moveRow(child.rowId, 1)}
                                    upDisabled={ci === 0}
                                    downDisabled={ci === step.children.length - 1}
                                  />
                                  <LeafRowBody
                                    step={child}
                                    onUpdateDelay={(patch) => updateDelay(child.rowId, patch)}
                                  />
                                  <OptionalControls
                                    step={child}
                                    onToggle={() => toggleOptional(child.rowId)}
                                    onProbChange={(v) => updateOptionalProbability(child.rowId, v)}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeRowById(child.rowId)}
                                    className="text-muted-foreground hover:text-destructive"
                                    aria-label="Remove"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </li>
                              ))}
                            </ol>
                          </li>
                        );
                      }
                      const checked = selectedRowIds.has(step.rowId);
                      return (
                        <li
                          key={step.rowId}
                          className={cn(
                            "flex items-center gap-1 px-2 py-1.5 text-xs",
                            checked && "bg-accent/30",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRowSelection(step.rowId)}
                            className="size-3 shrink-0 cursor-pointer"
                            aria-label="Select for grouping"
                            title="Select to group as parallel"
                          />
                          <RowMoveButtons
                            onUp={() => moveRow(step.rowId, -1)}
                            onDown={() => moveRow(step.rowId, 1)}
                            upDisabled={!canMoveUp}
                            downDisabled={!canMoveDown}
                          />
                          <span className="w-5 shrink-0 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
                            {i + 1}
                          </span>
                          <LeafRowBody
                            step={step}
                            onUpdateDelay={(patch) => updateDelay(step.rowId, patch)}
                          />
                          <OptionalControls
                            step={step}
                            onToggle={() => toggleOptional(step.rowId)}
                            onProbChange={(v) => updateOptionalProbability(step.rowId, v)}
                          />
                          <button
                            type="button"
                            onClick={() => addDelayAfter(i)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Insert delay after"
                            title="Insert delay after this step"
                          >
                            <Timer className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRowById(step.rowId)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove"
                          >
                            <X className="size-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Creating…"
                : picked.length > 0
                  ? `Create with ${picked.length} step${picked.length === 1 ? "" : "s"}`
                  : "Create workflow"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** NumInput is a tight numeric input for inline editing inside a step row.
 *  Validates non-negative integers; non-numeric input falls through unchanged
 *  to avoid trapping the user mid-typing (e.g. transient empty state). */
function NumInput({
  value,
  onChange,
  ...props
}: {
  value: number;
  onChange: (v: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <input
      type="number"
      min={0}
      step={50}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isNaN(n) && n >= 0) onChange(Math.floor(n));
      }}
      className="h-5 w-14 rounded border border-input bg-background px-1 text-right font-mono text-[10px] tabular-nums focus:border-primary focus:outline-none"
      {...props}
    />
  );
}

/** Up/down arrows shared by top-level rows and parallel-group children. */
function RowMoveButtons({
  onUp,
  onDown,
  upDisabled,
  downDisabled,
}: {
  onUp: () => void;
  onDown: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
}) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onUp}
        disabled={upDisabled}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        aria-label="Move up"
      >
        <GripVertical className="size-3 rotate-90" />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={downDisabled}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        aria-label="Move down"
      >
        <GripVertical className="size-3 -rotate-90" />
      </button>
    </div>
  );
}

/** Body of a leaf row — either an HTTP request line or a delay editor.
 *  Pulled out so the same renderer is reused by top-level rows and rows
 *  inside a parallel group; the wrapper handles selection, move, optional. */
function LeafRowBody({
  step,
  onUpdateDelay,
}: {
  step: LeafStep;
  onUpdateDelay: (patch: Partial<{ minMs: number; maxMs: number }>) => void;
}) {
  if (step.kind === "request") {
    return (
      <>
        <MethodChip method={step.endpoint.method} />
        <span className="min-w-0 flex-1 truncate font-mono">{step.endpoint.path}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{step.endpoint.service}</span>
      </>
    );
  }
  return (
    <>
      <span className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded bg-amber-500/15 px-1 font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-400">
        <Timer className="size-2.5" />
        DELAY
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1 font-mono text-[10px] text-muted-foreground">
        <span>think</span>
        <NumInput
          value={step.minMs}
          onChange={(v) => onUpdateDelay({ minMs: v })}
          aria-label="Min ms"
        />
        <span>–</span>
        <NumInput
          value={step.maxMs}
          onChange={(v) => onUpdateDelay({ maxMs: v })}
          aria-label="Max ms"
        />
        <span>ms</span>
      </div>
    </>
  );
}

/** Toggle + probability input for the optional wrapper. Hidden until the
 *  user clicks the % chip; expanded form shows an inline 0–1 input. */
function OptionalControls({
  step,
  onToggle,
  onProbChange,
}: {
  step: PickedStep;
  onToggle: () => void;
  onProbChange: (v: number) => void;
}) {
  const active = Boolean(step.optional);
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-0.5 rounded px-1 py-px font-mono text-[10px]",
          active
            ? "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        title={active ? "Disable optional" : "Make optional (probability gated)"}
        aria-pressed={active}
      >
        <Percent className="size-2.5" />
        {active ? "OPTIONAL" : "OPT"}
      </button>
      {active ? (
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={step.optional?.probability ?? 0.5}
          onChange={(e) => onProbChange(Number(e.target.value))}
          className="h-5 w-12 rounded border border-input bg-background px-1 text-right font-mono text-[10px] tabular-nums focus:border-primary focus:outline-none"
          aria-label="Probability (0–1)"
          title="Probability the step runs (0–1)"
        />
      ) : null}
    </div>
  );
}

function MethodChip({ method }: { method: string }) {
  const palette: Record<string, string> = {
    GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    POST: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    PUT: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    PATCH: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    DELETE: "bg-red-500/15 text-red-700 dark:text-red-400",
  };
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded px-1 font-mono text-[10px] font-semibold",
        palette[method.toUpperCase()] ?? "bg-muted text-foreground",
      )}
    >
      {method.toUpperCase()}
    </span>
  );
}
