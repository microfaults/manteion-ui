import { PhaseTimeline } from "@/components/experiments/phase-timeline";
import type { Experiment, PhaseSummary } from "@/types/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  experimentsApi: { getPhaseResults: vi.fn() },
  zeusRunsApi: { getRun: vi.fn(), getRunStats: vi.fn() },
  phasesApi: { getPhaseFaults: vi.fn() },
}));
import { experimentsApi, phasesApi, zeusRunsApi } from "@/lib/api";

const NOW = Date.parse("2026-06-01T00:10:00Z");
const RULES = [
  { id: "rule-1", name: "hang-catalog", service: "productcatalog", enabled: true },
  { id: "rule-2", name: "slow-cart", service: "cartservice", enabled: false },
];
const EMPTY = { workflow_results: [], service_latency: [], service_cache: [] };
const HARVESTED = {
  ...EMPTY,
  workflow_results: [
    {
      phase_id: "ph-baseline",
      workflow_id: "wf-checkout",
      request_count: 31_380,
      error_count: 66,
      error_rate: 0.0021,
      throughput_rps: 104.6,
      latency_p50_us: 18_400,
      latency_p95_us: 42_100,
      latency_p99_us: 61_200,
    },
  ],
};

const phase = (
  over: Partial<PhaseSummary> & Pick<PhaseSummary, "id" | "name" | "status">,
): PhaseSummary => ({
  workflows: [{ workflow_id: "wf-checkout", vus: 25, duration_sec: 300 }],
  frozen_services: [],
  rule_ids: [],
  ...over,
});
const experiment = (
  phases: PhaseSummary[],
  status: Experiment["status"] = "running",
): Experiment => ({
  id: "exp-1",
  name: "checkout-p99",
  status,
  targeted_services: [],
  created_at: "2026-06-01T00:00:00Z",
  started_at: "2026-06-01T00:00:00Z",
  phases,
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}
const row = (name: string) => screen.getByRole("listitem", { name: `Phase ${name}` });

describe("PhaseTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(experimentsApi.getPhaseResults).mockImplementation(async (_e, phaseId) =>
      phaseId === "ph-baseline" ? HARVESTED : EMPTY,
    );
    vi.mocked(zeusRunsApi.getRun).mockImplementation(async (id) => ({
      id,
      status: id === "run-iso" ? "running" : "completed",
    }));
    vi.mocked(zeusRunsApi.getRunStats).mockResolvedValue(undefined);
    vi.mocked(phasesApi.getPhaseFaults).mockResolvedValue({
      frozen_services: [],
      phase_rules: [],
      fault_events: [
        {
          id: "fe-1",
          source: "cachebox",
          service: "cartservice",
          kind: "cachebox:replay",
          started_at: "2026-06-01T00:07:00Z",
        },
      ],
    });
  });

  it("renders completed results, time-based progress with live zeus status, rule/frozen chips, the disabled-rule warning, and per-phase actions", async () => {
    const onPhaseAction = vi.fn();
    const exp = experiment([
      phase({
        id: "ph-baseline",
        name: "baseline",
        position: 0,
        status: "completed",
        started_at: "2026-06-01T00:00:00Z",
        completed_at: "2026-06-01T00:05:00Z",
        workflows: [
          {
            workflow_id: "wf-checkout",
            vus: 25,
            duration_sec: 300,
            zeus_run_id: "run-base",
            dataset_id: "ds-users",
          },
        ],
      }),
      phase({
        id: "ph-iso",
        name: "isolation-productcatalog",
        position: 1,
        status: "running",
        started_at: "2026-06-01T00:06:36Z",
        workflows: [
          { workflow_id: "wf-checkout", vus: 25, duration_sec: 300, zeus_run_id: "run-iso" },
        ],
        rule_ids: ["rule-1"],
        frozen_services: [{ service: "cartservice", mode: "replay" }],
      }),
      phase({
        id: "ph-combined",
        name: "combined",
        position: 2,
        status: "pending",
        rule_ids: ["rule-1", "rule-2"],
      }),
    ]);
    render(
      wrap(
        <PhaseTimeline
          experiment={exp}
          rules={RULES}
          workflowNames={{ "wf-checkout": "checkout-burst" }}
          onPhaseAction={onPhaseAction}
          now={NOW}
        />,
      ),
    );

    const baseline = row("baseline");
    expect(await within(baseline).findByText("61ms")).toBeTruthy();
    expect(within(baseline).getByText("104.6")).toBeTruthy();
    expect(within(baseline).getByText("0.21%")).toBeTruthy();
    expect(within(baseline).getByText("checkout-burst")).toBeTruthy();
    expect(within(baseline).getByText("ds-users")).toBeTruthy();
    expect(within(baseline).queryByText(/via zeus run stats/)).toBeNull();

    const iso = row("isolation-productcatalog");
    expect(within(iso).getByText(/3m 24s \/ 5m · time-based/)).toBeTruthy();
    expect((within(iso).getByRole("progressbar") as HTMLProgressElement).value).toBe(68);
    expect(within(iso).getByText("hang-catalog")).toBeTruthy();
    expect(within(iso).getByText("cartservice")).toBeTruthy();
    expect(within(iso).getByText(/metrics land when the phase completes/i)).toBeTruthy();
    expect(await within(iso).findByText(/run-iso · running/)).toBeTruthy();
    fireEvent.click(within(iso).getByRole("button", { name: "Pause" }));
    expect(onPhaseAction).toHaveBeenLastCalledWith(expect.objectContaining({ id: "ph-iso" }), {
      type: "pause",
    });
    fireEvent.change(within(iso).getByLabelText(/stop status/i), { target: { value: "skipped" } });
    fireEvent.click(within(iso).getByRole("button", { name: "Stop" }));
    expect(onPhaseAction).toHaveBeenLastCalledWith(expect.objectContaining({ id: "ph-iso" }), {
      type: "stop",
      status: "skipped",
    });

    const combined = row("combined");
    expect(within(combined).getByText(/1 attached rule is disabled/i)).toBeTruthy();
    expect(within(combined).getByText("disabled")).toBeTruthy();
    expect(within(combined).queryByRole("button", { name: /start now/i })).toBeNull();
    // results are only fetched for terminal phases
    expect(experimentsApi.getPhaseResults).toHaveBeenCalledTimes(1);
  });

  it("falls back to zeus run stats for run-only phases, shows failure reasons from zeus, loads fault events on demand, and offers Start now when nothing is in flight", async () => {
    const onPhaseAction = vi.fn();
    vi.mocked(experimentsApi.getPhaseResults).mockResolvedValue(EMPTY);
    vi.mocked(zeusRunsApi.getRunStats).mockResolvedValue({
      run_id: "run-b",
      status: "completed",
      duration_ms: 300_000,
      iterations: 10,
      requests_sent: 3_000,
      requests_ok: 2_970,
      requests_dropped: 30,
      latency_p50_us: 9_000,
      latency_p95_us: 20_000,
      latency_p99_us: 24_800,
    });
    vi.mocked(zeusRunsApi.getRun).mockImplementation(async (id) =>
      id === "run-f"
        ? { id, status: "failed", reason: "k6 exited 99" }
        : { id, status: "completed" },
    );
    const exp = experiment([
      phase({
        id: "ph-b",
        name: "baseline",
        position: 0,
        status: "completed",
        started_at: "2026-06-01T00:00:00Z",
        completed_at: "2026-06-01T00:05:00Z",
        workflows: [
          { workflow_id: "wf-checkout", vus: 25, duration_sec: 300, zeus_run_id: "run-b" },
        ],
      }),
      phase({
        id: "ph-f",
        name: "isolation-adservice",
        position: 1,
        status: "failed",
        started_at: "2026-06-01T00:05:00Z",
        completed_at: "2026-06-01T00:06:00Z",
        workflows: [
          { workflow_id: "wf-checkout", vus: 25, duration_sec: 300, zeus_run_id: "run-f" },
        ],
      }),
      phase({
        id: "ph-gate",
        name: "isolation-gated",
        position: 2,
        status: "failed",
        started_at: "2026-06-01T00:06:00Z",
        completed_at: "2026-06-01T00:06:00Z",
        failure_reason:
          'preload gate: baseline recorded zero entries for frozen service "cartservice"',
      }),
      phase({ id: "ph-c", name: "combined", position: 3, status: "pending" }),
    ]);
    render(
      wrap(
        <PhaseTimeline experiment={exp} rules={RULES} onPhaseAction={onPhaseAction} now={NOW} />,
      ),
    );

    const baseline = row("baseline");
    expect(await within(baseline).findByText(/via zeus run stats/)).toBeTruthy();
    expect(within(baseline).getByText("25ms")).toBeTruthy(); // 24.8 ms rounds
    expect(within(baseline).getByText("1.00%")).toBeTruthy(); // 30 / 3000

    const failed = row("isolation-adservice");
    expect(await within(failed).findByText("k6 exited 99")).toBeTruthy();
    const gated = row("isolation-gated");
    expect(within(gated).getByText(/preload gate: baseline recorded zero entries/)).toBeTruthy();
    expect(await within(gated).findByText(/no load ran/i)).toBeTruthy();

    const details = within(baseline)
      .getByText("Fault events")
      .closest("details") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await waitFor(() => expect(phasesApi.getPhaseFaults).toHaveBeenCalledWith("ph-b"));
    expect(await within(baseline).findByText(/cachebox:replay/)).toBeTruthy();

    fireEvent.click(within(row("combined")).getByRole("button", { name: /start now/i }));
    expect(onPhaseAction).toHaveBeenLastCalledWith(expect.objectContaining({ id: "ph-c" }), {
      type: "start",
    });
  });
});
