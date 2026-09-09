import { PhaseHoverCard, PhaseSummaryContent } from "@/components/phase-hover-card";
import type { PhaseMetrics } from "@/lib/phase-metrics";
import type { PhaseSummary } from "@/types/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  experimentsApi: { getPhaseStatus: vi.fn(), getPhaseResults: vi.fn() },
  zeusRunsApi: { getRunStats: vi.fn() },
}));
import { experimentsApi } from "@/lib/api";

/** Shape served by GET …/phases/{phaseId} (epoch 2): bare rule ids, no inline metrics. */
const SUMMARY: PhaseSummary = {
  id: "ph-1",
  name: "isolation-productcatalog",
  status: "completed",
  workflows: [{ workflow_id: "wf-checkout", vus: 25, duration_sec: 300, zeus_run_id: "run-1" }],
  frozen_services: [{ service: "cartservice", mode: "replay" }],
  rule_ids: ["rule-001", "rule-003"],
  started_at: "2026-06-01T00:00:00Z",
  completed_at: "2026-06-01T00:02:14Z",
};

const METRICS: PhaseMetrics = {
  source: "harvested",
  request_count: 3690,
  error_count: 45,
  p99_us: 2500,
  rps: 12.3,
  error_rate: 0.0123,
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("PhaseSummaryContent", () => {
  it("renders name, status, rule ids, frozen services, timestamp-derived duration and metrics with baseline delta", () => {
    render(
      <PhaseSummaryContent
        experimentId="exp-1"
        phase="isolation-productcatalog"
        status="completed"
        summary={SUMMARY}
        metrics={METRICS}
        baselineP99Us={2000}
      />,
    );
    expect(screen.getByText("isolation-productcatalog")).toBeTruthy();
    expect(screen.getByText("completed")).toBeTruthy();
    expect(screen.getByText("rule-001")).toBeTruthy();
    expect(screen.getByText("rule-003")).toBeTruthy();
    expect(screen.getByText("cartservice")).toBeTruthy();
    // completed_at − started_at = 134 s
    expect(screen.getByText(/2m 14s/)).toBeTruthy();
    // error_rate 0.0123 → 1.23%; p99 delta vs baseline (2500 vs 2000) → +25%
    expect(screen.getByText("1.23%")).toBeTruthy();
    expect(screen.getByText("+25% vs baseline")).toBeTruthy();
  });

  it("captions metrics that came from zeus run stats (k6 runs are not harvested yet)", () => {
    render(
      <PhaseSummaryContent
        experimentId="exp-1"
        phase="baseline"
        status="completed"
        summary={{ ...SUMMARY, rule_ids: [], frozen_services: [] }}
        metrics={{ ...METRICS, source: "zeus" }}
      />,
    );
    expect(screen.getByText(/via zeus run stats/i)).toBeTruthy();
  });

  it("labels draining as a degraded, still-running state with elapsed time", () => {
    render(
      <PhaseSummaryContent
        experimentId="exp-1"
        phase="isolation-productcatalog"
        status="draining"
        summary={{ ...SUMMARY, status: "draining", completed_at: undefined }}
      />,
    );
    expect(screen.getByText("draining")).toBeTruthy();
    expect(screen.getByText(/elapsed/)).toBeTruthy();
  });

  it("shows the not-run-yet note for pending phases", () => {
    render(
      <PhaseSummaryContent
        experimentId="exp-1"
        phase="baseline"
        status="pending"
        summary={{ ...SUMMARY, status: "pending", started_at: undefined, completed_at: undefined }}
      />,
    );
    expect(screen.getByText(/not run yet/i)).toBeTruthy();
    expect(screen.queryByText(/duration/)).toBeNull();
  });

  it("surfaces failure_reason on failed phases", () => {
    render(
      <PhaseSummaryContent
        experimentId="exp-1"
        phase="isolation-productcatalog"
        status="failed"
        summary={{ ...SUMMARY, status: "failed", failure_reason: "zeus rejected run (422)" }}
      />,
    );
    expect(screen.getByText(/zeus rejected run \(422\)/)).toBeTruthy();
  });
});

describe("PhaseHoverCard fetch behavior", () => {
  beforeEach(() => {
    vi.mocked(experimentsApi.getPhaseStatus).mockReset();
    vi.mocked(experimentsApi.getPhaseStatus).mockResolvedValue(SUMMARY);
    vi.mocked(experimentsApi.getPhaseResults).mockReset();
    vi.mocked(experimentsApi.getPhaseResults).mockResolvedValue({
      workflow_results: [],
      service_latency: [],
      service_cache: [],
    });
  });

  it("does NOT fetch while the card is closed (no per-pill polling on mount)", async () => {
    render(
      wrap(
        <PhaseHoverCard experimentId="exp-1" phaseId="ph-1" phase="baseline" statusHint="running">
          <span>pill</span>
        </PhaseHoverCard>,
      ),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(experimentsApi.getPhaseStatus).not.toHaveBeenCalled();
  });

  it("fetches the phase by id once the card opens", async () => {
    render(
      wrap(
        <PhaseHoverCard
          experimentId="exp-1"
          phaseId="ph-1"
          phase="baseline"
          statusHint="running"
          defaultOpen
        >
          <span>pill</span>
        </PhaseHoverCard>,
      ),
    );
    await waitFor(() =>
      expect(experimentsApi.getPhaseStatus).toHaveBeenCalledWith("exp-1", "ph-1"),
    );
  });

  it("fetches results for a terminal phase once open, even when a fallback summary is supplied", async () => {
    render(
      wrap(
        <PhaseHoverCard
          experimentId="exp-1"
          phaseId="ph-1"
          phase="isolation-productcatalog"
          statusHint="completed"
          fallbackSummary={SUMMARY}
          defaultOpen
        >
          <span>pill</span>
        </PhaseHoverCard>,
      ),
    );
    await waitFor(() =>
      expect(experimentsApi.getPhaseStatus).toHaveBeenCalledWith("exp-1", "ph-1"),
    );
    await waitFor(() =>
      expect(experimentsApi.getPhaseResults).toHaveBeenCalledWith("exp-1", "ph-1"),
    );
  });
});
