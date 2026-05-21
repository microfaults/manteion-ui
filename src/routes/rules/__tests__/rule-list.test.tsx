import type { Rule } from "@/types/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the API module before importing the route component
vi.mock("@/lib/api", () => ({
  rulesApi: {
    listRules: vi.fn(),
    updateRule: vi.fn(),
    createRule: vi.fn(),
    deleteRule: vi.fn(),
    getRule: vi.fn(),
  },
  servicesApi: {
    listSDKInstances: vi.fn().mockResolvedValue([]),
  },
}));

// Mock TanStack Router so the component can render without a real router
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: (_path: string) => (config: { component: unknown }) => config,
    Link: ({ children, ...props }: { children: React.ReactNode; to: string; params?: unknown }) => (
      <a href={props.to}>{children}</a>
    ),
    useNavigate: () => vi.fn(),
  };
});

import { rulesApi } from "@/lib/api";

const MOCK_RULES: Rule[] = [
  {
    id: "r1",
    name: "freeze-productcatalog",
    service: "productcatalog",
    enabled: true,
    priority: 100,
    mode: "inline",
    action: {
      type: "cachebox",
      cachebox: { mode: "replay", key_strategy: "exact" },
    },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    match: { labels: { _target: "cache-box", _cachebox_mode: "replay" } },
  },
  {
    id: "r2",
    name: "cart-ingress-500",
    service: "cartservice",
    enabled: false,
    priority: 90,
    mode: "inline",
    action: { type: "fault_spec", fault_spec_id: "spec-inline-http-error" },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    match: { labels: { _target: "inline" } },
  },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// Lazy import after mocks are set up
async function renderRulesPage() {
  const { RulesPage } = await import("@/components/rules/rules-page");
  render(<RulesPage />, { wrapper });
}

describe("RulesPage list", () => {
  beforeEach(() => {
    vi.mocked(rulesApi.listRules).mockResolvedValue(MOCK_RULES);
  });

  it("shows loading state initially", async () => {
    vi.mocked(rulesApi.listRules).mockImplementation(() => new Promise(() => {}));
    await renderRulesPage();
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("renders rule names after load", async () => {
    await renderRulesPage();
    expect(await screen.findByText("freeze-productcatalog")).toBeTruthy();
    expect(screen.getByText("cart-ingress-500")).toBeTruthy();
  });

  it("shows count summary", async () => {
    await renderRulesPage();
    await screen.findByText("freeze-productcatalog");
    expect(screen.getByText(/2 total · 1 enabled/)).toBeTruthy();
  });

  it("shows error state when fetch fails", async () => {
    vi.mocked(rulesApi.listRules).mockRejectedValue(new Error("network error"));
    await renderRulesPage();
    expect(await screen.findByText(/Could not reach manteion/)).toBeTruthy();
  });

  it("filters rules by search term", async () => {
    const user = userEvent.setup();
    await renderRulesPage();
    await screen.findByText("freeze-productcatalog");
    await user.type(screen.getByPlaceholderText("Search rules…"), "cart");
    expect(screen.queryByText("freeze-productcatalog")).toBeNull();
    expect(screen.getByText("cart-ingress-500")).toBeTruthy();
  });

  it("shows empty state when search has no matches", async () => {
    const user = userEvent.setup();
    await renderRulesPage();
    await screen.findByText("freeze-productcatalog");
    await user.type(screen.getByPlaceholderText("Search rules…"), "zzznomatch");
    expect(screen.getByText(/No rules match your search/)).toBeTruthy();
  });
});
