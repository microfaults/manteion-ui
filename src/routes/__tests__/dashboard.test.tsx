import { renderWithRouter } from "@/test-utils/render-with-router";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  experimentsApi: { listExperimentsLenient: vi.fn(async () => []) },
  faultsApi: { listFaultSpecs: vi.fn(async () => []) },
  rulesApi: { listRules: vi.fn(async () => []) },
  servicesApi: { listSDKInstances: vi.fn(async () => []) },
}));

vi.mock("@/lib/prometheus", () => ({
  fetchDashboardPrometheusBundle: vi.fn(() => new Promise(() => {})),
  fetchServiceNamesFromMetrics: vi.fn(async () => []),
}));

import { Route } from "@/routes/dashboard";

describe("Dashboard", () => {
  it("labels the cache-hit tile as covering every service over the chart range", async () => {
    const Dashboard = Route.options.component as () => JSX.Element;
    renderWithRouter(<Dashboard />);
    expect(await screen.findByText("Cache-box hit rate")).toBeTruthy();
    expect(screen.getByText("cache-box replay · all services · last 30m")).toBeTruthy();
    // Same range suffix as the other tiles.
    expect(screen.getByText("platform total · last 30m")).toBeTruthy();
  });
});
