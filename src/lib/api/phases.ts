/**
 * Phases — the logical unit of operation — via the flat manteion-go routes:
 *   GET  /api/v1/phases                 page envelope of PhaseListItem
 *   GET  /api/v1/phases/{id}            PhaseDetail (totals + workflow_results)
 *   GET  /api/v1/phases/{id}/faults     frozen services, phase rules, fault events
 *   POST /api/v1/phases/{id}/pause|resume|stop[?status=]
 * The list route has no server-side filters (it only paginates), so
 * experiment/status filters are applied here after walking every page.
 */
import {
  PageEnvelope,
  type PhaseDetail,
  PhaseDetailSchema,
  type PhaseFaults,
  PhaseFaultsSchema,
  type PhaseListItem,
  PhaseListItemSchema,
  type PhaseStatus,
} from "@/types/api";
import { z } from "zod";
import { apiClient } from "./client";
import * as mock from "./mock-experiments";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

function mockDelay() {
  return new Promise((r) => setTimeout(r, 80));
}

const PhasePage = PageEnvelope(PhaseListItemSchema);
const StatusReply = z.object({ status: z.string() });
const Empty = z.unknown();
/** Server cap (ListPhasesPaged). */
const PAGE = 200;

const BASE = "/api/v1/phases";
const enc = encodeURIComponent;

export interface ListPhasesFilter {
  experimentId?: string;
  status?: PhaseStatus;
}

/** Every phase across experiments, newest experiments' phases included.
 *  Walks all pages (advancing by rows received, so a server that caps
 *  `limit` lower than asked still terminates). */
export async function listPhases(filter: ListPhasesFilter = {}): Promise<PhaseListItem[]> {
  let items: PhaseListItem[];
  if (USE_MOCK) {
    await mockDelay();
    items = mock.mockListPhases();
  } else {
    items = [];
    for (;;) {
      const page = await apiClient.get(`${BASE}?limit=${PAGE}&offset=${items.length}`, PhasePage);
      items.push(...page.data);
      if (page.data.length === 0 || items.length >= page.page.total) break;
    }
  }
  return items.filter(
    (p) =>
      (!filter.experimentId || p.experiment_id === filter.experimentId) &&
      (!filter.status || p.status === filter.status),
  );
}

export async function getPhaseDetail(phaseId: string): Promise<PhaseDetail> {
  if (USE_MOCK) {
    await mockDelay();
    return mock.mockPhaseDetail(phaseId);
  }
  return apiClient.get(`${BASE}/${enc(phaseId)}`, PhaseDetailSchema);
}

export async function getPhaseFaults(phaseId: string): Promise<PhaseFaults> {
  if (USE_MOCK) {
    await mockDelay();
    return mock.mockPhaseFaults(phaseId);
  }
  return apiClient.get(`${BASE}/${enc(phaseId)}/faults`, PhaseFaultsSchema);
}

export async function pausePhase(phaseId: string): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    mock.mockPausePhase(phaseId);
    return;
  }
  await apiClient.post(`${BASE}/${enc(phaseId)}/pause`, undefined, StatusReply);
}

export async function resumePhase(phaseId: string): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    mock.mockResumePhase(phaseId);
    return;
  }
  await apiClient.post(`${BASE}/${enc(phaseId)}/resume`, undefined, StatusReply);
}

export type PhaseFinalStatus = "completed" | "failed" | "skipped";

/** `?status=` defaults to `completed` server-side. */
export async function stopPhase(phaseId: string, status?: PhaseFinalStatus): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    mock.mockStopPhase(phaseId, status);
    return;
  }
  const path = `${BASE}/${enc(phaseId)}/stop${status ? `?status=${enc(status)}` : ""}`;
  await apiClient.post(path, undefined, Empty);
}
