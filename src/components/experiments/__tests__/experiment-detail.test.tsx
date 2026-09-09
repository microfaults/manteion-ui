import { ExperimentDetail } from "@/components/experiments/experiment-detail";
import type { Experiment } from "@/types/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  experimentsApi: {
    getExperiment: vi.fn(),
    getExperimentResults: vi.fn(),
    getPhaseResults: vi.fn(),
    workflowIdsForExperiment: (e: Experiment) => [
      ...new Set(e.phases.flatMap((p) => p.workflows.map((w) => w.workflow_id))),
    ],
    startPhase: vi.fn(),
    startExperiment: vi.fn(),
    pauseExperiment: vi.fn(),
    resumeExperiment: vi.fn(),
    cancelExperiment: vi.fn(),
    stopExperiment: vi.fn(),
    deleteExperiment: vi.fn(),
  },
  phasesApi: {
    pausePhase: vi.fn(),
    resumePhase: vi.fn(),
    stopPhase: vi.fn(),
    getPhaseFaults: vi.fn(),
  },
  zeusRunsApi: { getRun: vi.fn(), getRunStats: vi.fn() },
  rulesApi: { listRules: vi.fn() },
  workflowsApi: { listWorkflows: vi.fn() },
}));
import { experimentsApi, phasesApi, rulesApi, workflowsApi, zeusRunsApi } from "@/lib/api";

const EXPERIMENT: Experiment = {
  id: "exp-1",
  name: "checkout-p99-isolation",
  description: "Isolate which downstream dominates checkout tail latency.",
  hypothesis: "productcatalog hang drives >60% of checkout p99.",
  status: "running",
  targeted_services: ["productcatalog", "cartservice"],
  created_by: "pmundra",
  created_at: "2026-06-01T00:00:00Z",
  started_at: "2026-06-01T00:00:00Z",
  phases: [
    {
      id: "ph-baseline",
      name: "baseline",
      position: 0,
      status: "completed",
      started_at: "2026-06-01T00:00:00Z",
      completed_at: "2026-06-01T00:05:00Z",
      workflows: [{ workflow_id: "wf-checkout", vus: 25, duration_sec: 300, zeus_run_id: "run-b" }],
      frozen_services: [],
      rule_ids: [],
    },
    {
      id: "ph-iso",
      name: "isolation-productcatalog",
      position: 1,
      status: "running",
      started_at: "2026-06-01T00:06:00Z",
      workflows: [{ workflow_id: "wf-checkout", vus: 25, duration_sec: 300, zeus_run_id: "run-i" }],
      frozen_services: [{ service: "cartservice", mode: "replay" }],
      rule_ids: ["rule-1"],
    },
  ],
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("ExperimentDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(experimentsApi.getExperiment).mockResolvedValue(EXPERIMENT);
    vi.mocked(experimentsApi.getExperimentResults).mockResolvedValue({
      experiment_id: "exp-1",
      available: true,
      phase_count: 2,
      completed_phase_count: 1,
      total_request_count: 43_400,
      total_error_count: 91,
      overall_error_rate: 0.0021,
      worst_p99_us: 61_200,
      worst_p99_phase_id: "ph-baseline",
      best_p99_us: 61_200,
      best_p99_phase_id: "ph-baseline",
      computed_at: "2026-06-01T00:05:00Z",
    });
    vi.mocked(experimentsApi.getPhaseResults).mockResolvedValue({
      workflow_results: [],
      service_latency: [],
      service_cache: [],
    });
    vi.mocked(rulesApi.listRules).mockResolvedValue([
      {
        id: "rule-1",
        name: "hang-catalog",
        service: "productcatalog",
        enabled: true,
        priority: 1,
        mode: "inline",
        action: { type: "fault_spec", fault_spec_id: "spec-1" },
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
      },
    ]);
    vi.mocked(workflowsApi.listWorkflows).mockResolvedValue([
      {
        id: "wf-checkout",
        name: "checkout-burst",
        version: "v2",
        targets: ["productcatalog"],
        estRpsPerVu: 4,
        updatedAt: "2026-06-01T00:00:00Z",
        requestNodeCount: 3,
      },
    ]);
    vi.mocked(zeusRunsApi.getRun).mockResolvedValue({ id: "run-i", status: "running" });
    vi.mocked(zeusRunsApi.getRunStats).mockResolvedValue(undefined);
    vi.mocked(phasesApi.pausePhase).mockResolvedValue(undefined);
  });

  it("renders the header, rollup stat cards and the Phases tab with live rows wired to the flat phase actions", async () => {
    render(
      wrap(
        <ExperimentDetail
          experimentId="exp-1"
          onDeleted={() => {}}
          now={Date.parse("2026-06-01T00:08:00Z")}
        />,
      ),
    );
    expect(await screen.findByRole("heading", { name: "checkout-p99-isolation" })).toBeTruthy();
    expect(screen.getByText("running")).toBeTruthy();
    expect(await screen.findByText("43.4k")).toBeTruthy();
    expect(screen.getByText("0.21%")).toBeTruthy();
    expect(screen.getByText("61ms")).toBeTruthy();
    expect(screen.getByText(/baseline · 1 phase measured/)).toBeTruthy();
    expect(experimentsApi.getExperiment).toHaveBeenCalledWith("exp-1");

    // Radix tabs activate on mousedown, not click.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Phases" }), { button: 0 });
    const iso = await screen.findByRole("listitem", { name: "Phase isolation-productcatalog" });
    expect(await within(iso).findByText("checkout-burst")).toBeTruthy();
    expect(within(iso).getByText("hang-catalog")).toBeTruthy();
    fireEvent.click(within(iso).getByRole("button", { name: "Pause" }));
    await vi.waitFor(() => expect(phasesApi.pausePhase).toHaveBeenCalledWith("ph-iso"));
  });
});
