import {
  KillSwitchResultSchema,
  type KillSwitchResult,
  type SDKInstance,
  type SDKInstanceDetail,
  SDKInstanceDetailSchema,
  SDKInstanceSchema,
} from "@/types/api";
import { z } from "zod";
import { apiClient } from "./client";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const List = z.array(SDKInstanceSchema);

// ─── Mock fixtures (VITE_USE_MOCK=true) ────────────────────────────────
// Instance IDs reference rule IDs from rules.ts so the detail panel's
// active-rules list resolves names from the shared ["rules"] query.

const _mockInstances: SDKInstance[] = [
  {
    id: "prod-cat-sdk-a1b2c",
    service: "productcatalog",
    version: "v0.4.2",
    address: "10.0.0.12:50051",
    registered_at: "2026-05-22T09:14:00Z",
    last_poll_at: "2026-05-23T11:59:58Z",
    status: "alive",
  },
  {
    id: "prod-cat-sdk-d3e4f",
    service: "productcatalog",
    version: "v0.4.1",
    address: "10.0.0.13:50051",
    registered_at: "2026-05-22T09:15:00Z",
    last_poll_at: "2026-05-23T11:59:13Z",
    status: "stale",
  },
  {
    id: "checkout-sdk-g5h6i",
    service: "checkoutservice",
    version: "v0.4.2",
    address: "10.0.0.21:50051",
    registered_at: "2026-05-22T09:10:00Z",
    last_poll_at: "2026-05-23T11:59:59Z",
    status: "alive",
  },
  {
    id: "cart-sdk-j7k8l",
    service: "cartservice",
    version: "v0.4.0",
    address: "10.0.0.31:50051",
    registered_at: "2026-05-21T14:22:00Z",
    last_poll_at: "2026-05-23T11:55:00Z",
    status: "dead",
  },
  {
    id: "payment-sdk-m9n0o",
    service: "paymentservice",
    version: "v0.4.2",
    address: "10.0.0.41:50051",
    registered_at: "2026-05-22T09:12:00Z",
    last_poll_at: "2026-05-23T11:59:57Z",
    status: "alive",
  },
];

const _mockDetail: Record<string, Omit<SDKInstanceDetail, keyof SDKInstance>> = {
  "prod-cat-sdk-a1b2c": {
    last_rule_version_acked: 42,
    active_rule_ids: ["rule-001"],
    recent_run_ids: ["run-8f2a", "run-7c1b", "run-6d0e"],
  },
  "prod-cat-sdk-d3e4f": {
    last_rule_version_acked: 41,
    active_rule_ids: ["rule-001", "rule-009"],
    recent_run_ids: ["run-8f2a", "run-7c1b"],
  },
  "checkout-sdk-g5h6i": {
    last_rule_version_acked: 42,
    active_rule_ids: ["rule-003"],
    recent_run_ids: ["run-8f2a"],
  },
  "cart-sdk-j7k8l": {
    last_error: "context deadline exceeded polling /api/v1/sdk/rules",
    last_rule_version_acked: 39,
    active_rule_ids: ["rule-002"],
    recent_run_ids: ["run-5a9c"],
  },
  "payment-sdk-m9n0o": {
    last_rule_version_acked: 42,
    active_rule_ids: ["rule-004"],
    recent_run_ids: ["run-8f2a", "run-7c1b"],
  },
};

function mockDelay() {
  return new Promise((r) => setTimeout(r, 80));
}

export async function listSDKInstances(): Promise<SDKInstance[]> {
  if (USE_MOCK) {
    await mockDelay();
    return [..._mockInstances];
  }
  return apiClient.get("/api/v1/sdk/instances", List);
}

/** NEW endpoint — instance detail with active rules, recent runs, ack lag.
 *  See docs/api/api-needed.md §B.2. */
export async function getSDKInstance(id: string): Promise<SDKInstanceDetail> {
  if (USE_MOCK) {
    await mockDelay();
    const inst = _mockInstances.find((i) => i.id === id);
    if (!inst) throw new Error(`Mock: instance ${id} not found`);
    const extra = _mockDetail[id] ?? { active_rule_ids: [], recent_run_ids: [] };
    return { ...inst, ...extra };
  }
  return apiClient.get(
    `/api/v1/sdk/instances/${encodeURIComponent(id)}`,
    SDKInstanceDetailSchema,
  );
}

/** NEW endpoint — disable all active rules attached to this instance. */
export async function killSwitch(id: string): Promise<KillSwitchResult> {
  if (USE_MOCK) {
    await mockDelay();
    const disabled = _mockDetail[id]?.active_rule_ids ?? [];
    return { disabled_rule_ids: [...disabled], at: new Date().toISOString() };
  }
  return apiClient.post(
    `/api/v1/sdk/instances/${encodeURIComponent(id)}/kill-switch`,
    {},
    KillSwitchResultSchema,
  );
}
