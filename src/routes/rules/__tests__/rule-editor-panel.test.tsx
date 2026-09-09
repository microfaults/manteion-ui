import { RuleEditorPanel } from "@/components/rules/rule-editor-panel";
import type { FaultSpec, Rule } from "@/types/api";
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
    listFaultSpecs: vi.fn(),
  },
}));

import { faultsApi, rulesApi } from "@/lib/api";

const HANG_SPEC: FaultSpec = {
  id: "spec-inline-hang-5s",
  name: "hang-5s",
  category: "inline",
  fault_type: "hang",
  params: {},
  created_at: "2026-01-01T00:00:00Z",
};

const LATENCY_SPEC: FaultSpec = {
  id: "spec-x",
  name: "latency-250ms",
  category: "inline",
  fault_type: "latency",
  params: {},
  created_at: "2026-01-01T00:00:00Z",
};

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
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
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

const saveButton = () => screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;

beforeEach(() => {
  vi.mocked(faultsApi.listFaultSpecs).mockResolvedValue([HANG_SPEC, LATENCY_SPEC]);
});

describe("RuleEditorPanel — new rule", () => {
  it("renders name and service fields", () => {
    renderPanel({ isNew: true, ruleId: null });
    expect(screen.getByPlaceholderText("my-rule")).toBeTruthy();
    expect(screen.getByLabelText("Service")).toBeTruthy();
  });

  it("renders action type and the fault-spec picker", async () => {
    renderPanel({ isNew: true, ruleId: null });
    expect(screen.getByLabelText("Action type")).toBeTruthy();
    expect(await screen.findByLabelText("Fault spec")).toBeTruthy();
  });

  it("switches sub-fields when the action type changes to cachebox", async () => {
    const user = userEvent.setup();
    renderPanel({ isNew: true, ruleId: null });
    await user.selectOptions(screen.getByLabelText("Action type"), "cachebox");
    expect(screen.getByLabelText("Cachebox mode")).toBeTruthy();
    expect(screen.getByLabelText("Key strategy")).toBeTruthy();
    expect(screen.queryByLabelText("Fault spec")).toBeNull();
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

  it("disables Save on a pristine form and lists what is missing", async () => {
    renderPanel({ isNew: true, ruleId: null });
    expect(saveButton().disabled).toBe(true);
    expect(await screen.findByText("Name is required.")).toBeTruthy();
    expect(screen.getByText("Service is required.")).toBeTruthy();
  });

  it("calls createRule once name, service, and fault spec are set", async () => {
    const user = userEvent.setup();
    const newRule: Rule = { ...EXISTING_RULE, id: "rule-new", name: "test-rule" };
    vi.mocked(rulesApi.createRule).mockResolvedValue(newRule);
    const { onSaved } = renderPanel({ isNew: true, ruleId: null });

    await user.type(screen.getByPlaceholderText("my-rule"), "test-rule");
    await user.selectOptions(screen.getByLabelText("Service"), "productcatalog");
    await user.selectOptions(await screen.findByLabelText("Fault spec"), "spec-x");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    expect(rulesApi.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "test-rule",
        service: "productcatalog",
        action: { type: "fault_spec", fault_spec_id: "spec-x" },
      }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(newRule));
  });

  it("shows save error when API rejects", async () => {
    const user = userEvent.setup();
    vi.mocked(rulesApi.createRule).mockRejectedValue(new Error("validation failed"));
    renderPanel({ isNew: true, ruleId: null });
    await user.type(screen.getByPlaceholderText("my-rule"), "test-rule");
    await user.selectOptions(screen.getByLabelText("Service"), "productcatalog");
    await user.selectOptions(await screen.findByLabelText("Fault spec"), "spec-x");
    await user.click(saveButton());
    expect(await screen.findByText("validation failed")).toBeTruthy();
  });

  it("blocks out-of-range priorities", async () => {
    const user = userEvent.setup();
    renderPanel({ isNew: true, ruleId: null });
    await user.type(screen.getByPlaceholderText("my-rule"), "test-rule");
    await user.selectOptions(screen.getByLabelText("Service"), "productcatalog");
    await user.selectOptions(await screen.findByLabelText("Fault spec"), "spec-x");

    const priority = screen.getByRole("spinbutton") as HTMLInputElement;
    await user.clear(priority);
    await user.type(priority, "5000");
    expect(await screen.findByText(/between 0 and 1000/i)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);

    await user.clear(priority);
    await user.type(priority, "100");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
  });
});

describe("RuleEditorPanel — rules require faults", () => {
  it("blocks fault_spec rules when the catalog is loaded and empty", async () => {
    const user = userEvent.setup();
    vi.mocked(faultsApi.listFaultSpecs).mockResolvedValue([]);
    renderPanel({ isNew: true, ruleId: null });

    await user.type(screen.getByPlaceholderText("my-rule"), "test-rule");
    await user.selectOptions(screen.getByLabelText("Service"), "productcatalog");

    const notes = await screen.findAllByText(/create one on the faults page first/i);
    expect(notes.length).toBeGreaterThan(0);
    expect(saveButton().disabled).toBe(true);
  });

  it("blocks a hydrated rule whose fault spec no longer exists", async () => {
    vi.mocked(rulesApi.getRule).mockResolvedValue(EXISTING_RULE);
    vi.mocked(faultsApi.listFaultSpecs).mockResolvedValue([LATENCY_SPEC]); // hang spec deleted
    renderPanel({ isNew: false, ruleId: "rule-001" });

    await screen.findByDisplayValue("freeze-productcatalog");
    expect(await screen.findByText(/unknown fault spec "spec-inline-hang-5s"/i)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it("keeps the manual-ID escape hatch when the catalog fetch fails", async () => {
    const user = userEvent.setup();
    vi.mocked(faultsApi.listFaultSpecs).mockRejectedValue(new Error("older backend"));
    vi.mocked(rulesApi.createRule).mockResolvedValue(EXISTING_RULE);
    renderPanel({ isNew: true, ruleId: null });

    await user.type(screen.getByPlaceholderText("my-rule"), "test-rule");
    await user.selectOptions(screen.getByLabelText("Service"), "productcatalog");
    await user.type(await screen.findByPlaceholderText("spec-…"), "spec-manual");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    expect(rulesApi.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        action: { type: "fault_spec", fault_spec_id: "spec-manual" },
      }),
    );
  });

  it("cachebox rules save without any fault prerequisite", async () => {
    const user = userEvent.setup();
    vi.mocked(faultsApi.listFaultSpecs).mockResolvedValue([]);
    vi.mocked(rulesApi.createRule).mockResolvedValue(EXISTING_RULE);
    renderPanel({ isNew: true, ruleId: null });

    await user.type(screen.getByPlaceholderText("my-rule"), "freeze-cart");
    await user.selectOptions(screen.getByLabelText("Service"), "cartservice");
    await user.selectOptions(screen.getByLabelText("Action type"), "cachebox");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    expect(rulesApi.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        action: {
          type: "cachebox",
          cachebox: { mode: "passthrough", key_strategy: "canonical_v2" },
        },
      }),
    );
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

  it("populates the fault spec select after load", async () => {
    renderPanel({ isNew: false, ruleId: "rule-001" });
    await screen.findByDisplayValue("freeze-productcatalog");
    const select = (await screen.findByLabelText("Fault spec")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("spec-inline-hang-5s"));
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
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());
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

    await screen.findByDisplayValue("cachebox-test");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

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
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());
    expect(rulesApi.updateRule).toHaveBeenCalledWith(
      "rule-001",
      expect.objectContaining({ mode: "background" }),
    );
  });
});

describe("RuleEditorPanel — cache-box key strategy", () => {
  /** manteion-go `internal/model/enums.go` CacheBoxKeyStrategyValues. */
  const BACKEND_KEY_STRATEGIES = [
    "exact",
    "exact_with_host",
    "exact_with_body",
    "canonical_v2",
    "exact_with_host_norm",
  ];

  const openCacheboxAction = async () => {
    const user = userEvent.setup();
    renderPanel({ isNew: true, ruleId: null });
    await user.selectOptions(screen.getByLabelText("Action type"), "cachebox");
    return screen.getByLabelText("Key strategy") as HTMLSelectElement;
  };

  it("offers every key strategy the backend accepts", async () => {
    const select = await openCacheboxAction();
    const values = Array.from(select.options).map((o) => o.value);
    expect(values.sort()).toEqual([...BACKEND_KEY_STRATEGIES].sort());
  });

  it("defaults a new rule to the platform default key strategy", async () => {
    const select = await openCacheboxAction();
    expect(select.value).toBe("canonical_v2");
  });

  it("hydrates an existing rule saved with exact_with_host_norm", async () => {
    const hostNormRule: Rule = {
      ...EXISTING_RULE,
      id: "rule-host-norm",
      name: "cachebox-host-norm",
      action: {
        type: "cachebox",
        cachebox: { mode: "replay", key_strategy: "exact_with_host_norm" },
      },
    };
    vi.mocked(rulesApi.getRule).mockResolvedValue(hostNormRule);
    renderPanel({ isNew: false, ruleId: "rule-host-norm" });

    await screen.findByDisplayValue("cachebox-host-norm");
    expect((screen.getByLabelText("Key strategy") as HTMLSelectElement).value).toBe(
      "exact_with_host_norm",
    );
  });
});
