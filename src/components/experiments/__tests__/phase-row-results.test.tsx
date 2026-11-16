import { MetricsGrid } from "@/components/experiments/phase-row-results";
import type { PhaseMetrics } from "@/lib/phase-metrics";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ isMock: true }));
vi.mock("@/lib/env", () => ({
  get IS_MOCK() {
    return env.isMock;
  },
}));

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
});
