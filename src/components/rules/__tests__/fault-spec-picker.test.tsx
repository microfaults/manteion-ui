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
  // retryDelay 0: the picker itself passes retry: 1, so error-path tests
  // would otherwise sit through the ~1s default backoff.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("FaultSpecPicker", () => {
  it("renders a native select with options when the list is populated", async () => {
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
    await waitFor(() => expect(screen.getByLabelText("Fault spec")).toBeTruthy());
    expect(screen.getByText("Pick a fault spec…")).toBeTruthy();
    expect(screen.getByText("inline:latency · p99-latency")).toBeTruthy();
  });

  it("points at the Faults page when the catalog is loaded and empty", async () => {
    vi.mocked(faultsApi.listFaultSpecs).mockResolvedValue([]);
    render(wrap(<FaultSpecPicker value="" onChange={() => {}} />));
    await waitFor(() =>
      expect(screen.getByText(/create one on the faults page first/i)).toBeTruthy(),
    );
    // Existing values stay visible/editable; saving is blocked by validation.
    expect(screen.getByPlaceholderText("spec-…")).toBeTruthy();
  });

  it("falls back to manual ID entry when the fetch fails", async () => {
    vi.mocked(faultsApi.listFaultSpecs).mockRejectedValue(new Error("boom"));
    render(wrap(<FaultSpecPicker value="" onChange={() => {}} />));
    await waitFor(() => expect(screen.getByText(/couldn't load fault catalog/i)).toBeTruthy());
    expect(screen.getByPlaceholderText("spec-…")).toBeTruthy();
  });
});
