import { NewExperimentWizard } from "@/components/experiments/new-experiment-wizard";
import type { WorkflowSummary } from "@/lib/workflow-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    workflowsApi: { listWorkflows: vi.fn() },
    rulesApi: { listRules: vi.fn() },
    experimentsApi: {
      listExperiments: vi.fn(),
      createExperiment: vi.fn(),
      startExperiment: vi.fn(),
    },
    servicesApi: { listSDKInstances: vi.fn() },
  };
});
import { experimentsApi, rulesApi, servicesApi, workflowsApi } from "@/lib/api";

const WORKFLOWS: WorkflowSummary[] = [
  {
    id: "wf-checkout",
    name: "checkout-burst",
    version: "v2",
    targets: ["productcatalog", "cartservice"],
    estRpsPerVu: 4,
    updatedAt: "2026-06-01T00:00:00Z",
    requestNodeCount: 3,
  },
];
const RULES = [
  { id: "rule-1", name: "hang-catalog", service: "productcatalog", enabled: true },
  { id: "rule-2", name: "slow-cart", service: "cartservice", enabled: false },
];
const RUNNING = {
  id: "exp-9",
  name: "cart-freeze",
  status: "running",
  targeted_services: ["cartservice"],
  created_at: "2026-06-01T00:00:00Z",
  phases: [
    {
      id: "ph-9",
      name: "isolation",
      status: "running",
      workflows: [],
      rule_ids: [],
      frozen_services: [{ service: "cartservice", mode: "replay" }],
    },
  ],
};

const fieldValue = (el: HTMLElement) => (el as HTMLInputElement | HTMLSelectElement).value;
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function toPlanStep(name = "checkout-p99") {
  fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: /next: phase plan/i }));
  await screen.findByRole("switch", { name: /auto-plan phases/i });
}

describe("NewExperimentWizard", () => {
  const onCreated = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workflowsApi.listWorkflows).mockResolvedValue(WORKFLOWS);
    vi.mocked(rulesApi.listRules).mockResolvedValue(RULES as never);
    vi.mocked(experimentsApi.listExperiments).mockResolvedValue([RUNNING as never]);
    vi.mocked(servicesApi.listSDKInstances).mockResolvedValue([]);
    vi.mocked(experimentsApi.createExperiment).mockImplementation(async (input) => ({
      id: "exp-new",
      name: input.name,
      status: "planned",
      targeted_services: [],
      created_at: "2026-06-01T00:00:00Z",
      phases: [],
    }));
    vi.mocked(experimentsApi.startExperiment).mockImplementation(async (id) => ({
      id,
      name: "x",
      status: "running",
      targeted_services: [],
      created_at: "2026-06-01T00:00:00Z",
      phases: [],
    }));
  });

  it("step 1 requires a name before the phase plan opens", async () => {
    render(wrap(<NewExperimentWizard onCreated={onCreated} onCancel={onCancel} />));
    fireEvent.click(screen.getByRole("button", { name: /next: phase plan/i }));
    expect(await screen.findByText(/name is required/i)).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /auto-plan phases/i })).toBeNull();
  });

  it("auto-plan generates baseline + one isolation per targeted service + combined from the workflow's targets", async () => {
    render(wrap(<NewExperimentWizard onCreated={onCreated} onCancel={onCancel} />));
    await toPlanStep();
    await waitFor(() =>
      expect(fieldValue(screen.getByLabelText(/auto-plan workflow/i))).toBe("wf-checkout"),
    );
    fireEvent.click(screen.getByRole("switch", { name: /auto-plan phases/i }));
    const names = screen
      .getAllByLabelText(/^phase \d+ name$/i)
      .map((el) => (el as HTMLInputElement).value);
    expect(names).toEqual([
      "baseline",
      "isolation-productcatalog",
      "isolation-cartservice",
      "combined",
    ]);
    // isolation-productcatalog freezes the other targeted service and carries productcatalog's rule
    const iso = screen.getByRole("region", { name: /phase 2: isolation-productcatalog/i });
    expect(fieldValue(within(iso).getByLabelText("Service"))).toBe("cartservice");
    expect(within(iso).getByText("hang-catalog")).toBeTruthy();
  });

  it("preflight blocks on a running-experiment overlap, warns about disabled rules, and disables Create", async () => {
    render(wrap(<NewExperimentWizard onCreated={onCreated} onCancel={onCancel} />));
    await toPlanStep();
    await waitFor(() =>
      expect(fieldValue(screen.getByLabelText(/auto-plan workflow/i))).toBe("wf-checkout"),
    );
    fireEvent.click(screen.getByRole("switch", { name: /auto-plan phases/i }));
    const preflight = screen.getByRole("complementary", { name: /preflight/i });
    expect(
      await within(preflight).findByText(/overlaps running experiment cart-freeze/i),
    ).toBeTruthy();
    expect(within(preflight).getByText(/slow-cart/)).toBeTruthy();
    expect(within(preflight).getByText(/no sdk instances/i)).toBeTruthy();
    expect(isDisabled(screen.getByRole("button", { name: /^create$/i }))).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: /create & start/i }))).toBe(true);
  });

  it("creates the experiment from a manual plan and reports it; Create & start also starts it", async () => {
    render(wrap(<NewExperimentWizard onCreated={onCreated} onCancel={onCancel} />));
    await toPlanStep("manual-plan");
    await screen.findByRole("button", { name: /add phase/i });
    fireEvent.click(screen.getByRole("button", { name: /add phase/i }));
    const phase = screen.getByRole("region", { name: /phase 1/i });
    fireEvent.change(within(phase).getByLabelText(/phase 1 name/i), {
      target: { value: "baseline" },
    });
    fireEvent.change(within(phase).getByLabelText("Workflow"), {
      target: { value: "wf-checkout" },
    });
    fireEvent.change(within(phase).getByLabelText("VUs"), { target: { value: "25" } });
    const preflight = screen.getByRole("complementary", { name: /preflight/i });
    expect(await within(preflight).findByText(/no services touched/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "exp-new" }), false),
    );
    expect(experimentsApi.createExperiment).toHaveBeenCalledWith({
      name: "manual-plan",
      phases: [
        {
          name: "baseline",
          position: 0,
          persist_cache: false,
          frozen_services: [],
          workflows: [{ workflow_id: "wf-checkout", vus: 25, duration_sec: 300 }],
          rule_ids: [],
        },
      ],
    });
    expect(experimentsApi.startExperiment).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /create & start/i }));
    await waitFor(() => expect(experimentsApi.startExperiment).toHaveBeenCalledWith("exp-new"));
    await waitFor(() =>
      expect(onCreated).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "running" }),
        true,
      ),
    );
  });

  it("shows the backend error verbatim when create fails", async () => {
    const { ApiError } = await import("@/lib/api/client");
    vi.mocked(experimentsApi.createExperiment).mockRejectedValueOnce(
      new ApiError(400, "/api/v1/experiments", { error: "phase workflow: vus must be > 0" }),
    );
    render(wrap(<NewExperimentWizard onCreated={onCreated} onCancel={onCancel} />));
    await toPlanStep();
    await screen.findByRole("button", { name: /add phase/i });
    fireEvent.click(screen.getByRole("button", { name: /add phase/i }));
    fireEvent.change(screen.getByLabelText("Workflow"), { target: { value: "wf-checkout" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(
      await screen.findByText(/manteion answered 400: phase workflow: vus must be > 0/i),
    ).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
