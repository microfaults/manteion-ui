import { RuleEditorPanel } from "@/components/rules/rule-editor-panel";
import type { Rule } from "@/types/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
}));

import { rulesApi } from "@/lib/api";

const EXISTING_RULE: Rule = {
  id: "rule-001",
  name: "freeze-productcatalog",
  service: "productcatalog",
  enabled: true,
  priority: 100,
  mode: "inline",
  fault_spec_id: "inline:hang 5s",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  match: {
    labels: { _target: "inline", "atropos.workflow": "browse", tenant: "demo" },
  },
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

  it("renders fault primitive field", () => {
    renderPanel({ isNew: true, ruleId: null });
    expect(screen.getByPlaceholderText("spec-…")).toBeTruthy();
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
    await user.click(screen.getByText("Save"));

    expect(rulesApi.createRule).toHaveBeenCalledWith(
      expect.objectContaining({ name: "test-rule" }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(newRule));
  });

  it("shows save error when API rejects", async () => {
    const user = userEvent.setup();
    vi.mocked(rulesApi.createRule).mockRejectedValue(new Error("validation failed"));
    renderPanel({ isNew: true, ruleId: null });
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
    expect(screen.getByDisplayValue("inline:hang 5s")).toBeTruthy();
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
