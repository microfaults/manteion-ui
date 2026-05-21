import { FaultSpecPicker } from "@/components/rules/fault-spec-picker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  faultsApi: { listFaultSpecs: vi.fn() },
}));
import { faultsApi } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("FaultSpecPicker", () => {
  it("renders a Select with options when the list is populated", async () => {
    vi.mocked(faultsApi.listFaultSpecs).mockResolvedValue([
      {
        id: "spec-1",
        name: "p99-latency",
        category: "inline",
        fault_type: "latency",
        params: {},
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    render(wrap(<FaultSpecPicker value="" onChange={() => {}} />));
    await waitFor(() => expect(screen.getByText("Pick a fault spec…")).toBeTruthy());
  });

  it("falls back to free-text + helper when the list is empty", async () => {
    vi.mocked(faultsApi.listFaultSpecs).mockResolvedValue([]);
    render(wrap(<FaultSpecPicker value="" onChange={() => {}} />));
    await waitFor(() => expect(screen.getByText(/No fault specs defined yet/i)).toBeTruthy());
    expect(screen.getByPlaceholderText("spec-…")).toBeTruthy();
  });

  it("falls back to free-text + error helper when the fetch fails", async () => {
    vi.mocked(faultsApi.listFaultSpecs).mockRejectedValue(new Error("boom"));
    render(wrap(<FaultSpecPicker value="" onChange={() => {}} />));
    // The picker passes retry: 1 to useQuery (overriding the wrapper's retry:
    // false default), so the error state settles after the retry backoff —
    // bump waitFor's timeout above its 1s default.
    await waitFor(() => expect(screen.getByText(/Couldn't load fault catalog/i)).toBeTruthy(), {
      timeout: 3000,
    });
    expect(screen.getByPlaceholderText("spec-…")).toBeTruthy();
  });
});
