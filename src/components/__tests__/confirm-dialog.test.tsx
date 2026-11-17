import { ConfirmDialog } from "@/components/confirm-dialog";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

function Harness({
  pending = false,
  error,
  onConfirm,
}: { pending?: boolean; error?: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog
      open={open}
      title="Delete this rule?"
      description="This cannot be undone."
      confirmLabel="Delete rule"
      destructive
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onOpenChange={setOpen}
    />
  );
}

describe("ConfirmDialog", () => {
  it("shows its title and description and moves focus inside", () => {
    render(<Harness onConfirm={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Delete this rule?" });
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("calls onConfirm only from its confirm button", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    expect(onConfirm).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Delete rule" });
    expect(confirm.tagName).toBe("BUTTON");
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes on cancel without confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes on Escape without confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows an error inside the dialog as an alert, and nothing without one", () => {
    const { unmount } = render(<Harness onConfirm={vi.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();
    unmount();

    render(<Harness error="manteion answered 409: rule is attached" onConfirm={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Delete this rule?" });
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "manteion answered 409: rule is attached",
    );
    const confirm = screen.getByRole("button", { name: "Delete rule" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
  });

  it("disables the confirm button while pending", () => {
    render(<Harness pending onConfirm={vi.fn()} />);
    const confirm = screen.getByRole("button", { name: "Delete rule" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });
});
