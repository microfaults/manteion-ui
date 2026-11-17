import { ApiError } from "@/lib/api/client";
import { renderWithRouter } from "@/test-utils/render-with-router";
import type { Dataset } from "@/types/api";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    datasetsApi: { ...actual.datasetsApi, getDataset: vi.fn(), deleteDataset: vi.fn() },
  };
});
import { datasetsApi } from "@/lib/api";
import { Route } from "../$datasetId";

const DATASET: Dataset = {
  id: "ds-checkout-seed",
  name: "checkout-seed",
  source: "upload",
  pool_stats: {},
  size_bytes: 0,
  ttl_s: 0,
  created_at: "2026-05-19T09:30:00Z",
};

async function renderPage() {
  vi.spyOn(Route, "useParams").mockReturnValue({ datasetId: DATASET.id } as never);
  const Page = Route.options.component as React.ComponentType;
  renderWithRouter(<Page />);
  return screen.findByRole("button", { name: "Delete" });
}

describe("Dataset detail delete", () => {
  beforeEach(() => {
    vi.mocked(datasetsApi.getDataset).mockResolvedValue(DATASET);
    vi.mocked(datasetsApi.deleteDataset).mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(datasetsApi.deleteDataset).mockClear();
  });

  it("asks in a dialog instead of window.confirm, then deletes", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    await user.click(await renderPage());

    const dialog = screen.getByRole("dialog", { name: 'Delete dataset "ds-checkout-seed"?' });
    expect(dialog.textContent).toContain("This cannot be undone.");
    expect(datasetsApi.deleteDataset).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete dataset" }));
    expect(datasetsApi.deleteDataset).toHaveBeenCalledWith(DATASET.id);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows why when the delete fails", async () => {
    vi.mocked(datasetsApi.deleteDataset).mockRejectedValue(
      new ApiError(409, "/api/v1/datasets/ds-checkout-seed", {
        error: "in use by a planned experiment",
      }),
    );
    const user = userEvent.setup();
    await user.click(await renderPage());
    await user.click(screen.getByRole("button", { name: "Delete dataset" }));

    const dialog = screen.getByRole("dialog");
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "manteion answered 409: in use by a planned experiment",
    );
    expect(
      (within(dialog).getByRole("button", { name: "Delete dataset" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
  });

  it("does not delete when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    await user.click(await renderPage());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(datasetsApi.deleteDataset).not.toHaveBeenCalled();
  });
});
