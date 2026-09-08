import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
      baseUrl: "",
      environment: "test",
    },
  };
});

import { apiClient } from "@/lib/api/client";
import * as phasesApi from "@/lib/api/phases";
import type { z } from "zod";

/** Answer the next GET with `payload` parsed through the schema the client was handed. */
const answer = (payload: unknown) =>
  vi
    .mocked(apiClient.get)
    .mockImplementationOnce(async (_path: string, schema: z.ZodTypeAny) => schema.parse(payload));

const row = (over: Record<string, unknown>) => ({
  id: "ph-1",
  experiment_id: "exp-1",
  experiment_name: "checkout-p99",
  name: "baseline",
  position: 0,
  workflow_ids: ["wf-1"],
  frozen_service_count: 0,
  status: "completed",
  ...over,
});

describe("phasesApi.listPhases", () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it("walks every page of GET /api/v1/phases (the backend has no filters) and filters client-side", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        data: [row({ id: "ph-1" }), row({ id: "ph-2", experiment_id: "exp-2", status: "running" })],
        page: { offset: 0, limit: 2, total: 3 },
      })
      .mockResolvedValueOnce({
        data: [row({ id: "ph-3", status: "running" })],
        page: { offset: 2, limit: 2, total: 3 },
      });
    const all = await phasesApi.listPhases();
    expect(all.map((p) => p.id)).toEqual(["ph-1", "ph-2", "ph-3"]);
    expect(vi.mocked(apiClient.get).mock.calls[0]?.[0]).toBe("/api/v1/phases?limit=200&offset=0");
    expect(vi.mocked(apiClient.get).mock.calls[1]?.[0]).toBe("/api/v1/phases?limit=200&offset=2");

    vi.mocked(apiClient.get)
      .mockReset()
      .mockResolvedValue({
        data: [row({ id: "ph-1" }), row({ id: "ph-2", experiment_id: "exp-2", status: "running" })],
        page: { offset: 0, limit: 200, total: 2 },
      });
    expect((await phasesApi.listPhases({ experimentId: "exp-1" })).map((p) => p.id)).toEqual([
      "ph-1",
    ]);
    expect((await phasesApi.listPhases({ status: "running" })).map((p) => p.id)).toEqual(["ph-2"]);
  });
});

describe("phasesApi flat routes", () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset().mockResolvedValue(undefined);
  });

  it("getPhaseDetail / getPhaseFaults read by phase id and normalise null lists", async () => {
    answer({
      ...row({ id: "ph 1" }),
      frozen_services: null,
      workflows: [],
      workflow_results: null,
      total_request_count: 0,
      total_error_count: 0,
      overall_error_rate: 0,
    });
    const d = await phasesApi.getPhaseDetail("ph 1");
    expect(apiClient.get).toHaveBeenLastCalledWith("/api/v1/phases/ph%201", expect.anything());
    expect(d.experiment_name).toBe("checkout-p99");
    expect(d.workflow_results).toEqual([]);
    answer({
      frozen_services: [],
      phase_rules: [{ phase_id: "ph-1", rule_id: "rule-1", position: 0 }],
      fault_events: null,
    });
    const f = await phasesApi.getPhaseFaults("ph-1");
    expect(apiClient.get).toHaveBeenLastCalledWith("/api/v1/phases/ph-1/faults", expect.anything());
    expect(f.phase_rules[0]?.rule_id).toBe("rule-1");
    expect(f.fault_events).toEqual([]);
  });

  it("pause/resume/stop POST to /api/v1/phases/{id}/…; stop carries ?status", async () => {
    await phasesApi.pausePhase("ph-1");
    expect(apiClient.post).toHaveBeenLastCalledWith(
      "/api/v1/phases/ph-1/pause",
      undefined,
      expect.anything(),
    );
    await phasesApi.resumePhase("ph-1");
    expect(apiClient.post).toHaveBeenLastCalledWith(
      "/api/v1/phases/ph-1/resume",
      undefined,
      expect.anything(),
    );
    await phasesApi.stopPhase("ph-1");
    expect(apiClient.post).toHaveBeenLastCalledWith(
      "/api/v1/phases/ph-1/stop",
      undefined,
      expect.anything(),
    );
    await phasesApi.stopPhase("ph-1", "failed");
    expect(apiClient.post).toHaveBeenLastCalledWith(
      "/api/v1/phases/ph-1/stop?status=failed",
      undefined,
      expect.anything(),
    );
  });
});
