import { Shell } from "@/components/layout/shell";
import { renderWithRouter } from "@/test-utils/render-with-router";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ isMock: true }));
vi.mock("@/lib/env", () => ({
  get IS_MOCK() {
    return env.isMock;
  },
}));

const BAR_TEXT = "No cluster is attached; everything here is generated in your browser.";
const NOTICE_TEXT = "Built for desktop widths. Some panels will not fit on this screen.";

const renderShell = () => renderWithRouter(<Shell>page body</Shell>);

describe("Shell", () => {
  beforeEach(() => {
    env.isMock = true;
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the simulated-data bar with a link to the demo page when mocked", async () => {
    renderShell();
    expect(await screen.findByText("Simulated data")).toBeTruthy();
    expect(screen.getByText(BAR_TEXT)).toBeTruthy();
    expect(screen.getByRole("link", { name: "About this demo" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("page body")).toBeTruthy();
  });

  it("has no simulated-data bar or desktop notice in operator builds", async () => {
    env.isMock = false;
    renderShell();
    expect(await screen.findByText("page body")).toBeTruthy();
    expect(screen.queryByText("Simulated data")).toBeNull();
    expect(screen.queryByText(BAR_TEXT)).toBeNull();
    expect(screen.queryByText(NOTICE_TEXT)).toBeNull();
  });

  it("shows a dismissible desktop notice that stays dismissed for the session", async () => {
    const { unmount } = renderShell();
    expect(await screen.findByText(NOTICE_TEXT)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(NOTICE_TEXT)).toBeNull();
    unmount();

    renderShell();
    expect(await screen.findByText("page body")).toBeTruthy();
    expect(screen.queryByText(NOTICE_TEXT)).toBeNull();
  });

  it("sizes the notice for small screens and lets the bar's sentence wrap there", async () => {
    renderShell();
    const notice = (await screen.findByText(NOTICE_TEXT)).closest("aside");
    expect(notice?.classList.contains("lg:hidden")).toBe(true);
    expect(screen.getByRole("button", { name: "Dismiss" }).classList.contains("size-8")).toBe(true);
    const sentence = screen.getByText(BAR_TEXT);
    expect(sentence.classList.contains("truncate")).toBe(false);
    expect(sentence.classList.contains("sm:truncate")).toBe(true);
  });

  it.each([true, false])("brands the sidebar Manteion with the mark (mock %s)", async (isMock) => {
    env.isMock = isMock;
    renderShell();
    const nav = await screen.findByRole("navigation", { name: "Primary" });
    expect(within(nav).getByText("Manteion")).toBeTruthy();
    expect(within(nav).queryByText("Faults Lab")).toBeNull();
    expect(nav.querySelector('img[src="/favicon.svg"]')).not.toBeNull();
  });

  it("still shows and dismisses the notice when sessionStorage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderShell();
    expect(await screen.findByText(NOTICE_TEXT)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(NOTICE_TEXT)).toBeNull();
  });
});
