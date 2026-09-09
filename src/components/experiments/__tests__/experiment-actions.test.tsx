import { ExperimentActions } from "@/components/experiments/experiment-actions";
import { ApiError } from "@/lib/api/client";
import type { Experiment } from "@/types/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  experimentsApi: {
    startExperiment: vi.fn(),
    pauseExperiment: vi.fn(),
    resumeExperiment: vi.fn(),
    cancelExperiment: vi.fn(),
    stopExperiment: vi.fn(),
    deleteExperiment: vi.fn(),
  },
}));
import { experimentsApi } from "@/lib/api";

const RULES = [
  { id: "rule-1", name: "hang-catalog", service: "productcatalog", enabled: true },
  { id: "rule-2", name: "slow-cart", service: "cartservice", enabled: false },
];
const exp = (
  status: Experiment["status"],
  phaseStatus: Experiment["phases"][number]["status"],
): Experiment => ({
  id: "exp-1",
  name: "checkout-p99",
  status,
  targeted_services: [],
  created_at: "2026-06-01T00:00:00Z",
  phases: [
    {
      id: "ph-1",
      name: "combined",
      status: phaseStatus,
      workflows: [],
      frozen_services: [],
      rule_ids: ["rule-1", "rule-2"],
    },
  ],
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("ExperimentActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of [
      experimentsApi.startExperiment,
      experimentsApi.pauseExperiment,
      experimentsApi.resumeExperiment,
      experimentsApi.cancelExperiment,
      experimentsApi.stopExperiment,
      experimentsApi.deleteExperiment,
    ]) {
      vi.mocked(fn).mockResolvedValue(undefined as never);
    }
  });

  it("Start confirms with the disabled attached rules listed, then starts; a 409 is shown verbatim", async () => {
    vi.mocked(experimentsApi.startExperiment).mockRejectedValueOnce(
      new ApiError(409, "/api/v1/experiments/exp-1/start", {
        error: "service footprint overlaps running experiment exp-9",
        code: "service_overlap",
      }),
    );
    render(wrap(<ExperimentActions experiment={exp("planned", "pending")} rules={RULES} />));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText(/1 attached rule is disabled/i)).toBeTruthy();
    expect(screen.getByText("slow-cart")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /start experiment/i }));
    expect(
      await screen.findByText(
        /manteion answered 409 \(service_overlap\): service footprint overlaps/i,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /start experiment/i }));
    await waitFor(() => expect(experimentsApi.startExperiment).toHaveBeenCalledTimes(2));
    expect(experimentsApi.startExperiment).toHaveBeenLastCalledWith("exp-1");
  });

  it("running: Pause when a phase is in flight, Stop with a final status, Cancel; no Delete", async () => {
    render(wrap(<ExperimentActions experiment={exp("running", "running")} rules={RULES} />));
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(experimentsApi.pauseExperiment).toHaveBeenCalledWith("exp-1"));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    fireEvent.change(await screen.findByLabelText(/final status/i), {
      target: { value: "failed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /stop experiment/i }));
    await waitFor(() =>
      expect(experimentsApi.stopExperiment).toHaveBeenCalledWith("exp-1", "failed"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("button", { name: /cancel experiment/i }));
    await waitFor(() => expect(experimentsApi.cancelExperiment).toHaveBeenCalledWith("exp-1"));
  });

  it("paused phase offers Resume; terminal experiments offer Delete behind a confirm", async () => {
    const onDeleted = vi.fn();
    const { unmount } = render(
      wrap(<ExperimentActions experiment={exp("running", "paused")} rules={RULES} />),
    );
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(experimentsApi.resumeExperiment).toHaveBeenCalledWith("exp-1"));
    unmount();

    render(
      wrap(
        <ExperimentActions
          experiment={exp("completed", "completed")}
          rules={RULES}
          onDeleted={onDeleted}
        />,
      ),
    );
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: /delete experiment/i }));
    await waitFor(() => expect(experimentsApi.deleteExperiment).toHaveBeenCalledWith("exp-1"));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });
});
