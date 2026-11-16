import { ErrorPage } from "@/components/error-page";
import { NotFound } from "@/components/not-found";
import { renderWithRouter } from "@/test-utils/render-with-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("NotFound", () => {
  it("says the page does not exist and links to the dashboard", async () => {
    renderWithRouter(<NotFound />, "/no/such/page");
    expect(await screen.findByText("This page does not exist.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /dashboard/i }).getAttribute("href")).toBe(
      "/dashboard",
    );
  });
});

describe("ErrorPage", () => {
  it("shows the error message in mono and retries through reset", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("fixture exploded")} reset={reset} />);
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
    const message = screen.getByText("fixture exploded");
    expect(message.className).toContain("font-mono");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("shows a neutral line, never a stack, for a non-Error value", () => {
    const { container } = render(<ErrorPage error={{ stack: "at secret.ts:1" }} />);
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
    expect(container.textContent).not.toContain("secret.ts");
  });

  it("does not render the stack of an Error", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n    at hidden-frame.ts:10";
    const { container } = render(<ErrorPage error={err} />);
    expect(screen.getByText("boom")).toBeTruthy();
    expect(container.textContent).not.toContain("hidden-frame.ts");
  });
});
