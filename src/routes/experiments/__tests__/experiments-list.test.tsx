import { renderWithRouter } from "@/test-utils/render-with-router";
import type { Experiment } from "@/types/api";
import { screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    experimentsApi: { ...actual.experimentsApi, listExperiments: vi.fn() },
    workflowsApi: { ...actual.workflowsApi, listWorkflows: vi.fn() },
  };
});
import { experimentsApi, workflowsApi } from "@/lib/api";
import { Route } from "../index";

const WF_ID = "wf-01a0264c-c09b-705b-8a4e-7075c638ce5e";
const EXPERIMENT: Experiment = {
  id: "exp-1",
  name: "ui-e2e-2026-09-12-rec",
  status: "completed",
  targeted_services: [],
  created_at: "2026-09-12T19:41:00Z",
  phases: [
    {
      id: "ph-1",
      name: "baseline",
      status: "completed",
      workflows: [{ workflow_id: WF_ID }],
      frozen_services: [],
      rule_ids: [],
    },
  ],
};

describe("Experiments list", () => {
  beforeEach(() => {
    vi.mocked(experimentsApi.listExperiments).mockResolvedValue([EXPERIMENT]);
    vi.mocked(workflowsApi.listWorkflows).mockResolvedValue([
      {
        id: WF_ID,
        name: "browse-nodeport",
        version: "v2",
        targets: [],
        estRpsPerVu: 2,
        updatedAt: "2026-09-01T00:00:00Z",
        requestNodeCount: 4,
      },
    ]);
  });

  it("names workflows instead of printing their ids (real ids are UUIDs)", async () => {
    const Page = Route.options.component as React.ComponentType;
    renderWithRouter(<Page />);
    expect((await screen.findAllByText("browse-nodeport")).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(WF_ID))).toBeNull();
  });
});
