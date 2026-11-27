/**
 * The demo's fixtures describe one world: the bed's eleven services, each
 * with an SDK instance, and every rule, fault spec, experiment, workflow and
 * catalog endpoint naming only those. The Dashboard tile, the Services card
 * and the Services page count the same services. When a fixture drifts
 * (a renamed service, a rule for a service with no instance, a phase that
 * names a missing rule) this file fails.
 */
import { REAL_SERVICES } from "@/lib/known-services";
import { MOCK_METRIC_SERVICES } from "@/lib/prometheus";
import { summarizeServiceHealth } from "@/lib/service-health";
import { buildServicesPanelRows } from "@/lib/service-panel";
import { describe, expect, it } from "vitest";
import { mockFaultSpecById, mockFaultSpecs } from "../faults";
import { mockPhaseDetail } from "../mock-experiments";
import {
  SAMPLE_EXPERIMENT_ID,
  mockCatalogEndpoints,
  mockExperiments,
  mockWorkflows,
} from "../mock-fixtures";
import { mockRuleById, mockRules } from "../rules";
import { mockSDKInstanceDetail, mockSDKInstances } from "../services";

const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();
const ELEVEN = sorted(REAL_SERVICES);

describe("the demo's fixtures describe one world", () => {
  const instances = mockSDKInstances();
  const rules = mockRules();
  const specs = mockFaultSpecs();

  it("registers an instance for each of the bed's eleven services, and has traffic for the same", () => {
    expect(ELEVEN).toHaveLength(11);
    expect(sorted(instances.map((i) => i.service))).toEqual(ELEVEN);
    expect(sorted(MOCK_METRIC_SERVICES)).toEqual(ELEVEN);
  });

  it("counts the same services on the Dashboard tile, the Services card and the Services page", () => {
    const tile = summarizeServiceHealth(instances);
    const card = buildServicesPanelRows(
      instances,
      [...MOCK_METRIC_SERVICES],
      {},
      { ratesLoading: false, ratesError: false },
    );
    expect(tile.services).toBe(11);
    expect(card.total).toBe(11);
    expect(new Set(instances.map((i) => i.service)).size).toBe(11);

    const byDot = (dot: string) => card.rows.filter((r) => r.dotStatus === dot).length;
    expect(byDot("healthy")).toBe(tile.healthy);
    expect(byDot("degraded")).toBe(tile.degraded);
    expect(byDot("down")).toBe(tile.failing);
    expect(byDot("unknown")).toBe(tile.unknown);
  });

  it("names only the bed's services everywhere", () => {
    const named = [
      ...instances.map((i) => i.service),
      ...rules.map((r) => r.service),
      ...specs.flatMap((s) => (s.network?.target ? [s.network.target] : [])),
      ...mockExperiments.flatMap((e) => [
        ...e.targeted_services,
        ...e.phases.flatMap((p) => p.frozen_services.map((f) => f.service)),
      ]),
      ...mockWorkflows.flatMap((w) => w.targets),
      ...mockCatalogEndpoints.map((c) => c.service),
      ...MOCK_METRIC_SERVICES,
    ];
    const strays = named.filter((s) => !REAL_SERVICES.includes(s));
    expect(strays).toEqual([]);
  });

  it("resolves every reference between rules, specs, phases and instances", () => {
    const withInstance = new Set(instances.map((i) => i.service));
    for (const r of rules) expect(withInstance.has(r.service), r.id).toBe(true);
    for (const r of rules) {
      if (r.action.type === "fault_spec") {
        expect(mockFaultSpecById(r.action.fault_spec_id), r.id).toBeDefined();
      }
    }
    for (const e of mockExperiments) {
      for (const p of e.phases) {
        for (const id of p.rule_ids) expect(mockRuleById(id), `${p.id} → ${id}`).toBeDefined();
      }
    }
  });

  it("gives every instance one-v version and generations, and links only real phases", () => {
    for (const i of instances) {
      expect(i.version, i.id).toMatch(/^v\d+\.\d+\.\d+$/);
      const d = mockSDKInstanceDetail(i.id);
      expect(typeof d.observed_generation, i.id).toBe("number");
      expect(typeof d.applied_generation, i.id).toBe("number");
      for (const phaseId of d.recent_run_ids) expect(mockPhaseDetail(phaseId).id).toBe(phaseId);
    }
  });

  it("states the sample hypothesis about the p95 tail", () => {
    const sample = mockExperiments.find((e) => e.id === SAMPLE_EXPERIMENT_ID);
    expect(sample?.hypothesis).toMatch(/p95 tail/);
    expect(sample?.hypothesis).toMatch(/product and cart pages/);
  });
});
