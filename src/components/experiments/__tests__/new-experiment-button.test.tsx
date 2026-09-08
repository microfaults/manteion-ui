import { NewExperimentButton } from "@/components/experiments/new-experiment-button";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  workflowsApi: { listWorkflows: vi.fn() },
}));
import { workflowsApi } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const button = () => screen.getByRole("button", { name: /new experiment/i }) as HTMLButtonElement;

describe("NewExperimentButton — experiments require a workflow", () => {
  it("disables with create-a-workflow-first guidance when no workflows exist", async () => {
    vi.mocked(workflowsApi.listWorkflows).mockResolvedValue([]);
    render(wrap(<NewExperimentButton />));
    await waitFor(() => expect(screen.getByText(/create a workflow first/i)).toBeTruthy());
    expect(button().disabled).toBe(true);
  });

  it("enables once a workflow exists (POST /api/v1/experiments is wired)", async () => {
    vi.mocked(workflowsApi.listWorkflows).mockResolvedValue([
      { id: "wf-1", name: "checkout", targets: [], estRpsPerVu: 1, requestNodeCount: 2 },
    ] as never);
    render(wrap(<NewExperimentButton />));
    await waitFor(() => expect(button().disabled).toBe(false));
    expect(screen.queryByText(/isn't wired/i)).toBeNull();
  });

  it("blocks (fail-safe) with an explanation when the workflow list cannot be fetched", async () => {
    vi.mocked(workflowsApi.listWorkflows).mockRejectedValue(new Error("boom"));
    render(wrap(<NewExperimentButton />));
    await waitFor(() => expect(screen.getByText(/unreachable/i)).toBeTruthy());
    expect(button().disabled).toBe(true);
  });
});
