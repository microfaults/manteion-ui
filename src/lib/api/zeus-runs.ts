/**
 * Zeus k6 workflow runs, read through manteion's proxy (`/api/v1/zeus/runs/…`).
 *
 * Address runs ONLY by the `zeus_run_id` stamped on a phase workflow — the
 * list route's `?experiment_id=` filter needs manteion-go B1 deployed, and
 * zeus keeps runs in memory, so a run can 404 after a zeus restart.
 */
import { type ZeusRun, ZeusRunSchema, type ZeusRunStats, ZeusRunStatsSchema } from "@/types/api";
import { apiClient } from "./client";
import * as mock from "./mock-experiments";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

function mockDelay() {
  return new Promise((r) => setTimeout(r, 80));
}

const BASE = "/api/v1/zeus/runs";
const enc = encodeURIComponent;

export async function getRun(runId: string): Promise<ZeusRun> {
  if (USE_MOCK) {
    await mockDelay();
    return mock.mockZeusRun(runId);
  }
  return apiClient.get(`${BASE}/${enc(runId)}`, ZeusRunSchema);
}

/** Finalized run stats in µs/ms, or `undefined` while zeus still answers the
 *  "no stats available yet" placeholder. */
export async function getRunStats(runId: string): Promise<ZeusRunStats | undefined> {
  if (USE_MOCK) {
    await mockDelay();
    return mock.mockZeusRunStats(runId);
  }
  return apiClient.get(`${BASE}/${enc(runId)}/stats`, ZeusRunStatsSchema);
}
