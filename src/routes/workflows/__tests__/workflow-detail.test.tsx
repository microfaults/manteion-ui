import { mockWorkflows } from "@/lib/api/mock-fixtures";
import { renderWithRouter } from "@/test-utils/render-with-router";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    workflowsApi: { ...actual.workflowsApi, getWorkflow: vi.fn(), deleteWorkflow: vi.fn() },
  };
});
import { workflowsApi } from "@/lib/api";
import { Route } from "../$workflowId";

const WORKFLOW = mockWorkflows[0] as NonNullable<(typeof mockWorkflows)[number]>;

async function renderPage() {
  vi.spyOn(Route, "useParams").mockReturnValue({ workflowId: WORKFLOW.id } as never);
  const Page = Route.options.component as React.ComponentType;
  renderWithRouter(<Page />);
  return screen.findByRole("button", { name: "Delete" });
}

describe("Workflow detail delete", () => {
  beforeEach(() => {
    vi.mocked(workflowsApi.getWorkflow).mockResolvedValue(WORKFLOW);
    vi.mocked(workflowsApi.deleteWorkflow).mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(workflowsApi.deleteWorkflow).mockClear();
  });

  it("asks in a dialog instead of window.confirm, then deletes", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    await user.click(await renderPage());

    const dialog = screen.getByRole("dialog", { name: `Delete workflow "${WORKFLOW.id}"?` });
    expect(dialog.textContent).toContain("This cannot be undone.");
    expect(workflowsApi.deleteWorkflow).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete workflow" }));
    expect(workflowsApi.deleteWorkflow).toHaveBeenCalledWith(WORKFLOW.id);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does not delete when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    await user.click(await renderPage());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(workflowsApi.deleteWorkflow).not.toHaveBeenCalled();
  });
});
