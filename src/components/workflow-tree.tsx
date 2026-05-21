import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkflowNode } from "@/lib/workflow-types";

interface WorkflowTreeProps {
  root: WorkflowNode;
  selectedId: string | null;
  onSelect: (node: WorkflowNode) => void;
}

/** Renders the DSL tree the way the Figma source shows it — colored
 *  type chip on the left, monospace path/label on the right. Selecting a
 *  node bubbles the WorkflowNode up so the right-hand inspector can render. */
export function WorkflowTree({ root, selectedId, onSelect }: WorkflowTreeProps) {
  return (
    <div className="text-sm">
      <TreeRow node={root} depth={0} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}

interface TreeRowProps {
  node: WorkflowNode;
  depth: number;
  selectedId: string | null;
  onSelect: (node: WorkflowNode) => void;
}

function TreeRow({ node, depth, selectedId, onSelect }: TreeRowProps) {
  const children = childrenOf(node);
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60",
          selectedId === node.id && "bg-accent/60 ring-1 ring-primary/30",
        )}
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
      >
        <NodeTypeChip type={node.type} />
        <NodeSummary node={node} />
        <NodeTrailing node={node} />
      </button>
      {children.map((child) => (
        <TreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function childrenOf(node: WorkflowNode): WorkflowNode[] {
  switch (node.type) {
    case "sequence":
    case "parallel":
      return node.children;
    case "optional":
      return [node.child];
    default:
      return [];
  }
}

/** Color-coded chip per node type — same vocabulary as the Figma legend
 *  (sequence | parallel | delay | optional | request). */
function NodeTypeChip({ type }: { type: WorkflowNode["type"] }) {
  const palette: Record<WorkflowNode["type"], string> = {
    sequence: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    parallel: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    delay: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
    optional: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    request: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-medium uppercase tracking-wide",
        palette[type],
      )}
    >
      {type}
    </span>
  );
}

function NodeSummary({ node }: { node: WorkflowNode }) {
  switch (node.type) {
    case "request":
      return (
        <span className="flex min-w-0 items-center gap-1 font-mono text-xs">
          <span className="font-semibold">{node.method}</span>
          <span className="truncate text-muted-foreground">{node.path}</span>
        </span>
      );
    case "delay":
      return (
        <span className="text-xs text-muted-foreground">
          {node.label ?? "delay"}
          {node.minMs != null && node.maxMs != null
            ? ` ${node.minMs}–${node.maxMs} ms`
            : node.minMs != null
              ? ` ${node.minMs} ms`
              : ""}
        </span>
      );
    case "sequence":
    case "parallel":
      return (
        <span className="text-xs font-medium">
          {node.label ?? node.type}
          {node.type === "parallel" ? (
            <span className="ml-2 text-muted-foreground">
              wait: {node.waitPolicy === "n_of_m" ? `${node.n ?? 0} of m` : node.waitPolicy}
            </span>
          ) : null}
        </span>
      );
    case "optional":
      return <span className="text-xs font-medium">{node.label ?? "optional"}</span>;
  }
}

function NodeTrailing({ node }: { node: WorkflowNode }) {
  if (node.type === "request" && node.extract) {
    const keys = Object.keys(node.extract);
    if (keys.length > 0) {
      return (
        <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
          extract {keys.length === 1 ? keys[0] : `${keys.length} vars`}
        </Badge>
      );
    }
  }
  if (node.type === "request" && node.retries != null) {
    return (
      <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
        {node.retries} retries
      </Badge>
    );
  }
  if (node.type === "optional") {
    return (
      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
        prob: {node.probability}
      </span>
    );
  }
  return null;
}
