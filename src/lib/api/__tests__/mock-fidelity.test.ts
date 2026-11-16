/**
 * The mock build is the public demo, so its fixtures must look like the real
 * system: real service names and routes, and experiments the real backend
 * would accept. Fixtures are imported directly (Vitest pins
 * VITE_USE_MOCK=false, so the API modules would not serve them).
 */
import { mockRuleById } from "@/lib/api/rules";
import { REAL_SERVICES } from "@/lib/known-services";
import type { WorkflowNode } from "@/lib/workflow-types";
import { DEFAULT_CACHEBOX_KEY_STRATEGY } from "@/types/api";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_EXPERIMENT_ID,
  mockCatalogEndpoints,
  mockExperiments,
  mockWorkflows,
} from "../mock-fixtures";

function allMockServices(): string[] {
  const out = new Set<string>();
  for (const w of mockWorkflows) for (const s of w.targets) out.add(s);
  for (const e of mockExperiments) {
    for (const s of e.targeted_services) out.add(s);
    for (const p of e.phases) for (const f of p.frozen_services) out.add(f.service);
  }
  for (const c of mockCatalogEndpoints) out.add(c.service);
  return [...out];
}

function requestLines(node: WorkflowNode): string[] {
  switch (node.type) {
    case "request":
      return [`${node.method} ${node.path}`];
    case "sequence":
    case "parallel":
      return node.children.flatMap(requestLines);
    case "optional":
      return requestLines(node.child);
    default:
      return [];
  }
}

const INVENTED_ROUTES = /\/currency\/convert|\/payment\/charge|\/email\/confirm|\/cart\/checkout/;

describe("mock fixtures match the real system", () => {
  it("uses only real service names", () => {
    for (const s of allMockServices()) expect(REAL_SERVICES).toContain(s);
    expect(allMockServices()).toContain("recommendationservice");
    expect(allMockServices()).not.toContain("productcatalog");
  });

  it("never freezes a service before a recording phase", () => {
    for (const e of mockExperiments)
      e.phases.forEach((p, i) => {
        if (p.frozen_services.length > 0)
          expect(e.phases.slice(0, i).some((q) => q.persist_cache)).toBe(true);
      });
  });

  it("keys a phase's cache-box rules like the freeze on the same service", () => {
    let checked = 0;
    for (const e of mockExperiments)
      for (const p of e.phases)
        for (const id of p.rule_ids) {
          const rule = mockRuleById(id);
          if (rule?.action.type !== "cachebox") continue;
          const freeze = p.frozen_services.find((f) => f.service === rule.service);
          if (!freeze) continue;
          checked++;
          expect(rule.action.cachebox.key_strategy, `${p.id} ${id}`).toBe(
            freeze.key_strategy || DEFAULT_CACHEBOX_KEY_STRATEGY,
          );
        }
    // rule-009 on ph-002-replay is the known case; guard against a vacuous pass.
    expect(checked).toBeGreaterThan(0);
  });

  it("serves real catalog routes", () => {
    const paths = mockCatalogEndpoints.map((c) => `${c.service} ${c.method} ${c.path}`);
    expect(paths).toContain("currencyservice POST /convert");
    expect(paths).toContain("paymentservice POST /charge");
    expect(paths).toContain("emailservice POST /send-order-confirmation");
    expect(paths).toContain("checkoutservice POST /placeorder");
    expect(paths).toContain("cartservice POST /cart/{user_id}/items");
    expect(paths.join("\n")).not.toMatch(INVENTED_ROUTES);
  });

  it("uses real routes in the workflow fixtures", () => {
    const lines = mockWorkflows.flatMap((w) => requestLines(w.root));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toMatch(INVENTED_ROUTES);
  });

  it("has a three-phase sample experiment with no freeze", () => {
    const s = mockExperiments.find((e) => e.id === SAMPLE_EXPERIMENT_ID);
    expect(s).toBeDefined();
    if (!s) return;
    expect(s.status).toBe("planned");
    expect(s.phases.map((p) => p.name)).toEqual(["plain", "catalog-latency-50ms", "plain-end"]);
    expect(s.phases.every((p) => p.frozen_services.length === 0)).toBe(true);
    expect(s.targeted_services).toEqual(["productcatalogservice"]);
  });
});
