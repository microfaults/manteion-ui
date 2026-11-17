import { FaultEditor } from "@/components/fault-editor";
import { ApiError } from "@/lib/api/client";
import type { FaultSpec } from "@/types/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  faultsApi: {
    getFaultCatalog: vi.fn(),
    getFaultSpec: vi.fn(),
    createFaultSpec: vi.fn(),
    updateFaultSpec: vi.fn(),
    deleteFaultSpec: vi.fn(),
  },
  rulesApi: {
    listRules: vi.fn(),
  },
}));
import { faultsApi, rulesApi } from "@/lib/api";

const SPEC: FaultSpec = {
  id: "spec-latency-250ms",
  name: "latency-250ms",
  category: "inline",
  fault_type: "latency",
  params: {},
  created_at: "2026-01-01T00:00:00Z",
};

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onDeleted = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<FaultEditor faultId={SPEC.id} onSaved={vi.fn()} onDeleted={onDeleted} />, { wrapper });
  return { onDeleted };
}

describe("FaultEditor delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(faultsApi.getFaultCatalog).mockResolvedValue([]);
    vi.mocked(faultsApi.getFaultSpec).mockResolvedValue(SPEC);
    vi.mocked(faultsApi.deleteFaultSpec).mockResolvedValue(undefined);
    vi.mocked(rulesApi.listRules).mockResolvedValue([]);
  });

  it("asks in a dialog and deletes only after confirming", async () => {
    const user = userEvent.setup();
    const { onDeleted } = renderEditor();
    await screen.findByDisplayValue("latency-250ms");

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this fault spec?" });
    expect(dialog.textContent).toContain("latency-250ms");
    expect(faultsApi.deleteFaultSpec).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete fault spec" }));
    expect(faultsApi.deleteFaultSpec).toHaveBeenCalledWith(SPEC.id);
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("keeps the dialog open and shows why when the delete fails", async () => {
    vi.mocked(faultsApi.deleteFaultSpec).mockRejectedValue(
      new ApiError(409, "/api/v1/fault-specs/x", { error: "spec is used by rule-001" }),
    );
    const user = userEvent.setup();
    const { onDeleted } = renderEditor();
    await screen.findByDisplayValue("latency-250ms");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete fault spec" }));

    const dialog = screen.getByRole("dialog", { name: "Delete this fault spec?" });
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "manteion answered 409: spec is used by rule-001",
    );
    expect(
      (within(dialog).getByRole("button", { name: "Delete fault spec" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(onDeleted).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
  });

  it("does not delete when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const { onDeleted } = renderEditor();
    await screen.findByDisplayValue("latency-250ms");

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(faultsApi.deleteFaultSpec).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
