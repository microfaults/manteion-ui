import { renderWithRouter } from "@/test-utils/render-with-router";
import { screen } from "@testing-library/react";
import type { JSX } from "react";
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

import { servicesApi } from "@/lib/api";
import { Route } from "@/routes/dashboard";
import type { SDKInstance } from "@/types/api";

const instance = (service: string, version: string): SDKInstance => ({
  id: `${service}-1`,
  service,
  version,
  address: "10.0.0.1:50051",
  status: "alive",
  registered_at: "2026-08-25T00:00:00Z",
  last_poll_at: "2026-08-25T00:00:00Z",
});

describe("Dashboard", () => {
  it("labels the cache-hit tile as covering every service over the chart range", async () => {
    const Dashboard = Route.options.component as () => JSX.Element;
    renderWithRouter(<Dashboard />);
    expect(await screen.findByText("Cache-box hit rate")).toBeTruthy();
    expect(screen.getByText("cache-box replay · all services · last 30m")).toBeTruthy();
    // Same range suffix as the other tiles.
    expect(screen.getByText("platform total · last 30m")).toBeTruthy();
  });

  it("names each service in full and prints each version with one v", async () => {
    vi.mocked(servicesApi.listSDKInstances).mockResolvedValueOnce([
      instance("cartservice", "v0.4.0"),
      instance("productcatalogservice", "0.4.2"),
    ]);
    const Dashboard = Route.options.component as () => JSX.Element;
    renderWithRouter(<Dashboard />);
    expect(await screen.findByText("productcatalogservice")).toBeTruthy();
    expect(screen.getByText("cartservice")).toBeTruthy();
    expect(screen.queryByText("productcatalog")).toBeNull();
    expect(screen.getByText("v0.4.0")).toBeTruthy();
    expect(screen.getByText("v0.4.2")).toBeTruthy();
    expect(screen.queryByText(/vv/)).toBeNull();
  });
});
