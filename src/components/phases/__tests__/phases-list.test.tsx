import { PhasesList, sortPhases } from "@/components/phases/phases-list";
import { renderWithRouter } from "@/test-utils/render-with-router";
import type { PhaseListItem } from "@/types/api";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ phasesApi: { listPhases: vi.fn() } }));
import { phasesApi } from "@/lib/api";

const item = (
  over: Partial<PhaseListItem> & Pick<PhaseListItem, "id" | "name" | "status">,
): PhaseListItem => ({
  experiment_id: "exp-1",
  experiment_name: "checkout-p99",
  position: 0,
  workflow_ids: ["wf-1"],
  frozen_service_count: 0,
  ...over,
});
const ROWS = [
  item({
    id: "ph-base",
    name: "baseline",
    status: "completed",
    started_at: "2026-06-01T00:00:00Z",
    completed_at: "2026-06-01T00:05:00Z",
  }),
  item({
    id: "ph-iso",
    name: "isolation-productcatalog",
    status: "running",
    position: 1,
    frozen_service_count: 1,
    started_at: "2026-06-01T00:06:00Z",
  }),
  item({ id: "ph-comb", name: "combined", status: "pending", position: 2 }),
  item({
    id: "ph-cart",
    name: "isolation-cartservice",
    status: "completed",
    experiment_id: "exp-2",
    experiment_name: "cart-freeze",
    started_at: "2026-05-30T00:00:00Z",
    completed_at: "2026-05-30T00:10:00Z",
  }),
];

describe("sortPhases", () => {
  it("puts in-flight phases first, then newest starts, then plan order", () => {
    expect(sortPhases(ROWS).map((p) => p.id)).toEqual(["ph-iso", "ph-base", "ph-cart", "ph-comb"]);
  });
});

describe("PhasesList", () => {
  beforeEach(() => {
    vi.mocked(phasesApi.listPhases).mockReset().mockResolvedValue(ROWS);
  });

  it("lists every phase across experiments with links, then filters by status and by name", async () => {
    renderWithRouter(<PhasesList />);
    const iso = await screen.findByRole("link", { name: "isolation-productcatalog" });
    expect(iso.getAttribute("href")).toBe("/phases/ph-iso");
    const row = iso.closest("tr") as HTMLElement;
    expect(within(row).getByRole("link", { name: "checkout-p99" }).getAttribute("href")).toBe(
      "/experiments/exp-1",
    );
    expect(within(row).getByText("running")).toBeTruthy();
    expect(screen.getByText("4 of 4 phases")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Status filter"), { target: { value: "completed" } });
    await waitFor(() => expect(screen.getByText("2 of 4 phases")).toBeTruthy());
    expect(screen.queryByRole("link", { name: "isolation-productcatalog" })).toBeNull();
    expect(screen.getByRole("link", { name: "baseline" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter phases"), { target: { value: "cart" } });
    await waitFor(() => expect(screen.getByText("1 of 4 phases")).toBeTruthy());
    expect(screen.getByRole("link", { name: "isolation-cartservice" })).toBeTruthy();
  });
});
