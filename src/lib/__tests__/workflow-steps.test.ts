import {
  type LeafStep,
  type PickedStep,
  expandWithDeps,
  groupSelected,
  moveRow,
  pickedEndpointIds,
  pickedToStepInput,
  removeRow,
  togglePick,
  ungroup,
  validateWorkflowDraft,
} from "@/lib/workflow-steps";
import type { CatalogEndpoint } from "@/types/api";
import { describe, expect, it } from "vitest";

function ep(id: string, depends_on: string[] = []): CatalogEndpoint {
  return { id, service: "svc", method: "GET", path: `/${id}`, depends_on };
}

function byId(...eps: CatalogEndpoint[]): Map<string, CatalogEndpoint> {
  return new Map(eps.map((e) => [e.id, e]));
}

function seq(): () => string {
  let n = 0;
  return () => `row-${++n}`;
}

const req = (rowId: string, e: CatalogEndpoint): LeafStep => ({
  rowId,
  kind: "request",
  endpoint: e,
});
const delay = (rowId: string, minMs = 300, maxMs = 900): LeafStep => ({
  rowId,
  kind: "delay",
  minMs,
  maxMs,
});

describe("expandWithDeps", () => {
  it("orders prerequisites before dependents (depth-first, post-order)", () => {
    const cart = ep("cart");
    const checkout = ep("checkout", ["cart"]);
    expect(expandWithDeps(checkout, byId(cart, checkout)).map((e) => e.id)).toEqual([
      "cart",
      "checkout",
    ]);
  });

  it("deduplicates shared transitive deps (diamond)", () => {
    const login = ep("login");
    const cart = ep("cart", ["login"]);
    const pay = ep("pay", ["login"]);
    const checkout = ep("checkout", ["cart", "pay"]);
    expect(expandWithDeps(checkout, byId(login, cart, pay, checkout)).map((e) => e.id)).toEqual([
      "login",
      "cart",
      "pay",
      "checkout",
    ]);
  });

  it("terminates on dependency cycles", () => {
    const a = ep("a", ["b"]);
    const b = ep("b", ["a"]);
    expect(expandWithDeps(a, byId(a, b)).map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("ignores dep ids missing from the catalog", () => {
    const e = ep("solo", ["ghost"]);
    expect(expandWithDeps(e, byId(e)).map((x) => x.id)).toEqual(["solo"]);
  });
});

describe("togglePick", () => {
  it("appends the endpoint with its missing deps, deps first", () => {
    const cart = ep("cart");
    const checkout = ep("checkout", ["cart"]);
    const next = togglePick([], checkout, byId(cart, checkout), seq());
    expect(next.map((s) => (s.kind === "request" ? s.endpoint.id : s.kind))).toEqual([
      "cart",
      "checkout",
    ]);
  });

  it("does not re-add deps that are already picked, including inside groups", () => {
    const cart = ep("cart");
    const checkout = ep("checkout", ["cart"]);
    const prev: PickedStep[] = [
      { rowId: "g1", kind: "parallel", children: [req("r1", cart), delay("r2")] },
    ];
    const next = togglePick(prev, checkout, byId(cart, checkout), seq());
    expect(pickedEndpointIds(next)).toEqual(new Set(["cart", "checkout"]));
    expect(next).toHaveLength(2);
  });

  it("removes every instance of a picked endpoint and unwraps degenerate groups", () => {
    const cart = ep("cart");
    const other = ep("other");
    const prev: PickedStep[] = [
      { rowId: "g1", kind: "parallel", children: [req("r1", cart), req("r2", other)] },
      req("r3", cart),
    ];
    const next = togglePick(prev, cart, byId(cart, other), seq());
    // group drops to 1 child -> unwrapped to a plain leaf; top-level copy removed
    expect(next).toEqual([req("r2", other)]);
  });
});

describe("groupSelected / ungroup / removeRow / moveRow", () => {
  const a = req("a", ep("a"));
  const b = req("b", ep("b"));
  const c = req("c", ep("c"));

  it("wraps 2+ selected top-level leaves into one parallel group at the first position", () => {
    const next = groupSelected([a, b, c], new Set(["a", "c"]), seq());
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ kind: "parallel", children: [a, c] });
    expect(next[1]).toBe(b);
  });

  it("is a no-op for fewer than 2 selected rows", () => {
    const tree = [a, b];
    expect(groupSelected(tree, new Set(["a"]), seq())).toBe(tree);
  });

  it("ignores selected rows that live inside an existing group", () => {
    const g: PickedStep = { rowId: "g1", kind: "parallel", children: [a, b] };
    const tree = [g, c];
    expect(groupSelected(tree, new Set(["a", "c"]), seq())).toBe(tree);
  });

  it("ungroup splices children back in place", () => {
    const g: PickedStep = { rowId: "g1", kind: "parallel", children: [a, b] };
    expect(ungroup([c, g], "g1")).toEqual([c, a, b]);
  });

  it("removeRow unwraps a group left with one child and drops a group left with none", () => {
    const g: PickedStep = { rowId: "g1", kind: "parallel", children: [a, b] };
    expect(removeRow([g], "a")).toEqual([b]);
    const g2: PickedStep = { rowId: "g2", kind: "parallel", children: [a] };
    expect(removeRow([g2], "a")).toEqual([]);
  });

  it("moveRow swaps within bounds and clamps at the edges", () => {
    expect(moveRow([a, b, c], "c", -1).map((s) => s.rowId)).toEqual(["a", "c", "b"]);
    expect(moveRow([a, b, c], "a", -1).map((s) => s.rowId)).toEqual(["a", "b", "c"]);
  });

  it("moveRow moves children inside their group without escaping it", () => {
    const g: PickedStep = { rowId: "g1", kind: "parallel", children: [a, b] };
    const next = moveRow([g, c], "b", -1);
    expect(next[0]).toMatchObject({ kind: "parallel", children: [b, a] });
    const clamped = moveRow([g, c], "a", -1);
    expect(clamped[0]).toMatchObject({ kind: "parallel", children: [a, b] });
  });
});

describe("pickedToStepInput", () => {
  it("strips picker-only rowIds and preserves optional flags through groups", () => {
    const g: PickedStep = {
      rowId: "g1",
      kind: "parallel",
      optional: { probability: 0.25 },
      children: [req("r1", ep("cart")), { ...delay("r2", 100, 200), optional: { probability: 1 } }],
    };
    expect(pickedToStepInput(g)).toEqual({
      kind: "parallel",
      optional: { probability: 0.25 },
      children: [
        { kind: "request", endpoint: ep("cart"), optional: undefined },
        { kind: "delay", minMs: 100, maxMs: 200, optional: { probability: 1 } },
      ],
    });
  });
});

describe("validateWorkflowDraft", () => {
  const okStep = req("r1", ep("cart"));

  it("accepts a named draft with at least one step", () => {
    expect(validateWorkflowDraft("checkout-burst", [okStep])).toEqual([]);
  });

  it("requires a non-blank name", () => {
    expect(validateWorkflowDraft("  ", [okStep]).join(" ")).toMatch(/name/i);
  });

  it("rejects a workflow with zero steps (would generate no load)", () => {
    expect(validateWorkflowDraft("wf", []).join(" ")).toMatch(/at least one step/i);
  });

  it("rejects delays with min > max, including inside parallel groups", () => {
    expect(validateWorkflowDraft("wf", [delay("d1", 900, 100)]).join(" ")).toMatch(/min/i);
    const g: PickedStep = {
      rowId: "g1",
      kind: "parallel",
      children: [okStep, delay("d2", 500, 100)],
    };
    expect(validateWorkflowDraft("wf", [g])).not.toEqual([]);
  });

  it("rejects negative delay bounds", () => {
    expect(validateWorkflowDraft("wf", [delay("d1", -5, 100)])).not.toEqual([]);
  });

  it("rejects optional probabilities outside [0, 1]", () => {
    const bad: PickedStep = { ...okStep, optional: { probability: 1.5 } };
    expect(validateWorkflowDraft("wf", [bad]).join(" ")).toMatch(/probability/i);
  });

  it("rejects parallel groups with fewer than two children", () => {
    const g: PickedStep = { rowId: "g1", kind: "parallel", children: [okStep] };
    expect(validateWorkflowDraft("wf", [g]).join(" ")).toMatch(/parallel/i);
  });
});
