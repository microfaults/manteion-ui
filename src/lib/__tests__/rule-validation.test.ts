import { type RuleDraft, validateRuleDraft } from "@/lib/rule-validation";
import type { RuleAction } from "@/types/api";
import { describe, expect, it } from "vitest";

const FAULT_ACTION: RuleAction = { type: "fault_spec", fault_spec_id: "spec-1" };
const READY = { status: "ready", specIds: ["spec-1", "spec-2"] } as const;
const READY_EMPTY = { status: "ready", specIds: [] } as const;
const ERRORED = { status: "error" } as const;

function draft(overrides: Partial<RuleDraft> = {}): RuleDraft {
  return {
    name: "hang-productcatalogservice",
    service: "productcatalog",
    priority: 50,
    action: FAULT_ACTION,
    ...overrides,
  };
}

const fields = (issues: { field: string }[]) => issues.map((i) => i.field);

describe("validateRuleDraft — required fields", () => {
  it("accepts a complete fault_spec draft whose spec exists in the catalog", () => {
    expect(validateRuleDraft(draft(), READY)).toEqual([]);
  });

  it("rejects a blank or whitespace-only name", () => {
    expect(fields(validateRuleDraft(draft({ name: "" }), READY))).toContain("name");
    expect(fields(validateRuleDraft(draft({ name: "   " }), READY))).toContain("name");
  });

  it("rejects a missing service", () => {
    expect(fields(validateRuleDraft(draft({ service: "" }), READY))).toContain("service");
  });

  it("collects all issues instead of failing fast", () => {
    const issues = validateRuleDraft(draft({ name: "", service: "" }), READY);
    expect(fields(issues)).toEqual(expect.arrayContaining(["name", "service"]));
  });
});

describe("validateRuleDraft — priority bounds", () => {
  it("rejects NaN priority (number input cleared or '-' mid-typing)", () => {
    expect(fields(validateRuleDraft(draft({ priority: Number.NaN }), READY))).toContain("priority");
  });

  it("rejects non-integer and out-of-range priority", () => {
    expect(fields(validateRuleDraft(draft({ priority: 1.5 }), READY))).toContain("priority");
    expect(fields(validateRuleDraft(draft({ priority: -1 }), READY))).toContain("priority");
    expect(fields(validateRuleDraft(draft({ priority: 1001 }), READY))).toContain("priority");
  });

  it("accepts boundary priorities 0 and 1000", () => {
    expect(validateRuleDraft(draft({ priority: 0 }), READY)).toEqual([]);
    expect(validateRuleDraft(draft({ priority: 1000 }), READY)).toEqual([]);
  });
});

describe("validateRuleDraft — rules require faults", () => {
  it("blocks a fault_spec rule when the catalog is loaded and empty (create faults first)", () => {
    const issues = validateRuleDraft(draft(), READY_EMPTY);
    expect(fields(issues)).toContain("action");
    expect(issues.find((i) => i.field === "action")?.message).toMatch(/faults page/i);
  });

  it("blocks a fault_spec rule whose id is not in the loaded catalog", () => {
    const issues = validateRuleDraft(
      draft({ action: { type: "fault_spec", fault_spec_id: "spec-deleted" } }),
      READY,
    );
    expect(issues.find((i) => i.field === "action")?.message).toMatch(/spec-deleted/);
  });

  it("requires a fault spec id even when the catalog cannot be loaded", () => {
    const issues = validateRuleDraft(
      draft({ action: { type: "fault_spec", fault_spec_id: "" } }),
      ERRORED,
    );
    expect(fields(issues)).toContain("action");
  });

  it("keeps the manual-id escape hatch when the catalog fetch failed", () => {
    const issues = validateRuleDraft(
      draft({ action: { type: "fault_spec", fault_spec_id: "spec-manual" } }),
      ERRORED,
    );
    expect(issues).toEqual([]);
  });

  it("does not check spec existence while the catalog is still loading", () => {
    const issues = validateRuleDraft(draft(), { status: "loading" });
    expect(issues).toEqual([]);
  });

  it("requires a composition id for fault_composition rules", () => {
    const issues = validateRuleDraft(
      draft({ action: { type: "fault_composition", fault_composition_id: "" } }),
      READY,
    );
    expect(fields(issues)).toContain("action");
  });

  it("cachebox rules need no fault prerequisites", () => {
    const issues = validateRuleDraft(
      draft({
        action: { type: "cachebox", cachebox: { mode: "replay", key_strategy: "exact" } },
      }),
      READY_EMPTY,
    );
    expect(issues).toEqual([]);
  });
});
