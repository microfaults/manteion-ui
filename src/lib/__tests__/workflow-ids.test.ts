import { ensureNodeIds } from "@/lib/workflow-ids";
import type { WorkflowNode } from "@/lib/workflow-types";
import { describe, expect, it } from "vitest";

/** browse-nodeport as zeus serves it: optional nodes carry no id at all. */
const vm1Browse = {
  type: "sequence",
  id: "browse",
  children: [
    { type: "request", id: "homepage", method: "GET", path: "/" },
    {
      type: "optional",
      probability: "explore",
      child: {
        type: "sequence",
        id: "after-homepage",
        children: [
          {
            type: "request",
            id: "view_product",
            method: "GET",
            path: "/product/{{data.products.id}}",
          },
          {
            type: "optional",
            probability: "engage",
            child: {
              type: "sequence",
              id: "cart-flow",
              children: [
                { type: "request", id: "add_to_cart", method: "POST", path: "/cart" },
                {
                  type: "optional",
                  probability: 0.5,
                  child: { type: "request", id: "view_cart", method: "GET", path: "/cart" },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as WorkflowNode;

function ids(node: WorkflowNode): string[] {
  const out = [node.id];
  if (node.type === "sequence" || node.type === "parallel")
    for (const c of node.children) out.push(...ids(c));
  if (node.type === "optional") out.push(...ids(node.child));
  return out;
}

describe("ensureNodeIds", () => {
  it("gives every id-less node a stable, unique id derived from its place in the tree, keeps existing ids", () => {
    const fixed = ensureNodeIds(vm1Browse);
    const all = ids(fixed);
    expect(all.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(
      expect.arrayContaining(["browse", "homepage", "after-homepage", "cart-flow", "view_cart"]),
    );
    // the three id-less optionals, each named after its parent and position
    expect(all.filter((id) => id.includes(":optional"))).toEqual([
      "browse/1:optional",
      "after-homepage/1:optional",
      "cart-flow/1:optional",
    ]);
  });

  it("is deterministic and idempotent, and leaves the input untouched", () => {
    const a = ensureNodeIds(vm1Browse);
    const b = ensureNodeIds(vm1Browse);
    expect(ids(a)).toEqual(ids(b));
    expect(ids(ensureNodeIds(a))).toEqual(ids(a));
    expect(ids(vm1Browse).filter(Boolean).length).toBe(7); // original still has 3 missing ids
  });

  it("disambiguates duplicate ids the DSL may carry", () => {
    const dup = {
      type: "sequence",
      id: "root",
      children: [
        { type: "delay", id: "think" },
        { type: "delay", id: "think" },
      ],
    } as unknown as WorkflowNode;
    const all = ids(ensureNodeIds(dup));
    expect(new Set(all).size).toBe(3);
    expect(all[1]).toBe("think");
  });
});
