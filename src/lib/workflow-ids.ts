/**
 * zeus serves DSL v2 documents in which some nodes (optionals, in every
 * workflow on VM1) carry no `id`. The tree view keys rows and the inspector
 * selects nodes by id, so an id-less node broke both (React duplicate-key
 * warnings; the first id-less node always "selected"). This fills the gaps
 * with ids derived from the path — `<parent>/<index>:<type>` — so they are
 * stable across renders and reloads, and de-duplicates ids the DSL repeats.
 */
import type { WorkflowNode } from "@/lib/workflow-types";

export function ensureNodeIds(root: WorkflowNode): WorkflowNode {
  const seen = new Set<string>();
  const unique = (id: string): string => {
    let candidate = id;
    for (let n = 2; seen.has(candidate); n++) candidate = `${id}#${n}`;
    seen.add(candidate);
    return candidate;
  };
  const visit = (node: WorkflowNode, parentId: string, index: number): WorkflowNode => {
    const id = unique(node.id || `${parentId}/${index}:${node.type}`);
    switch (node.type) {
      case "sequence":
      case "parallel":
        return { ...node, id, children: node.children.map((c, i) => visit(c, id, i)) };
      case "optional":
        return { ...node, id, child: visit(node.child, id, 0) };
      default:
        return { ...node, id };
    }
  };
  return visit(root, "", 0);
}
