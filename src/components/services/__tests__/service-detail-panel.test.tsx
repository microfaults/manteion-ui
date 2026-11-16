import { ServiceDetailPanel } from "@/components/services/service-detail-panel";
import { renderWithRouter } from "@/test-utils/render-with-router";
import type { Rule, SDKInstanceDetail } from "@/types/api";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  servicesApi: {
    getSDKInstance: vi.fn(),
    killSwitch: vi.fn(),
  },
  rulesApi: {
    listRules: vi.fn(),
    updateRule: vi.fn(),
  },
}));
import { rulesApi, servicesApi } from "@/lib/api";

const rule = (id: string): Rule => ({
  id,
  name: `rule ${id}`,
  service: "cartservice",
  enabled: true,
  priority: 10,
  mode: "inline",
  action: { type: "fault_spec", fault_spec_id: "fs-1" },
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
});

const detail = (over: Partial<SDKInstanceDetail> = {}): SDKInstanceDetail => ({
  id: "cart-sdk-j7k8l",
  service: "cartservice",
  version: "v0.4.0",
  address: "10.0.0.31:50051",
  registered_at: "2026-11-01T00:00:00Z",
  last_poll_at: "2026-11-16T00:00:00Z",
  status: "alive",
  observed_generation: 17,
  applied_generation: 16,
  observed_errors: [],
  active_rule_ids: [],
  recent_run_ids: [],
  ...over,
});

function renderPanel() {
  return renderWithRouter(
    <ServiceDetailPanel
      instanceId="cart-sdk-j7k8l"
      fallbackService="cartservice"
      onClose={vi.fn()}
    />,
  );
}

describe("ServiceDetailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rulesApi.listRules).mockResolvedValue([rule("r-1"), rule("r-2"), rule("r-3")]);
    vi.mocked(servicesApi.killSwitch).mockResolvedValue({
      disabled_rule_ids: [],
      at: "2026-11-16T00:00:00Z",
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the generation fields the backend sends and none it does not", async () => {
    vi.mocked(servicesApi.getSDKInstance).mockResolvedValue(detail());
    renderPanel();
    expect(await screen.findByText("Generation observed")).toBeTruthy();
    expect(screen.getByText("17")).toBeTruthy();
    expect(screen.getByText("Generation applied")).toBeTruthy();
    expect(screen.getByText("16")).toBeTruthy();
    expect(screen.queryByText("Rule version acked")).toBeNull();
    expect(screen.queryByText("Last error")).toBeNull();
    expect(screen.queryByText("Observed errors")).toBeNull();
  });

  it("lists each observed error when there are any", async () => {
    vi.mocked(servicesApi.getSDKInstance).mockResolvedValue(
      detail({
        observed_errors: ["rule r-1: unknown fault spec", "cache box: replay set missing"],
      }),
    );
    renderPanel();
    expect(await screen.findByText("Observed errors")).toBeTruthy();
    expect(screen.getByText("rule r-1: unknown fault spec")).toBeTruthy();
    expect(screen.getByText("cache box: replay set missing")).toBeTruthy();
  });

  it("omits the generation and error rows when the backend leaves them out", async () => {
    vi.mocked(servicesApi.getSDKInstance).mockResolvedValue(
      detail({
        observed_generation: undefined,
        applied_generation: undefined,
        observed_errors: undefined,
      }),
    );
    renderPanel();
    expect(await screen.findByText("Version")).toBeTruthy();
    expect(screen.queryByText("Generation observed")).toBeNull();
    expect(screen.queryByText("Generation applied")).toBeNull();
    expect(screen.queryByText("Observed errors")).toBeNull();
  });

  it("asks before a kill switch that acts on the whole service", async () => {
    vi.mocked(servicesApi.getSDKInstance).mockResolvedValue(
      detail({ active_rule_ids: ["r-1", "r-2", "r-3"] }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel();
    expect(await screen.findByText("rule r-3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /kill switch/i }));
    expect(confirm).toHaveBeenCalledWith(
      "Disable all 3 active rules for cartservice and cancel its running fault configs? This applies to every instance of the service.",
    );
    expect(servicesApi.killSwitch).not.toHaveBeenCalled();
  });

  it("uses the singular for one active rule", async () => {
    vi.mocked(servicesApi.getSDKInstance).mockResolvedValue(detail({ active_rule_ids: ["r-1"] }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel();
    expect(await screen.findByText("rule r-1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /kill switch/i }));
    expect(confirm).toHaveBeenCalledWith(
      "Disable the 1 active rule for cartservice and cancel its running fault configs? This applies to every instance of the service.",
    );
  });

  it("still names the service when no active rules are reported", async () => {
    vi.mocked(servicesApi.getSDKInstance).mockResolvedValue(detail());
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel();
    expect(await screen.findByText("No active rules.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /kill switch/i }));
    expect(confirm).toHaveBeenCalledWith(
      "Run the kill switch for cartservice? No active rules are reported; it still cancels the service's running fault configs and applies to every instance of the service.",
    );
  });
});
