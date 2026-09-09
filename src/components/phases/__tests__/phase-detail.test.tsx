import { PhaseDetail } from "@/components/phases/phase-detail";
import { renderWithRouter } from "@/test-utils/render-with-router";
import type { Experiment, PhaseDetail as PhaseDetailDto } from "@/types/api";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  phasesApi: {
    getPhaseDetail: vi.fn(),
    getPhaseFaults: vi.fn(),
    pausePhase: vi.fn(),
    resumePhase: vi.fn(),
    stopPhase: vi.fn(),
  },
  experimentsApi: { getExperiment: vi.fn(), getPhaseResults: vi.fn(), startPhase: vi.fn() },
  zeusRunsApi: { getRun: vi.fn(), getRunStats: vi.fn() },
  rulesApi: { listRules: vi.fn() },
  workflowsApi: { listWorkflows: vi.fn() },
}));
import { experimentsApi, phasesApi, rulesApi, workflowsApi, zeusRunsApi } from "@/lib/api";

const NOW = Date.parse("2026-06-01T00:10:00Z");
const RUN_ID = "run-c41e07abcd";
const DETAIL: PhaseDetailDto = {
  id: "ph-iso",
  experiment_id: "exp-1",
  experiment_name: "checkout-p99-isolation",
  name: "isolation-productcatalog",
  position: 1,
  status: "running",
  frozen_services: [{ service: "cartservice", mode: "replay", key_strategy: "canonical_v2" }],
  persist_cache: false,
  started_at: "2026-06-01T00:06:36Z",
  workflows: [{ workflow_id: "wf-checkout", vus: 25, duration_sec: 300, zeus_run_id: RUN_ID }],
  workflow_results: [],
  total_request_count: 0,
  total_error_count: 0,
  overall_error_rate: 0,
};
const EXPERIMENT: Experiment = {
  id: "exp-1",
  name: "checkout-p99-isolation",
  status: "running",
  targeted_services: [],
  created_at: "2026-06-01T00:00:00Z",
  phases: [
    {
      id: "ph-base",
      name: "baseline",
      position: 0,
      status: "completed",
      workflows: [],
      frozen_services: [],
      rule_ids: [],
    },
    {
      id: "ph-iso",
      name: "isolation-productcatalog",
      position: 1,
      status: "running",
      workflows: [],
      frozen_services: [],
      rule_ids: ["rule-1"],
    },
    {
      id: "ph-comb",
      name: "combined",
      position: 2,
      status: "pending",
      workflows: [],
      frozen_services: [],
      rule_ids: [],
    },
  ],
};

describe("PhaseDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(phasesApi.getPhaseDetail).mockResolvedValue(DETAIL);
    vi.mocked(phasesApi.getPhaseFaults).mockResolvedValue({
      frozen_services: DETAIL.frozen_services,
      phase_rules: [{ phase_id: "ph-iso", rule_id: "rule-1", position: 0 }],
      fault_events: [
        {
          id: "fe-1",
          source: "rule",
          service: "productcatalog",
          kind: "inline:hang",
          started_at: "2026-06-01T00:06:40Z",
        },
        {
          id: "fe-2",
          source: "cachebox",
          service: "cartservice",
          kind: "cachebox:replay",
          started_at: "2026-06-01T00:06:40Z",
        },
      ],
    });
    vi.mocked(phasesApi.stopPhase).mockResolvedValue(undefined);
    vi.mocked(experimentsApi.getExperiment).mockResolvedValue(EXPERIMENT);
    vi.mocked(experimentsApi.getPhaseResults).mockResolvedValue({
      workflow_results: [],
      service_latency: [],
      service_cache: [],
    });
    vi.mocked(zeusRunsApi.getRun).mockResolvedValue({
      id: RUN_ID,
      status: "running",
      started_at: "2026-06-01T00:06:37Z",
      k6_job_name: "k6-run-c41e07",
    });
    vi.mocked(zeusRunsApi.getRunStats).mockResolvedValue(undefined);
    vi.mocked(rulesApi.listRules).mockResolvedValue([
      {
        id: "rule-1",
        name: "freeze-productcatalog",
        service: "productcatalog",
        enabled: true,
        priority: 1,
        mode: "inline",
        action: { type: "fault_spec", fault_spec_id: "spec-hang" },
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
      },
    ]);
    vi.mocked(workflowsApi.listWorkflows).mockResolvedValue([
      {
        id: "wf-checkout",
        name: "checkout-burst",
        version: "v2",
        targets: [],
        estRpsPerVu: 4,
        updatedAt: "2026-06-01T00:00:00Z",
        requestNodeCount: 3,
      },
    ]);
  });

  it("renders a running phase: position in its experiment, time-based progress, live workflow row, faults in effect, run timeline, results placeholder, and stop with a status", async () => {
    renderWithRouter(<PhaseDetail phaseId="ph-iso" now={NOW} />);
    expect(await screen.findByRole("heading", { name: "isolation-productcatalog" })).toBeTruthy();
    expect(await screen.findByText(/phase 2 of 3 in/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "checkout-p99-isolation" }).getAttribute("href")).toBe(
      "/experiments/exp-1",
    );
    expect(screen.getByText(/3m 24s \/ 5m · time-based/)).toBeTruthy();
    expect((screen.getByRole("progressbar") as HTMLProgressElement).value).toBe(68);

    const workflows = screen.getByRole("region", { name: "Workflows" });
    expect(await within(workflows).findByText("checkout-burst")).toBeTruthy();
    expect(within(workflows).getByText("run-c41e07…")).toBeTruthy();
    expect(await within(workflows).findByText("running")).toBeTruthy();
    expect(screen.getByText("1 run")).toBeTruthy();

    const faults = screen.getByRole("region", { name: "Faults in effect" });
    expect(await within(faults).findByText("freeze-productcatalog")).toBeTruthy();
    expect(within(faults).getByText("enabled")).toBeTruthy();
    expect(within(faults).getByText(/· replay · canonical_v2/)).toBeTruthy();
    expect(within(faults).getByText(/cachebox:replay/)).toBeTruthy();

    const timeline = screen.getByRole("region", { name: "Run timeline" });
    expect(await within(timeline).findByText("starting → running")).toBeTruthy();
    expect(within(timeline).getByText(/k6 job k6-run-c41e07/)).toBeTruthy();

    expect(
      within(screen.getByRole("region", { name: "Results" })).getByText(
        /appear here when the phase finishes/,
      ),
    ).toBeTruthy();
    expect(experimentsApi.getPhaseResults).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Stop status"), { target: { value: "failed" } });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(phasesApi.stopPhase).toHaveBeenCalledWith("ph-iso", "failed"));
  });

  it("renders a completed run-only phase from zeus run stats with the fallback caption", async () => {
    vi.mocked(phasesApi.getPhaseDetail).mockResolvedValue({
      ...DETAIL,
      status: "completed",
      completed_at: "2026-06-01T00:11:36Z",
    });
    vi.mocked(zeusRunsApi.getRun).mockResolvedValue({
      id: RUN_ID,
      status: "completed",
      started_at: "2026-06-01T00:06:37Z",
      ended_at: "2026-06-01T00:11:36Z",
    });
    vi.mocked(zeusRunsApi.getRunStats).mockResolvedValue({
      run_id: RUN_ID,
      status: "completed",
      duration_ms: 300_000,
      iterations: 100,
      requests_sent: 3_000,
      requests_ok: 2_970,
      requests_dropped: 30,
      latency_p50_us: 9_000,
      latency_p95_us: 20_000,
      latency_p99_us: 24_800,
    });
    renderWithRouter(<PhaseDetail phaseId="ph-iso" now={NOW} />);
    expect(await screen.findByText("3.0k")).toBeTruthy();
    expect(screen.getByText("zeus run stats · ns→µs")).toBeTruthy();
    const results = screen.getByRole("region", { name: "Results" });
    expect(await within(results).findByText(/via zeus run stats/)).toBeTruthy();
    expect(within(results).getByText("9.00ms · 20ms")).toBeTruthy();
    expect(within(results).getByText("1.00%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    const timeline = screen.getByRole("region", { name: "Run timeline" });
    expect(await within(timeline).findByText("running → completed")).toBeTruthy();
  });
});
