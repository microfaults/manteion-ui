import { PhaseHoverCard, PhaseSummaryContent } from "@/components/phase-hover-card";
import type { PhaseSummary } from "@/types/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  experimentsApi: { getPhaseStatus: vi.fn() },
}));
import { experimentsApi } from "@/lib/api";

const SUMMARY: PhaseSummary = {
  id: "ph-1",
  name: "isolation-productcatalog",
  status: "completed",
  workflows: [],
  frozen_services: [{ service: "cartservice", mode: "replay" }],
  applied_rules: [{ rule_id: "r-1", name: "hang-5s", target_summary: "inline · hang" }],
  metrics: { p99_us: 2500, baseline_p99_us: 2000, rps: 12.3, error_rate: 0.0123 },
  duration_ms: 134_000,
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("PhaseSummaryContent", () => {
  it("renders phase name, status, rules, frozen services, and metrics", () => {
    render(
      <PhaseSummaryContent
        experimentId="exp-1"
        phase="isolation-productcatalog"
        status="completed"
        summary={SUMMARY}
      />,
    );
    expect(screen.getByText("isolation-productcatalog")).toBeTruthy();
    expect(screen.getByText("completed")).toBeTruthy();
    expect(screen.getByText("hang-5s")).toBeTruthy();
    expect(screen.getByText("cartservice")).toBeTruthy();
    // error_rate 0.0123 → 1.23%; p99 delta vs baseline (2500 vs 2000) → +25%
    expect(screen.getByText("1.23%")).toBeTruthy();
    expect(screen.getByText("+25% vs baseline")).toBeTruthy();
  });

  it("shows the not-run-yet note for pending phases without metrics", () => {
    render(
      <PhaseSummaryContent
        experimentId="exp-1"
        phase="baseline"
        status="pending"
        summary={{ ...SUMMARY, status: "pending", metrics: undefined }}
      />,
    );
    expect(screen.getByText(/not run yet/i)).toBeTruthy();
  });
});

describe("PhaseHoverCard fetch behavior", () => {
  beforeEach(() => {
    vi.mocked(experimentsApi.getPhaseStatus).mockResolvedValue(SUMMARY);
  });

  it("does NOT fetch while the card is closed (no per-pill polling on mount)", async () => {
    // No fallbackSummary: the old implementation fired the query immediately
    // for every pill in the list; closed cards must not touch the network.
    render(
      wrap(
        <PhaseHoverCard experimentId="exp-1" phaseId="ph-1" phase="baseline" statusHint="running">
          <span>pill</span>
        </PhaseHoverCard>,
      ),
    );
    // Flush a macrotask so any eager query would have fired.
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
});
