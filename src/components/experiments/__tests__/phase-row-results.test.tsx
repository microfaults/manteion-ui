import { MetricsGrid } from "@/components/experiments/phase-row-results";
import * as engine from "@/lib/api/mock-experiments";
import { SAMPLE_EXPERIMENT_ID, mockExperiments } from "@/lib/api/mock-fixtures";
import { mockDisableServiceRules } from "@/lib/api/rules";
import { metricsFromResults } from "@/lib/phase-metrics";
import type { PhaseMetrics } from "@/lib/phase-metrics";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ isMock: true }));
vi.mock("@/lib/env", () => ({
  get IS_MOCK() {
    return env.isMock;
  },
}));

const RECORDED_TITLE =
  "Measured on the real testbed on 2026-08-25 (experiment exp12-dose), replayed here";
const samplePhaseIds = (
  mockExperiments.find((e) => e.id === SAMPLE_EXPERIMENT_ID)?.phases ?? []
).map((p) => p.id);

const METRICS: PhaseMetrics = {
  source: "harvested",
  request_count: 31_380,
  error_count: 66,
  p99_us: 61_200,
  rps: 104.6,
  error_rate: 0.0021,
};

describe("MetricsGrid synthetic label", () => {
  beforeEach(() => {
    env.isMock = true;
  });

  it("marks phase results as synthetic in the mock build", () => {
    render(<MetricsGrid metrics={METRICS} />);
    expect(screen.getByText("synthetic")).toBeTruthy();
  });

  it("has no synthetic label in operator builds", () => {
    env.isMock = false;
    render(<MetricsGrid metrics={METRICS} />);
    expect(screen.getByText("p99")).toBeTruthy();
    expect(screen.queryByText("synthetic")).toBeNull();
  });

  it("marks the sample's phases synthetic until the engine has replayed them", () => {
    expect(samplePhaseIds).toHaveLength(3);
    for (const phaseId of samplePhaseIds) {
      const { unmount } = render(<MetricsGrid metrics={METRICS} phaseId={phaseId} />);
      expect(screen.getByText("synthetic")).toBeTruthy();
      expect(screen.queryByText("recorded")).toBeNull();
      unmount();
    }
  });

  it("keeps the synthetic label for phases of other experiments", () => {
    render(<MetricsGrid metrics={METRICS} phaseId="ph-001-baseline" />);
    expect(screen.getByText("synthetic")).toBeTruthy();
    expect(screen.queryByText("recorded")).toBeNull();
  });

  it("has neither label in operator builds, even for a sample phase", () => {
    env.isMock = false;
    render(<MetricsGrid metrics={METRICS} phaseId={samplePhaseIds[0]} />);
    expect(screen.getByText("p99")).toBeTruthy();
    expect(screen.queryByText("recorded")).toBeNull();
    expect(screen.queryByText("synthetic")).toBeNull();
  });
});

/** Runs the sample in the mock engine; the tag and format follow the
 *  provenance of the results it stored. The engine and rule store are shared
 *  across these tests, so the one that disables the sample's rule runs last. */
describe("MetricsGrid on the sample run", () => {
  beforeEach(() => {
    env.isMock = true;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const renderPhase = (phaseId: string) => {
    const results = engine.mockPhaseResultsFor(phaseId);
    expect(results).toBeDefined();
    const metrics = results ? metricsFromResults(results) : undefined;
    expect(metrics).toBeDefined();
    if (!metrics) throw new Error("no metrics");
    return render(<MetricsGrid metrics={metrics} phaseId={phaseId} />);
  };
  const runSample = () => {
    engine.mockRestart(SAMPLE_EXPERIMENT_ID);
    vi.advanceTimersByTime(3 * engine.MOCK_PHASE_STEP_MS + 1);
    expect(engine.mockGet(SAMPLE_EXPERIMENT_ID).status).toBe("completed");
  };

  it("tags an unmodified run recorded and shows the recorded p99 to one decimal", () => {
    runSample();
    const expected = ["39.5ms", "366.3ms", "14.6ms"];
    samplePhaseIds.forEach((phaseId, i) => {
      const { unmount } = renderPhase(phaseId);
      expect(screen.getByText("recorded").getAttribute("title")).toBe(RECORDED_TITLE);
      expect(screen.getByText(expected[i] ?? "")).toBeTruthy();
      unmount();
    });
  });

  it("does not tag a phase stopped before the end of its plan as recorded", () => {
    engine.mockRestart(SAMPLE_EXPERIMENT_ID);
    vi.advanceTimersByTime(engine.MOCK_PHASE_STEP_MS + 1);
    const latency = samplePhaseIds[1] ?? "";
    engine.mockStopPhase(latency, "completed");
    renderPhase(latency);
    expect(screen.getByText("synthetic")).toBeTruthy();
    expect(screen.queryByText("recorded")).toBeNull();
  });

  it("tags a run with catalog-latency-50ms disabled synthetic", () => {
    expect(mockDisableServiceRules("productcatalogservice")).toContain("rule-014");
    runSample();
    for (const phaseId of samplePhaseIds) {
      const { unmount } = renderPhase(phaseId);
      expect(screen.getByText("synthetic")).toBeTruthy();
      expect(screen.queryByText("recorded")).toBeNull();
      expect(screen.queryByText("39.5ms")).toBeNull();
      unmount();
    }
  });
});
