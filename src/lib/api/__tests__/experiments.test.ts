import { PhaseNameSchema, PhaseStatusSchema, PhaseSummarySchema } from "@/types/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the shared client so we exercise experiments.ts logic (paths, params)
// without real network. Schema-vs-wire correctness is checked separately below
// by parsing backend-shaped fixtures with the real Zod schemas.
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      del: vi.fn(),
      baseUrl: "",
      environment: "test",
    },
  };
});

import { apiClient } from "@/lib/api/client";
import * as experimentsApi from "@/lib/api/experiments";

/** Full backend vocabulary — manteion-go internal/model/enums.go PhaseStatusValues. */
const BACKEND_PHASE_STATUSES = [
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "skipped",
] as const;

describe("phase schemas ↔ manteion-go wire shapes", () => {
  it.each(BACKEND_PHASE_STATUSES)("PhaseStatusSchema accepts %j", (status) => {
    expect(PhaseStatusSchema.parse(status)).toBe(status);
  });

  it("PhaseNameSchema accepts free-form names (experiment_phases.name is UNIQUE text, not an enum)", () => {
    expect(PhaseNameSchema.parse("isolation-productcatalog")).toBe("isolation-productcatalog");
  });

  it("PhaseSummarySchema parses the phaseDetail payload served by GET …/phases/{phaseId}", () => {
    const p = PhaseSummarySchema.parse({
      id: "ph-2",
      experiment_id: "exp-1",
      name: "isolation-productcatalog",
      position: 1,
      status: "paused",
      frozen_services: [
        {
          service: "productcatalog",
          mode: "replay",
          workflow_scope: "",
          key_strategy: "exact",
          mutation_policy: "deny",
        },
      ],
      persist_cache: false,
      started_at: "2026-06-01T00:00:00Z",
      workflows: [],
      rule_ids: [],
    });
    expect(p.id).toBe("ph-2");
    expect(p.status).toBe("paused");
    expect(p.frozen_services).toEqual([
      expect.objectContaining({ service: "productcatalog", mode: "replay" }),
    ]);
  });
});

describe("experimentsApi.getPhaseStatus", () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it("fetches the phase by id — GET /api/v1/experiments/{id}/phases/{phaseId}", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      id: "ph-2",
      name: "baseline",
      status: "skipped",
    });
    await experimentsApi.getPhaseStatus("exp-1", "ph-2");
    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/v1/experiments/exp-1/phases/ph-2",
      expect.anything(),
    );
  });

  it("URL-encodes both ids", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ id: "p/2", name: "x", status: "pending" });
    await experimentsApi.getPhaseStatus("e 1", "p/2");
    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/v1/experiments/e%201/phases/p%2F2",
      expect.anything(),
    );
  });
});
