import {
  baselinePhase,
  metricsFromResults,
  metricsFromZeusStats,
  pctDelta,
  phaseDatasetIds,
  phaseDurationMs,
  phaseProgress,
  plannedPhaseMs,
} from "@/lib/phase-metrics";
import type { PhaseResults, PhaseWorkflowResult, ZeusRunStats } from "@/types/api";
import { describe, expect, it } from "vitest";

const wr = (over: Partial<PhaseWorkflowResult>): PhaseWorkflowResult => ({
  phase_id: "ph-1",
  workflow_id: "wf-1",
  request_count: 1000,
  error_count: 10,
  error_rate: 0.01,
  throughput_rps: 100,
  latency_p50_us: 10_000,
  latency_p95_us: 30_000,
  latency_p99_us: 50_000,
  ...over,
});

const results = (workflow_results: PhaseWorkflowResult[]): PhaseResults => ({
  workflow_results,
  service_latency: [],
  service_cache: [],
});

describe("metricsFromResults", () => {
  it("returns undefined when the phase has no workflow_results (run-only phase before B4)", () => {
    expect(metricsFromResults(results([]))).toBeUndefined();
  });

  it("aggregates across workflows: worst percentiles, summed throughput, pooled error rate", () => {
    const m = metricsFromResults(
      results([
        wr({}),
        wr({
          workflow_id: "wf-2",
          request_count: 500,
          error_count: 0,
          error_rate: 0,
          throughput_rps: 50,
          latency_p50_us: 20_000,
          latency_p95_us: 40_000,
          latency_p99_us: 80_000,
        }),
      ]),
    );
    expect(m).toEqual({
      source: "harvested",
      request_count: 1500,
      error_count: 10,
      error_rate: 10 / 1500,
      rps: 150,
      p50_us: 20_000,
      p95_us: 40_000,
      p99_us: 80_000,
    });
  });
});

describe("metricsFromZeusStats", () => {
  const stats = (over: Partial<ZeusRunStats>): ZeusRunStats => ({
    run_id: "run-1",
    status: "completed",
    duration_ms: 300_000,
    iterations: 10,
    requests_sent: 1000,
    requests_ok: 990,
    requests_dropped: 10,
    latency_p50_us: 18_400,
    latency_p95_us: 42_100,
    latency_p99_us: 61_200,
    ...over,
  });

  it("derives throughput and error rate from the run stats", () => {
    expect(metricsFromZeusStats(stats({}))).toEqual({
      source: "zeus",
      request_count: 1000,
      error_count: 10,
      error_rate: 0.01,
      rps: 1000 / 300,
      p50_us: 18_400,
      p95_us: 42_100,
      p99_us: 61_200,
    });
  });

  it("leaves rates and percentiles undefined for an empty run", () => {
    const m = metricsFromZeusStats(
      stats({
        duration_ms: 0,
        requests_sent: 0,
        requests_ok: 0,
        requests_dropped: 0,
        latency_p50_us: 0,
        latency_p95_us: 0,
        latency_p99_us: 0,
      }),
    );
    expect(m.rps).toBeUndefined();
    expect(m.error_rate).toBeUndefined();
    expect(m.p99_us).toBeUndefined();
    expect(m.request_count).toBe(0);
  });
});

describe("phaseDurationMs", () => {
  it("uses completed_at − started_at when terminal, now − started_at while in flight, null if never started", () => {
    expect(
      phaseDurationMs({ started_at: "2026-06-01T00:00:00Z", completed_at: "2026-06-01T00:02:14Z" }),
    ).toBe(134_000);
    expect(
      phaseDurationMs({ started_at: "2026-06-01T00:00:00Z" }, Date.parse("2026-06-01T00:01:00Z")),
    ).toBe(60_000);
    expect(phaseDurationMs({})).toBeNull();
    expect(phaseDurationMs({ completed_at: "2026-06-01T00:02:14Z" })).toBeNull();
  });
});

describe("pctDelta", () => {
  it("formats the p99 delta against baseline, empty when the baseline is 0", () => {
    expect(pctDelta(2000, 2500)).toBe("+25% vs baseline");
    expect(pctDelta(2000, 1500)).toBe("-25% vs baseline");
    expect(pctDelta(0, 1)).toBe("");
  });
});

describe("baselinePhase", () => {
  it("prefers the phase named baseline, else the first phase by position", () => {
    const phases = [
      { id: "b", name: "isolation-x", position: 1, frozen_services: [], rule_ids: [] },
      { id: "a", name: "baseline", position: 2, frozen_services: [], rule_ids: [] },
    ];
    expect(baselinePhase(phases)?.id).toBe("a");
    expect(baselinePhase(phases.filter((p) => p.name !== "baseline"))?.id).toBe("b");
    expect(baselinePhase([])).toBeUndefined();
  });
});

describe("phaseProgress", () => {
  const workflows = [{ duration_sec: 300 }, { duration_sec: 120 }];
  it("plans by the longest workflow leg and reports capped time-based progress", () => {
    expect(plannedPhaseMs({ workflows })).toBe(300_000);
    expect(plannedPhaseMs({ workflows: [] })).toBeNull();
    const p = phaseProgress(
      { started_at: "2026-06-01T00:00:00Z", workflows },
      Date.parse("2026-06-01T00:03:24Z"),
    );
    expect(p).toEqual({ elapsedMs: 204_000, plannedMs: 300_000, fraction: 0.68 });
    const over = phaseProgress(
      { started_at: "2026-06-01T00:00:00Z", workflows },
      Date.parse("2026-06-01T00:10:00Z"),
    );
    expect(over?.fraction).toBe(1);
    expect(phaseProgress({ workflows })).toBeNull();
  });
});

describe("phaseDatasetIds", () => {
  it("prefers the backend's derived union and falls back to the workflows' dataset ids", () => {
    expect(phaseDatasetIds({ dataset_ids: ["ds-b"], workflows: [{ dataset_id: "ds-a" }] })).toEqual(
      ["ds-b"],
    );
    expect(
      phaseDatasetIds({
        workflows: [{ dataset_id: "ds-a" }, { dataset_id: "" }, { dataset_id: "ds-a" }, {}],
      }),
    ).toEqual(["ds-a"]);
  });
});
