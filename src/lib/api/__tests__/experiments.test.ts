import {
  ExperimentResultsSchema,
  ExperimentSchema,
  PhaseDetailSchema,
  PhaseListItemSchema,
  PhaseNameSchema,
  PhaseResultsSchema,
  PhaseStatusSchema,
  PhaseSummarySchema,
  ZEUS_STATS_PENDING,
  ZeusRunSchema,
  ZeusRunStatsSchema,
} from "@/types/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the shared client so we exercise experiments.ts logic (paths, params)
// without real network. Schema-vs-wire correctness is checked separately below
// by parsing backend-shaped fixtures with the real Zod schemas.
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      del: vi.fn(),
      baseUrl: "",
      environment: "test",
    },
  };
});

import { apiClient } from "@/lib/api/client";
import * as experimentsApi from "@/lib/api/experiments";

/** Full backend vocabulary — manteion-go internal/model/enums.go PhaseStatusValues. */
const BACKEND_PHASE_STATUSES = [
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "skipped",
  "draining",
] as const;

describe("phase schemas ↔ manteion-go wire shapes", () => {
  it.each(BACKEND_PHASE_STATUSES)("PhaseStatusSchema accepts %j", (status) => {
    expect(PhaseStatusSchema.parse(status)).toBe(status);
  });

  it("PhaseNameSchema accepts free-form names (experiment_phases.name is UNIQUE text, not an enum)", () => {
    expect(PhaseNameSchema.parse("isolation-productcatalog")).toBe("isolation-productcatalog");
  });

  it("PhaseSummarySchema parses the phaseDetail payload served by GET …/phases/{phaseId}", () => {
    const p = PhaseSummarySchema.parse({
      id: "ph-2",
      experiment_id: "exp-1",
      name: "isolation-productcatalog",
      position: 1,
      status: "paused",
      frozen_services: [
        {
          service: "productcatalog",
          mode: "replay",
          workflow_scope: "",
          key_strategy: "exact",
          mutation_policy: "deny",
        },
      ],
      persist_cache: false,
      started_at: "2026-06-01T00:00:00Z",
      workflows: null,
      rule_ids: ["rule-001"],
    });
    expect(p.id).toBe("ph-2");
    expect(p.status).toBe("paused");
    expect(p.rule_ids).toEqual(["rule-001"]);
    // composePhaseDetail leaves `workflows` nil (→ null) for a phase without rows.
    expect(p.workflows).toEqual([]);
    expect(p.frozen_services).toEqual([
      expect.objectContaining({ service: "productcatalog", mode: "replay" }),
    ]);
  });
});

describe("experimentsApi.getPhaseStatus", () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it("fetches the phase by id — GET /api/v1/experiments/{id}/phases/{phaseId}", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      id: "ph-2",
      name: "baseline",
      status: "skipped",
    });
    await experimentsApi.getPhaseStatus("exp-1", "ph-2");
    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/v1/experiments/exp-1/phases/ph-2",
      expect.anything(),
    );
  });

  it("URL-encodes both ids", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ id: "p/2", name: "x", status: "pending" });
    await experimentsApi.getPhaseStatus("e 1", "p/2");
    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/v1/experiments/e%201/phases/p%2F2",
      expect.anything(),
    );
  });
});

/** GET …/phases/{phaseId}/results for a harvested (attack-backed) phase. */
const PHASE_RESULTS_WIRE = {
  workflow_results: [
    {
      phase_id: "ph-2",
      workflow_id: "wf-1",
      request_count: 1000,
      error_count: 2,
      error_rate: 0.002,
      throughput_rps: 104.6,
      latency_p50_us: 18_400,
      latency_p95_us: 42_100,
      latency_p99_us: 61_200,
      latency_p999_us: 90_000,
      computed_at: "2026-06-01T00:05:00Z",
    },
  ],
  service_latency: [
    {
      phase_id: "ph-2",
      service: "cartservice",
      workflow_id: "wf-1",
      latency_p50_us: 900,
      latency_p95_us: 2_100,
      latency_p99_us: 3_300,
      request_count: 10,
      computed_at: "2026-06-01T00:05:00Z",
    },
  ],
  service_cache: [
    {
      phase_id: "ph-2",
      service: "cartservice",
      cache_hit_rate: 0.98,
      cache_exact_match: 0.9,
      cache_staleness: 0.1,
      request_count: 10,
      recorded_entry_count: 9,
    },
  ],
  verdict: { verdict: "VALID", collision_rate: 0, replay_age_max_ms: 10, replay_age_mean_ms: 4 },
  drain: { status: "clean" },
};

describe("results, flat-phase and zeus schemas ↔ manteion-go / zeus wire shapes", () => {
  it("PhaseSummarySchema drops the pre-epoch-2 inline metrics/applied_rules and keeps failure_reason", () => {
    const p = PhaseSummarySchema.parse({
      id: "ph-1",
      name: "baseline",
      status: "failed",
      workflows: [],
      rule_ids: [],
      failure_reason: "zeus rejected run: 422",
      applied_rules: [{ rule_id: "r" }],
      metrics: { p99_us: 1 },
      duration_ms: 5,
    });
    expect(p.failure_reason).toBe("zeus rejected run: 422");
    expect(p).not.toHaveProperty("applied_rules");
    expect(p).not.toHaveProperty("metrics");
    expect(p).not.toHaveProperty("duration_ms");
  });

  it("ExperimentSchema keeps failure_reason (B8) and parses draining phases", () => {
    const e = ExperimentSchema.parse({
      id: "exp-1",
      name: "x",
      status: "failed",
      created_at: "2026-06-01T00:00:00Z",
      failure_reason: "phase isolation failed",
      phases: [
        { id: "ph-1", name: "isolation", status: "draining", workflows: [], rule_ids: ["rule-1"] },
      ],
    });
    expect(e.failure_reason).toBe("phase isolation failed");
    expect(e.phases[0]?.status).toBe("draining");
  });

  it("PhaseResultsSchema parses a harvested phase's results", () => {
    const r = PhaseResultsSchema.parse(PHASE_RESULTS_WIRE);
    expect(r.workflow_results[0]?.latency_p99_us).toBe(61_200);
    expect(r.service_cache[0]?.cache_hit_rate).toBe(0.98);
    expect(r.verdict?.verdict).toBe("VALID");
    expect(r.drain?.status).toBe("clean");
  });

  it("PhaseResultsSchema accepts the empty envelope of a run-only phase (harvest skips k6 runs)", () => {
    const r = PhaseResultsSchema.parse({
      workflow_results: [],
      service_latency: [],
      service_cache: [],
    });
    expect(r.workflow_results).toEqual([]);
    expect(r.verdict).toBeUndefined();
    expect(r.drain).toBeUndefined();
  });

  it("ExperimentResultsSchema distinguishes the {available:false} placeholder from a rollup", () => {
    const none = ExperimentResultsSchema.parse({ experiment_id: "exp-1", available: false });
    expect(none.available).toBe(false);
    const roll = ExperimentResultsSchema.parse({
      experiment_id: "exp-1",
      phase_count: 2,
      completed_phase_count: 2,
      total_request_count: 100,
      total_error_count: 1,
      overall_error_rate: 0.01,
      worst_p99_us: 500,
      worst_p99_phase_id: "ph-2",
      best_p99_us: 100,
      best_p99_phase_id: "ph-1",
      computed_at: "2026-06-01T00:05:00Z",
    });
    expect(roll.available).toBe(true);
    expect(roll.worst_p99_us).toBe(500);
  });

  it("PhaseDetailSchema parses GET /api/v1/phases/{phaseId} (totals + workflow_results)", () => {
    const d = PhaseDetailSchema.parse({
      id: "ph-2",
      experiment_id: "exp-1",
      name: "isolation",
      position: 1,
      status: "completed",
      frozen_services: null,
      persist_cache: false,
      experiment_name: "checkout-p99",
      workflows: [
        { phase_id: "ph-2", workflow_id: "wf-1", vus: 10, duration_sec: 60, zeus_run_id: "run-1" },
      ],
      workflow_results: [PHASE_RESULTS_WIRE.workflow_results[0]],
      total_request_count: 1000,
      total_error_count: 2,
      overall_error_rate: 0.002,
    });
    expect(d.experiment_name).toBe("checkout-p99");
    expect(d.frozen_services).toEqual([]);
    expect(d.workflows[0]?.zeus_run_id).toBe("run-1");
    expect(d.total_request_count).toBe(1000);
  });

  it("PhaseListItemSchema parses the flat GET /api/v1/phases rows", () => {
    const item = PhaseListItemSchema.parse({
      id: "ph-2",
      experiment_id: "exp-1",
      experiment_name: "checkout-p99",
      name: "isolation",
      position: 1,
      workflow_ids: ["wf-1"],
      frozen_service_count: 1,
      status: "running",
      started_at: "2026-06-01T00:00:00Z",
    });
    expect(item.workflow_ids).toEqual(["wf-1"]);
    expect(item.frozen_service_count).toBe(1);
  });

  it("ZeusRunSchema parses zeus run JSON; ended_at/reason/k6_job_name are optional", () => {
    const run = ZeusRunSchema.parse({
      id: "run-1",
      workflow_id: "wf-1",
      status: "running",
      started_at: "2026-06-01T00:00:00Z",
      labels: {},
    });
    expect(run.reason).toBeUndefined();
    const done = ZeusRunSchema.parse({
      id: "run-1",
      status: "failed",
      reason: "k6 exited 99",
      k6_job_name: "k6-run-1",
      ended_at: "2026-06-01T00:05:00Z",
    });
    expect(done.reason).toBe("k6 exited 99");
    expect(done.k6_job_name).toBe("k6-run-1");
  });

  it("ZeusRunStatsSchema converts nanosecond durations to µs/ms at the boundary", () => {
    const s = ZeusRunStatsSchema.parse({
      run_id: "run-1",
      workflow_id: "wf-1",
      status: "completed",
      duration: 300_000_000_000,
      iterations: 4200,
      requests_sent: 1000,
      requests_ok: 990,
      requests_dropped: 10,
      latency_p50: 18_400_000,
      latency_p95: 42_100_000,
      latency_p99: 61_200_000,
      variant_distribution: {},
      finalized_at: "2026-06-01T00:05:00Z",
    });
    expect(s?.duration_ms).toBe(300_000);
    expect(s?.latency_p50_us).toBe(18_400);
    expect(s?.latency_p99_us).toBe(61_200);
    expect(s?.requests_dropped).toBe(10);
  });

  it("ZeusRunStatsSchema maps zeus's in-flight placeholder to undefined", () => {
    expect(
      ZeusRunStatsSchema.parse({ run_id: "run-1", status: ZEUS_STATS_PENDING }),
    ).toBeUndefined();
  });
});
