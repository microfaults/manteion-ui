import { renderWithRouter } from "@/test-utils/render-with-router";
import { screen } from "@testing-library/react";
import type { JSX } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ isMock: true }));
vi.mock("@/lib/env", () => ({
  get IS_MOCK() {
    return env.isMock;
  },
}));

import { Route } from "@/routes/settings/environments";

// The router restores scroll on navigation; jsdom has no scrollTo.
beforeAll(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

const renderPage = () => {
  const Page = Route.options.component as () => JSX.Element;
  return renderWithRouter(<Page />);
};

const includesText = (t: string) => (_: string, el: Element | null) =>
  el?.textContent?.includes(t) ?? false;

describe("Settings › Environments", () => {
  beforeEach(() => {
    env.isMock = true;
  });

  it("tells a demo visitor what the environment is, with no internal notes", async () => {
    renderPage();
    expect(await screen.findByText(/The one environment this console manages/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "online-boutique" })).toBeTruthy();
    for (const t of ["Not wired yet", "docs/", "api-needed"])
      expect(screen.queryAllByText(includesText(t))).toHaveLength(0);
  });

  it("keeps the operator build's placeholder", async () => {
    env.isMock = false;
    renderPage();
    expect(await screen.findByText("Not wired yet")).toBeTruthy();
    expect(screen.queryByText(/The one environment this console manages/)).toBeNull();
  });
});
