import { RuleEditorPanel } from "@/components/rules/rule-editor-panel";
import type { Rule } from "@/types/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  rulesApi: {
    listRules: vi.fn(),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
    getRule: vi.fn(),
  },
  servicesApi: {
    listSDKInstances: vi.fn().mockResolvedValue([]),
  },
  faultsApi: {
    listFaultSpecs: vi.fn().mockResolvedValue([]),
  },
}));

import { rulesApi } from "@/lib/api";

const EXISTING_RULE: Rule = {
  id: "rule-001",
  name: "freeze-productcatalog",
  service: "productcatalog",
  enabled: true,
  priority: 100,
  mode: "inline",
  start_policy: "deduplicate_by_rule",
  action: { type: "fault_spec", fault_spec_id: "spec-inline-hang-5s" },
  match: { labels: { "atropos.workflow": "browse", tenant: "demo" } },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderPanel(props: Partial<Parameters<typeof RuleEditorPanel>[0]> = {}) {
  const onSaved = vi.fn();
  const onDeleted = vi.fn();
  render(
    <RuleEditorPanel ruleId={null} isNew onSaved={onSaved} onDeleted={onDeleted} {...props} />,
    { wrapper },
  );
  return { onSaved, onDeleted };
}

describe("RuleEditorPanel — new rule", () => {
  it("renders name and service fields", () => {
    renderPanel({ isNew: true, ruleId: null });
    expect(screen.getByPlaceholderText("my-rule")).toBeTruthy();
    expect(screen.getByText("Service")).toBeTruthy();
  });

  it("renders action type and fault-spec sub-field", async () => {
    renderPanel({ isNew: true, ruleId: null });
    expect(screen.getByText("Action type")).toBeTruthy();
    expect(screen.getByText("Fault spec")).toBeTruthy();
    // FaultSpecPicker is async — with empty mocked list it falls back to a
    // free-text input with placeholder "spec-…" once useQuery resolves.
    expect(await screen.findByPlaceholderText("spec-…")).toBeTruthy();
  });

  it("switches sub-field when action type is cachebox", async () => {
    // Radix Select doesn't drive cleanly in jsdom (hasPointerCapture /
    // scrollIntoView aren't polyfilled). Verify the conditional rendering
    // by hydrating the form from an existing cachebox rule instead of
    // simulating the select click.
    const cacheboxRule: Rule = {
      ...EXISTING_RULE,
      action: {
        type: "cachebox",
        cachebox: { mode: "replay", key_strategy: "exact_with_host" },
      },
    };
    vi.mocked(rulesApi.getRule).mockResolvedValue(cacheboxRule);

    renderPanel({ isNew: false, ruleId: "rule-001" });
    await screen.findByDisplayValue("freeze-productcatalog");

    expect(screen.getByText("Cachebox mode")).toBeTruthy();
    expect(screen.getByText("Key strategy")).toBeTruthy();
    expect(screen.queryByPlaceholderText("spec-…")).toBeNull();
  });

  it("renders match criteria section with RuleBuilder", () => {
    renderPanel({ isNew: true, ruleId: null });
    expect(screen.getByText("Match criteria")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Builder" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Rego" })).toBeTruthy();
  });

  it("delete button is disabled for new rules", () => {
    renderPanel({ isNew: true, ruleId: null });
    const deleteBtn = screen.getByRole("button", { name: /Delete/i });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls createRule on save", async () => {
    const user = userEvent.setup();
    const newRule: Rule = { ...EXISTING_RULE, id: "rule-new", name: "test-rule" };
    vi.mocked(rulesApi.createRule).mockResolvedValue(newRule);
    const { onSaved } = renderPanel({ isNew: true, ruleId: null });

    await user.type(screen.getByPlaceholderText("my-rule"), "test-rule");
    // FaultSpecPicker falls back to a free-text input on empty list; type an
    // ID so the Save guard (faultSpecId required for fault_spec action) lets
    // the click through.
    await user.type(await screen.findByPlaceholderText("spec-…"), "spec-x");
    await user.click(screen.getByText("Save"));

    expect(rulesApi.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "test-rule",
        action: { type: "fault_spec", fault_spec_id: expect.any(String) },
      }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(newRule));
  });

  it("shows save error when API rejects", async () => {
    const user = userEvent.setup();
    vi.mocked(rulesApi.createRule).mockRejectedValue(new Error("validation failed"));
    renderPanel({ isNew: true, ruleId: null });
    // Fill faultSpecId so the Save guard doesn't block the click.
    await user.type(await screen.findByPlaceholderText("spec-…"), "spec-x");
    await user.click(screen.getByText("Save"));
    expect(await screen.findByText("validation failed")).toBeTruthy();
  });
});

describe("RuleEditorPanel — existing rule", () => {
  beforeEach(() => {
    vi.mocked(rulesApi.getRule).mockResolvedValue(EXISTING_RULE);
  });

  it("shows loading while fetching", () => {
    vi.mocked(rulesApi.getRule).mockImplementation(() => new Promise(() => {}));
    renderPanel({ isNew: false, ruleId: "rule-001" });
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("populates name after load", async () => {
    renderPanel({ isNew: false, ruleId: "rule-001" });
    const input = await screen.findByDisplayValue("freeze-productcatalog");
    expect(input).toBeTruthy();
  });

  it("populates fault spec id after load", async () => {
    renderPanel({ isNew: false, ruleId: "rule-001" });
    await screen.findByDisplayValue("freeze-productcatalog");
    // FaultSpecPicker with empty mocked list falls back to a free-text input
    // bound to faultSpecId, which is hydrated from the rule on load.
    expect(await screen.findByDisplayValue("spec-inline-hang-5s")).toBeTruthy();
  });

  it("renders match criteria builder for existing rule", async () => {
    renderPanel({ isNew: false, ruleId: "rule-001" });
    await screen.findByDisplayValue("freeze-productcatalog");
    expect(screen.getByText("Match criteria")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Builder" })).toBeTruthy();
  });

  it("calls updateRule on save", async () => {
    const user = userEvent.setup();
    vi.mocked(rulesApi.updateRule).mockResolvedValue(EXISTING_RULE);
    const { onSaved } = renderPanel({ isNew: false, ruleId: "rule-001" });
    await screen.findByDisplayValue("freeze-productcatalog");
    await user.click(screen.getByText("Save"));
    expect(rulesApi.updateRule).toHaveBeenCalledWith("rule-001", expect.any(Object));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("delete button is enabled for existing rules", async () => {
    renderPanel({ isNew: false, ruleId: "rule-001" });
    await screen.findByDisplayValue("freeze-productcatalog");
    const deleteBtn = screen.getByRole("button", { name: /Delete/i });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("calls deleteRule and fires onDeleted", async () => {
    const user = userEvent.setup();
    vi.mocked(rulesApi.deleteRule).mockResolvedValue(undefined);
    const { onDeleted } = renderPanel({ isNew: false, ruleId: "rule-001" });
    await screen.findByDisplayValue("freeze-productcatalog");
    await user.click(screen.getByRole("button", { name: /Delete/i }));
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("saves cachebox action with mode + key_strategy", async () => {
    const user = userEvent.setup();
    const existingCachebox: Rule = {
      id: "rule-cachebox-test",
      name: "cachebox-test",
      service: "cartservice",
      enabled: true,
      priority: 50,
      mode: "inline",
      action: { type: "cachebox", cachebox: { mode: "replay", key_strategy: "exact_with_body" } },
      match: {},
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    vi.mocked(rulesApi.getRule).mockResolvedValue(existingCachebox);
    vi.mocked(rulesApi.updateRule).mockResolvedValue(existingCachebox);

    renderPanel({ isNew: false, ruleId: "rule-cachebox-test" });

    // Wait for load, then save without changing anything.
    await screen.findByDisplayValue("cachebox-test");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(rulesApi.updateRule).toHaveBeenCalled());
    expect(rulesApi.updateRule).toHaveBeenCalledWith(
      "rule-cachebox-test",
      expect.objectContaining({
        action: {
          type: "cachebox",
          cachebox: { mode: "replay", key_strategy: "exact_with_body" },
        },
      }),
    );
  });

  it("preserves background mode on save (regression: F7)", async () => {
    const backgroundRule: Rule = { ...EXISTING_RULE, mode: "background" };
    vi.mocked(rulesApi.getRule).mockResolvedValue(backgroundRule);
    vi.mocked(rulesApi.updateRule).mockResolvedValue(backgroundRule);
    const user = userEvent.setup();
    renderPanel({ isNew: false, ruleId: "rule-001" });
    await screen.findByDisplayValue("freeze-productcatalog");
    await user.click(screen.getByText("Save"));
    expect(rulesApi.updateRule).toHaveBeenCalledWith(
      "rule-001",
      expect.objectContaining({ mode: "background" }),
    );
  });
});
