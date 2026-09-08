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
import * as zeusRunsApi from "@/lib/api/zeus-runs";
import type { z } from "zod";

/** Answer the next GET with `payload` parsed through the schema the client was handed. */
const answer = (payload: unknown) =>
  vi
    .mocked(apiClient.get)
    .mockImplementationOnce(async (_path: string, schema: z.ZodTypeAny) => schema.parse(payload));

describe("zeusRunsApi", () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it("getRun reads the proxied run by id", async () => {
    answer({ id: "run/1", status: "running" });
    const run = await zeusRunsApi.getRun("run/1");
    expect(apiClient.get).toHaveBeenLastCalledWith("/api/v1/zeus/runs/run%2F1", expect.anything());
    expect(run.status).toBe("running");
  });

  it("getRunStats converts ns → µs and returns undefined for the in-flight placeholder", async () => {
    answer({ run_id: "run-1", status: "no stats available yet" });
    expect(await zeusRunsApi.getRunStats("run-1")).toBeUndefined();
    expect(apiClient.get).toHaveBeenLastCalledWith(
      "/api/v1/zeus/runs/run-1/stats",
      expect.anything(),
    );
    answer({
      run_id: "run-1",
      status: "completed",
      duration: 60_000_000_000,
      iterations: 12,
      requests_sent: 600,
      requests_ok: 600,
      requests_dropped: 0,
      latency_p50: 5_000_000,
      latency_p95: 9_000_000,
      latency_p99: 12_000_000,
    });
    const stats = await zeusRunsApi.getRunStats("run-1");
    expect(stats).toMatchObject({
      duration_ms: 60_000,
      latency_p99_us: 12_000,
      requests_sent: 600,
    });
  });
});
