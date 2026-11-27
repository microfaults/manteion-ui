import { renderWithRouter } from "@/test-utils/render-with-router";
import type { FaultSpec, Rule } from "@/types/api";
import { screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

const SPECS: FaultSpec[] = ["spec-once", "spec-thrice", "spec-none"].map((id) => ({
  id,
  name: id,
  category: "inline",
  fault_type: "latency",
  params: { delay: "50ms" },
  created_at: "2026-08-25T00:00:00Z",
}));

const ruleUsing = (id: string, specId: string): Rule => ({
  id,
  name: id,
  service: "productcatalogservice",
  enabled: true,
  priority: 50,
  mode: "inline",
  action: { type: "fault_spec", fault_spec_id: specId },
  match: {},
  created_at: "2026-08-25T00:00:00Z",
  updated_at: "2026-08-25T00:00:00Z",
});

const RULES: Rule[] = [
  ruleUsing("r1", "spec-once"),
  ruleUsing("r2", "spec-thrice"),
  ruleUsing("r3", "spec-thrice"),
  ruleUsing("r4", "spec-thrice"),
];

vi.mock("@/lib/api", () => ({
  faultsApi: { listFaultSpecs: vi.fn(async () => SPECS) },
  rulesApi: { listRules: vi.fn(async () => RULES) },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: { component: React.ComponentType }) => ({
      options,
      useSearch: () => ({}),
    }),
  };
});

describe("Faults list", () => {
  it("says how many rules use each spec, with the verb agreeing", async () => {
    const { Route } = await import("@/routes/faults/index");
    const Page = (Route as unknown as { options: { component: React.ComponentType } }).options
      .component;
    renderWithRouter(<Page />);

    expect(await screen.findByText("1 rule uses this")).toBeTruthy();
    expect(screen.getByText("3 rules use this")).toBeTruthy();
    expect(screen.getByText("No rules use this")).toBeTruthy();
    expect(screen.queryByText("1 rule use this")).toBeNull();
    expect(screen.queryByText("unused")).toBeNull();
  });
});
