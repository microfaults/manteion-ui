/**
 * Queries that poll only while their subject is in flight must fetch once
 * more when it ends, or they keep showing its last in-flight answer.
 */
import { useZeusRun } from "@/lib/use-zeus-run";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ zeusRunsApi: { getRun: vi.fn() } }));
import { zeusRunsApi } from "@/lib/api";

function RunStatus({ live }: { live: boolean }) {
  const run = useZeusRun("run-1", live);
  return <p>{run.data?.status ?? "…"}</p>;
}

describe("useZeusRun", () => {
  const state = { status: "running" };
  beforeEach(() => {
    vi.clearAllMocks();
    state.status = "running";
    vi.mocked(zeusRunsApi.getRun).mockImplementation(async (id) => ({
      id,
      status: state.status,
    }));
  });

  it("fetches the run's final state once when the phase stops being live", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = (ui: React.ReactNode) => (
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    );
    const { rerender } = render(wrap(<RunStatus live />));
    expect(await screen.findByText("running")).toBeTruthy();
    const calls = vi.mocked(zeusRunsApi.getRun).mock.calls.length;

    state.status = "completed";
    rerender(wrap(<RunStatus live={false} />));
    expect(await screen.findByText("completed")).toBeTruthy();
    expect(vi.mocked(zeusRunsApi.getRun).mock.calls.length).toBe(calls + 1);
  });

  it("does not refetch a run that was never live", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = (ui: React.ReactNode) => (
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    );
    const { rerender } = render(wrap(<RunStatus live={false} />));
    expect(await screen.findByText("running")).toBeTruthy();
    rerender(wrap(<RunStatus live={false} />));
    await waitFor(() => expect(zeusRunsApi.getRun).toHaveBeenCalledTimes(1));
  });
});
