import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowTree } from "@/components/workflow-tree";
import { workflowsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { WaitPolicy, Workflow, WorkflowNode } from "@/lib/workflow-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/workflows/$workflowId")({
  component: WorkflowDetailPage,
});

function WorkflowDetailPage() {
  const { workflowId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["workflows", workflowId],
    queryFn: () => workflowsApi.getWorkflow(workflowId),
  });

  // Soft confirm before destructive action — native confirm() is the right
  // ergonomic for a low-frequency destructive op; a full modal would be
  // overkill until we have undo or batch delete.
  const deleteMut = useMutation({
    mutationFn: () => workflowsApi.deleteWorkflow(workflowId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      navigate({ to: "/workflows" });
    },
  });
  function handleDelete() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete workflow "${workflowId}"? This cannot be undone.`)
    ) {
      return;
    }
    deleteMut.mutate();
  }

  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** Default the inspector to the first non-trivial node so the right panel
   *  isn't empty when the page lands (matches the Figma which has fan-out picked). */
  useEffect(() => {
    if (!data || selectedId) return;
    const first = firstInterestingNode(data.root);
    if (first) setSelectedId(first.id);
  }, [data, selectedId]);

  const selectedNode = useMemo(
    () => (data && selectedId ? findNode(data.root, selectedId) : null),
    [data, selectedId],
  );

  if (isLoading) {
    return (
      <>
        <Topbar
          breadcrumbs={["online-boutique", { label: "Workflows", to: "/workflows" }, workflowId]}
        />
        <div className="flex-1 overflow-y-auto px-6 py-6 text-sm text-muted-foreground">
          Loading…
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <Topbar
          breadcrumbs={["online-boutique", { label: "Workflows", to: "/workflows" }, workflowId]}
        />
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <p className="text-sm text-muted-foreground">
            Workflow <code className="font-mono">{workflowId}</code> not found.{" "}
            <Link to="/workflows" className="text-primary hover:underline">
              Back to workflows
            </Link>
            .
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        breadcrumbs={["online-boutique", { label: "Workflows", to: "/workflows" }, workflowId]}
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
            <Button variant="default" disabled>
              Validate against dataset
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <WorkflowHeader workflow={data} />

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardContent className="p-4">
              <Tabs defaultValue="tree">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">DSL tree</h2>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      sequence · parallel · delay · optional · request
                    </p>
                  </div>
                  <TabsList>
                    <TabsTrigger value="tree">Tree</TabsTrigger>
                    <TabsTrigger value="topology">Topology</TabsTrigger>
                    <TabsTrigger value="json">JSON</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="tree" className="mt-0">
                  <WorkflowTree
                    root={data.root}
                    selectedId={selectedId}
                    onSelect={(n) => setSelectedId(n.id)}
                  />
                </TabsContent>

                <TabsContent value="topology" className="mt-0">
                  <p className="text-xs text-muted-foreground">
                    Topology view coming soon — it will render the call graph derived from{" "}
                    <code className="font-mono">targets</code> + request paths.
                  </p>
                </TabsContent>

                <TabsContent value="json" className="mt-0">
                  <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px]">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <NodeInspector node={selectedNode} />
        </div>
      </div>
    </>
  );
}

function WorkflowHeader({ workflow }: { workflow: Workflow }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{workflow.name}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {workflow.version} · targets{" "}
          <span className="font-mono text-foreground/80">{workflow.targets.join(", ")}</span> ·{" "}
          {countAllNodes(workflow.root, "request")} request nodes
        </p>
        {workflow.description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{workflow.description}</p>
        ) : null}
      </div>
    </div>
  );
}

function NodeInspector({ node }: { node: WorkflowNode | null }) {
  if (!node) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">
          Select a node from the tree to inspect it.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">
            Node: <span className="font-mono">{node.type}</span>
          </h2>
          {"label" in node && node.label ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Selected: <span className="font-mono text-foreground">{node.label}</span>
            </p>
          ) : null}
        </div>
        <Separator />
        <Field label="Node id" value={node.id} mono />
        {renderTypeSpecificFields(node)}
      </CardContent>
    </Card>
  );
}

function renderTypeSpecificFields(node: WorkflowNode) {
  switch (node.type) {
    case "request":
      return (
        <>
          <Field label="Method" value={node.method} mono />
          <Field label="Path" value={node.path} mono />
          {node.extract ? <Field label="Extract" value={node.extract} mono /> : null}
          {node.retries != null ? (
            <Field label="Retries" value={String(node.retries)} mono />
          ) : null}
        </>
      );
    case "delay":
      return (
        <>
          {node.minMs != null ? <Field label="Min (ms)" value={String(node.minMs)} mono /> : null}
          {node.maxMs != null ? <Field label="Max (ms)" value={String(node.maxMs)} mono /> : null}
        </>
      );
    case "sequence":
      return (
        <>
          <FieldRaw label="Children">
            <ChildrenList nodes={node.children} />
          </FieldRaw>
          <ScopeNote>
            Children run strictly in order. Extracts from earlier children are visible to later
            children.
          </ScopeNote>
        </>
      );
    case "parallel":
      return (
        <>
          <FieldRaw label="Wait policy">
            <Select value={node.waitPolicy} onValueChange={() => {}}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WAIT_POLICIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRaw>
          {node.waitPolicy === "n_of_m" && node.n != null ? (
            <Field label="n" value={String(node.n)} mono />
          ) : null}
          <FieldRaw label="Children">
            <ChildrenList nodes={node.children} />
          </FieldRaw>
          <ScopeNote>
            Run concurrently within one VU iteration. Children run in independent scopes — no
            sibling extracts. On completion, child extracts merge into the parent scope.
          </ScopeNote>
        </>
      );
    case "optional":
      return (
        <>
          <Field label="Probability" value={node.probability.toFixed(2)} mono />
          <FieldRaw label="Child">
            <ChildrenList nodes={[node.child]} />
          </FieldRaw>
          <ScopeNote>Executed independently per iteration based on probability.</ScopeNote>
        </>
      );
  }
}

const WAIT_POLICIES: WaitPolicy[] = ["all", "any", "n_of_m"];

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("rounded-md border bg-muted/30 px-2 py-1.5 text-xs", mono && "font-mono")}>
        {value}
      </div>
    </div>
  );
}

function FieldRaw({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function ChildrenList({ nodes }: { nodes: WorkflowNode[] }) {
  return (
    <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
      {nodes.map((c) => (
        <li key={c.id} className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] uppercase">
            {c.type}
          </Badge>
          <span className="truncate font-mono">{childLabel(c)}</span>
        </li>
      ))}
    </ul>
  );
}

function ScopeNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 p-2 text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}

function childLabel(n: WorkflowNode): string {
  switch (n.type) {
    case "request":
      return `${n.method} ${n.path}`;
    case "delay":
      return n.label ?? "delay";
    case "sequence":
    case "parallel":
    case "optional":
      return n.label ?? n.id;
  }
}

function findNode(node: WorkflowNode, id: string): WorkflowNode | null {
  if (node.id === id) return node;
  switch (node.type) {
    case "sequence":
    case "parallel":
      for (const c of node.children) {
        const hit = findNode(c, id);
        if (hit) return hit;
      }
      return null;
    case "optional":
      return findNode(node.child, id);
    default:
      return null;
  }
}

function firstInterestingNode(node: WorkflowNode): WorkflowNode | null {
  /** Prefer parallel/optional/request over a wrapping sequence so the inspector
   *  shows something with content. */
  if (node.type === "parallel" || node.type === "optional") return node;
  if (node.type === "sequence") {
    for (const c of node.children) {
      const hit = firstInterestingNode(c);
      if (hit) return hit;
    }
    return node;
  }
  return node;
}

function countAllNodes(node: WorkflowNode, type: WorkflowNode["type"]): number {
  let n = node.type === type ? 1 : 0;
  switch (node.type) {
    case "sequence":
    case "parallel":
      for (const c of node.children) n += countAllNodes(c, type);
      break;
    case "optional":
      n += countAllNodes(node.child, type);
      break;
  }
  return n;
}
