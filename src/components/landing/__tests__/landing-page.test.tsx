import { LandingPage } from "@/components/landing/landing-page";
import { ApiError } from "@/lib/api/client";
import { startSampleExperiment } from "@/lib/sample-experiment";
import { Route as RootRoute } from "@/routes/__root";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ isMock: true }));
vi.mock("@/lib/env", () => ({
  get IS_MOCK() {
    return env.isMock;
  },
}));

vi.mock("@/lib/sample-experiment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sample-experiment")>()),
  startSampleExperiment: vi.fn(() => "exp-sample-catalog-latency"),
}));

/** Landing page at `/` under `root`, plus stub dashboard and experiment
 *  routes, so a test can follow where the page's buttons and links go. */
function renderApp(path = "/", root: () => JSX.Element = () => <Outlet />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: root });
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/", component: LandingPage }),
    createRoute({ getParentRoute: () => rootRoute, path: "/dashboard", component: () => null }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/experiments/$experimentId",
      component: () => <p>experiment detail</p>,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
  return router;
}
const renderLanding = () => renderApp();

// The router restores scroll on navigation; jsdom has no scrollTo.
beforeAll(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

const includesText = (t: string) => (_: string, el: Element | null) =>
  el?.textContent?.includes(t) ?? false;

describe("LandingPage", () => {
  beforeEach(() => {
    env.isMock = true;
    vi.mocked(startSampleExperiment).mockClear();
    vi.mocked(startSampleExperiment).mockImplementation(() => "exp-sample-catalog-latency");
  });

  it("explains the platform with the design's copy and the real measured figures", async () => {
    renderLanding();
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Change one thing. Hold the traffic. Measure what moved.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText(/This site runs on simulated data\./)).toBeTruthy();
    for (const t of ["10.5 ms", "364.9 ms", "8.4 ms"]) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText(/Measured on the real testbed on 2026-08-25/)).toBeTruthy();
    expect(document.title).toBe("Manteion");
  });

  it("draws the Online Boutique diagram with only the services in the example", async () => {
    renderLanding();
    const diagram = await screen.findByRole("img", { name: /Online Boutique/ });
    for (const s of [
      "zeus",
      "frontend",
      "atropos",
      "productcatalogservice",
      "manteion",
      "recommendationservice",
    ])
      expect(within(diagram).getByText(s)).toBeTruthy();
    for (const s of ["cartservice", "currencyservice", "checkoutservice"])
      expect(within(diagram).queryByText(s)).toBeNull();
    expect(diagram.parentElement?.classList.contains("overflow-x-auto")).toBe(true);
  });

  it("lists what was held constant between phases", async () => {
    renderLanding();
    expect(
      await screen.findByRole("heading", { name: "What did not change between phases" }),
    ).toBeTruthy();
    for (const t of [
      "3 browse journeys/s",
      "2 checkout journeys/s",
      "120 s",
      "200 millicores",
      "8 cores",
      "16 GiB",
      "k3s v1.34.6",
      "4 cores",
      "8 GiB",
      "Ubuntu 22.04.5",
    ])
      expect(screen.getAllByText(includesText(t)).length).toBeGreaterThan(0);
  });

  it("links to the console and opens GitHub in a new tab", async () => {
    renderLanding();
    for (const name of ["Open the console", "Browse the console"])
      expect((await screen.findByRole("link", { name })).getAttribute("href")).toBe("/dashboard");
    const github = screen.getAllByRole("link", { name: /github/i });
    expect(github.length).toBeGreaterThan(0);
    for (const a of [...github, screen.getByRole("link", { name: /atropos-go/ })]) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noreferrer");
      const hint = within(a).getByText("(opens in a new tab)");
      expect(hint.classList.contains("sr-only")).toBe(true);
    }
    expect(screen.getByRole("link", { name: "atropos-go (opens in a new tab)" })).toBeTruthy();
  });

  it("starts the sample experiment and opens it", async () => {
    const user = userEvent.setup();
    const router = renderLanding();
    await user.click(await screen.findByRole("button", { name: "Run the sample experiment" }));
    expect(startSampleExperiment).toHaveBeenCalledOnce();
    expect(await screen.findByText("experiment detail")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/experiments/exp-sample-catalog-latency");
  });

  it("stays put and says why when the mock refuses to start the sample", async () => {
    vi.mocked(startSampleExperiment).mockImplementation(() => {
      throw new ApiError(
        409,
        "mock://manteion",
        { error: "service footprint overlaps running experiment exp-001", code: "service_overlap" },
        "service footprint overlaps running experiment exp-001",
      );
    });
    const user = userEvent.setup();
    const router = renderLanding();
    await user.click(await screen.findByRole("button", { name: "Run the sample experiment" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "The sample could not start because another experiment in this session is using the same service. Stop it in the console, then try again.",
    );
    expect(router.state.location.pathname).toBe("/");
  });

  it("asks for a reload when the sample fails to start for any other reason", async () => {
    vi.mocked(startSampleExperiment).mockImplementation(() => {
      throw new ApiError(404, "mock://manteion", { error: "not found" }, "not found");
    });
    const user = userEvent.setup();
    const router = renderLanding();
    await user.click(await screen.findByRole("button", { name: "Run the sample experiment" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "The sample could not start. Reload the page and try again.",
    );
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("root route", () => {
  const Root = RootRoute.options.component as () => JSX.Element;
  afterEach(() => {
    env.isMock = true;
  });

  it("renders `/` without the console shell in the mock build", async () => {
    renderApp("/", Root);
    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
  });

  it("keeps the console shell on other pages of the mock build", async () => {
    renderApp("/dashboard", Root);
    expect(await screen.findByRole("navigation", { name: "Primary" })).toBeTruthy();
  });

  it("keeps the console shell at `/` in operator builds", async () => {
    env.isMock = false;
    renderApp("/", Root);
    expect(await screen.findByRole("navigation", { name: "Primary" })).toBeTruthy();
  });
});
