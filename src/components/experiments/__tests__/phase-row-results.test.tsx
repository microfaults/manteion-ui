import { MetricsGrid } from "@/components/experiments/phase-row-results";
import { SAMPLE_EXPERIMENT_ID, mockExperiments } from "@/lib/api/mock-fixtures";
import type { PhaseMetrics } from "@/lib/phase-metrics";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("marks the sample's phases as recorded, with where they were measured", () => {
    expect(samplePhaseIds).toHaveLength(3);
    for (const phaseId of samplePhaseIds) {
      const { unmount } = render(<MetricsGrid metrics={METRICS} phaseId={phaseId} />);
      const tag = screen.getByText("recorded");
      expect(tag.getAttribute("title")).toBe(RECORDED_TITLE);
      expect(screen.queryByText("synthetic")).toBeNull();
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
