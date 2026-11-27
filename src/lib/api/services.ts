import {
  type KillSwitchResult,
  KillSwitchResultSchema,
  type SDKInstance,
  type SDKInstanceDetail,
  SDKInstanceDetailSchema,
  SDKInstanceSchema,
} from "@/types/api";
import { z } from "zod";
import { apiClient } from "./client";
import { mockActiveRuleIds, mockDisableServiceRules } from "./rules";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const List = z.array(SDKInstanceSchema);

// ─── Mock fixtures (VITE_USE_MOCK=true) ────────────────────────────────
// Instances report the enabled rules of their service in rules.ts, so the
// detail panel's active-rules list resolves names from the shared ["rules"] query.

/** A fixture instance carries ages, not timestamps. They are stamped on every
 *  read, so an "alive" instance always polled a moment ago however long the
 *  tab has been open, and a "dead" one stays minutes behind. */
type MockInstance = Omit<SDKInstance, "registered_at" | "last_poll_at"> & {
  registeredAgoSec: number;
  lastPollAgoSec: number;
};

const HOUR_SEC = 3600;

const agoSec = (sec: number): string =>
  new Date(Date.now() - sec * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

function stamp({ registeredAgoSec, lastPollAgoSec, ...rest }: MockInstance): SDKInstance {
  return { ...rest, registered_at: agoSec(registeredAgoSec), last_poll_at: agoSec(lastPollAgoSec) };
}

/** Every service of the bed embeds atropos, so each of the eleven in
 *  REAL_SERVICES registers at least one instance, and all instances of one
 *  service share a status: the Dashboard tile (best instance) and the
 *  Services card (worst instance) then agree. fixture-consistency.test.ts
 *  fails when this drifts from the other fixtures. */
const _mockInstances: MockInstance[] = [
  {
    id: "prod-cat-sdk-a1b2c",
    service: "productcatalogservice",
    version: "v0.4.2",
    address: "10.0.0.12:50051",
    registeredAgoSec: 26 * HOUR_SEC,
    lastPollAgoSec: 2,
    status: "alive",
  },
  {
    id: "prod-cat-sdk-d3e4f",
    service: "productcatalogservice",
    version: "v0.4.1",
    address: "10.0.0.13:50051",
    registeredAgoSec: 26 * HOUR_SEC,
    lastPollAgoSec: 4,
    status: "alive",
  },
  {
    id: "checkout-sdk-g5h6i",
    service: "checkoutservice",
    version: "v0.4.2",
    address: "10.0.0.21:50051",
    registeredAgoSec: 26 * HOUR_SEC,
    lastPollAgoSec: 1,
    status: "alive",
  },
  {
    id: "cart-sdk-j7k8l",
    service: "cartservice",
    version: "v0.4.0",
    address: "10.0.0.31:50051",
    registeredAgoSec: 45 * HOUR_SEC,
    lastPollAgoSec: 6 * 60,
    status: "dead",
  },
  {
    id: "payment-sdk-m9n0o",
    service: "paymentservice",
    version: "v0.4.2",
    address: "10.0.0.41:50051",
    registeredAgoSec: 26 * HOUR_SEC,
    lastPollAgoSec: 38,
    status: "stale",
  },
  {
    id: "recommendation-sdk-p1q2r",
    service: "recommendationservice",
    version: "v0.4.2",
    address: "10.0.0.51:50051",
    registeredAgoSec: 26 * HOUR_SEC,
    lastPollAgoSec: 3,
    status: "alive",
  },
  {
    id: "ad-sdk-s3t4u",
    service: "adservice",
    version: "v0.4.2",
    address: "10.0.0.61:50051",
    registeredAgoSec: 26 * HOUR_SEC,
    lastPollAgoSec: 2,
    status: "alive",
  },
  {
    id: "currency-sdk-v5w6x",
    service: "currencyservice",
    version: "v0.4.2",
    address: "10.0.0.71:50051",
    registeredAgoSec: 26 * HOUR_SEC,
    lastPollAgoSec: 1,
    status: "alive",
  },
  {
    id: "email-sdk-y7z8a",
    service: "emailservice",
    version: "v0.4.2",
    address: "10.0.0.81:50051",
    registeredAgoSec: 26 * HOUR_SEC,
    lastPollAgoSec: 5,
    status: "alive",
  },
  {
    id: "frontend-sdk-b9c0d",
    service: "frontend",
    version: "v0.4.2",
    address: "10.0.0.11:50051",
    registeredAgoSec: 26 * HOUR_SEC,
    lastPollAgoSec: 1,
    status: "alive",
  },
  {
    id: "shipping-sdk-e1f2g",
    service: "shippingservice",
    version: "v0.4.2",
    address: "10.0.0.91:50051",
    registeredAgoSec: 26 * HOUR_SEC,
    lastPollAgoSec: 3,
    status: "alive",
  },
  {
    id: "assistant-sdk-h3i4j",
    service: "shoppingassistantservice",
    version: "v0.4.2",
    address: "10.0.0.101:50051",
    registeredAgoSec: 26 * HOUR_SEC,
    lastPollAgoSec: 4,
    status: "alive",
  },
];

/** Per-instance detail the list does not carry. `active_rule_ids` is not
 *  stored: it is derived from the mock rule store on every read, so the kill
 *  switch's count and effect agree with what the panel lists. Recent phase
 *  ids are phases of the experiment fixtures, so each link resolves. */
const _mockDetail: Record<
  string,
  Omit<SDKInstanceDetail, keyof SDKInstance | "active_rule_ids">
> = {
  "prod-cat-sdk-a1b2c": {
    observed_generation: 42,
    applied_generation: 42,
    recent_run_ids: ["ph-001-isolation", "ph-001-baseline", "ph-004-blackhole"],
  },
  "prod-cat-sdk-d3e4f": {
    observed_generation: 42,
    applied_generation: 42,
    recent_run_ids: ["ph-001-baseline", "ph-004-baseline"],
  },
  "checkout-sdk-g5h6i": {
    observed_generation: 42,
    applied_generation: 42,
    recent_run_ids: ["ph-001-isolation", "ph-001-baseline"],
  },
  "cart-sdk-j7k8l": {
    observed_generation: 40,
    applied_generation: 39,
    observed_errors: ['fault spec "fs-cart-latency": unknown fault type "slowloris"'],
    recent_run_ids: ["ph-002-replay", "ph-002-baseline"],
  },
  "payment-sdk-m9n0o": {
    observed_generation: 42,
    applied_generation: 42,
    recent_run_ids: ["ph-001-baseline"],
  },
  "recommendation-sdk-p1q2r": {
    observed_generation: 42,
    applied_generation: 42,
    recent_run_ids: ["ph-004-blackhole", "ph-004-baseline"],
  },
  "ad-sdk-s3t4u": {
    observed_generation: 42,
    applied_generation: 42,
    recent_run_ids: ["ph-004-blackhole", "ph-004-baseline"],
  },
  "currency-sdk-v5w6x": {
    observed_generation: 42,
    applied_generation: 42,
    recent_run_ids: ["ph-001-isolation", "ph-001-baseline"],
  },
  "email-sdk-y7z8a": {
    observed_generation: 42,
    applied_generation: 42,
    recent_run_ids: ["ph-001-isolation", "ph-001-baseline"],
  },
  "frontend-sdk-b9c0d": {
    observed_generation: 42,
    applied_generation: 42,
    recent_run_ids: ["ph-001-isolation", "ph-001-baseline", "ph-004-blackhole"],
  },
  "shipping-sdk-e1f2g": {
    observed_generation: 42,
    applied_generation: 42,
    recent_run_ids: ["ph-001-isolation", "ph-001-baseline"],
  },
  "assistant-sdk-h3i4j": {
    observed_generation: 42,
    applied_generation: 42,
    recent_run_ids: [],
  },
};

/** Mock-only: GET /api/v1/sdk/instances/{id} served from the fixtures. */
export function mockSDKInstanceDetail(id: string): SDKInstanceDetail {
  const inst = _mockInstances.find((i) => i.id === id);
  if (!inst) throw new Error(`Mock: instance ${id} not found`);
  const extra = _mockDetail[id] ?? { recent_run_ids: [] };
  return {
    ...stamp(inst),
    ...extra,
    recent_run_ids: [...extra.recent_run_ids],
    active_rule_ids: mockActiveRuleIds(inst.service),
  };
}

/** Mock-only: the instance list as GET /api/v1/sdk/instances serves it. */
export function mockSDKInstances(): SDKInstance[] {
  return _mockInstances.map(stamp);
}

/** Mock-only: the kill switch disables every enabled rule of the instance's
 *  service in the mock rule store, as the backend does for the whole service. */
export function mockKillSwitch(id: string): KillSwitchResult {
  const inst = _mockInstances.find((i) => i.id === id);
  if (!inst) throw new Error(`Mock: instance ${id} not found`);
  return { disabled_rule_ids: mockDisableServiceRules(inst.service), at: new Date().toISOString() };
}

function mockDelay() {
  return new Promise((r) => setTimeout(r, 80));
}

export async function listSDKInstances(): Promise<SDKInstance[]> {
  if (USE_MOCK) {
    await mockDelay();
    return mockSDKInstances();
  }
  return apiClient.get("/api/v1/sdk/instances", List);
}

/** GET /api/v1/sdk/instances/{id} — instance + active_rule_ids + recent phase
 *  ids (manteion-go MR !29; older builds 404 → the panel says so). */
export async function getSDKInstance(id: string): Promise<SDKInstanceDetail> {
  if (USE_MOCK) {
    await mockDelay();
    return mockSDKInstanceDetail(id);
  }
  return apiClient.get(`/api/v1/sdk/instances/${encodeURIComponent(id)}`, SDKInstanceDetailSchema);
}

/** POST /api/v1/sdk/instances/{id}/kill-switch — disables every rule for the
 *  instance's service and cancels that service's active fault configs. */
export async function killSwitch(id: string): Promise<KillSwitchResult> {
  if (USE_MOCK) {
    await mockDelay();
    return mockKillSwitch(id);
  }
  return apiClient.post(
    `/api/v1/sdk/instances/${encodeURIComponent(id)}/kill-switch`,
    {},
    KillSwitchResultSchema,
  );
}
