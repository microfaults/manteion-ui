import { type MatchNode, type Rule, RuleSchema } from "@/types/api";
import { z } from "zod";
import { apiClient } from "./client";

// ─── Mock data (used when VITE_USE_MOCK=true) ─────────────────────────────────

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

let _mockRules: Rule[] = [
  {
    id: "rule-001",
    name: "freeze-productcatalog",
    service: "productcatalog",
    enabled: true,
    priority: 100,
    mode: "inline",
    fault_spec_id: "inline:hang 5s",
    created_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
    match: {
      labels: { _target: "inline", "atropos.workflow": "browse", tenant: "demo" },
    },
  },
  {
    id: "rule-002",
    name: "cart-ingress-500",
    service: "cartservice",
    enabled: true,
    priority: 90,
    mode: "inline",
    fault_spec_id: "inline:http-error",
    created_at: "2026-04-02T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
    match: { injection_point: "ingress", labels: { _target: "inline" } },
  },
  {
    id: "rule-003",
    name: "checkout-latency-p50",
    service: "checkoutservice",
    enabled: true,
    priority: 80,
    mode: "inline",
    fault_spec_id: "inline:latency 120ms",
    created_at: "2026-04-03T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
    match: { labels: { _target: "inline" } },
  },
  {
    id: "rule-004",
    name: "payment-latency-100ms",
    service: "paymentservice",
    enabled: true,
    priority: 70,
    mode: "inline",
    fault_spec_id: "inline:latency 100ms",
    created_at: "2026-04-04T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
    match: { labels: { _target: "inline" } },
  },
  {
    id: "rule-005",
    name: "shipping-cpu-stress",
    service: "shippingservice",
    enabled: true,
    priority: 60,
    mode: "background",
    fault_spec_id: "resource:cpu 80%",
    created_at: "2026-04-05T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
    match: { labels: { _target: "resource" } },
  },
  {
    id: "rule-006",
    name: "currency-ingress-rst",
    service: "currencyservice",
    enabled: false,
    priority: 50,
    mode: "inline",
    fault_spec_id: "network:RST toxic",
    created_at: "2026-04-06T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
    match: { injection_point: "ingress", labels: { _target: "network" } },
  },
  {
    id: "rule-007",
    name: "email-hang",
    service: "emailservice",
    enabled: false,
    priority: 40,
    mode: "inline",
    fault_spec_id: "inline:hang 30s",
    created_at: "2026-04-07T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
    match: { labels: { _target: "inline" } },
  },
  {
    id: "rule-008",
    name: "ad-blackhole",
    service: "adservice",
    enabled: false,
    priority: 30,
    mode: "inline",
    fault_spec_id: "network:blackhole",
    created_at: "2026-04-08T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
    match: { labels: { _target: "network" } },
  },
];

function mockDelay() {
  return new Promise((r) => setTimeout(r, 80));
}

const RulesList = z.array(RuleSchema);

export async function listRules(): Promise<Rule[]> {
  if (USE_MOCK) {
    await mockDelay();
    return [..._mockRules];
  }
  return apiClient.get("/api/v1/rules", RulesList);
}

export async function getRule(id: string): Promise<Rule> {
  if (USE_MOCK) {
    await mockDelay();
    const rule = _mockRules.find((r) => r.id === id);
    if (!rule) throw new Error(`Mock: rule ${id} not found`);
    return { ...rule };
  }
  return apiClient.get(`/api/v1/rules/${encodeURIComponent(id)}`, RuleSchema);
}

export interface RuleInput {
  name: string;
  service: string;
  enabled: boolean;
  priority: number;
  match_ast?: MatchNode;
  match_expr?: string;
  match?: { injection_point?: string; labels?: Record<string, string> };
  fault_spec_id?: string;
  fault_composition_id?: string;
  mode: "inline" | "background";
}

export async function createRule(input: RuleInput): Promise<Rule> {
  if (USE_MOCK) {
    await mockDelay();
    const rule: Rule = {
      id: `rule-${Date.now()}`,
      name: input.name,
      service: input.service,
      enabled: input.enabled,
      priority: input.priority,
      mode: input.mode,
      fault_spec_id: input.fault_spec_id,
      fault_composition_id: input.fault_composition_id,
      match_ast: input.match_ast,
      match_expr: input.match_expr,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    _mockRules = [..._mockRules, rule];
    return rule;
  }
  return apiClient.post("/api/v1/rules", input, RuleSchema);
}

export async function updateRule(id: string, input: RuleInput): Promise<Rule> {
  if (USE_MOCK) {
    await mockDelay();
    const existing = _mockRules.find((r) => r.id === id);
    if (!existing) throw new Error(`Mock: rule ${id} not found`);
    const updated: Rule = {
      ...existing,
      name: input.name,
      service: input.service,
      enabled: input.enabled,
      priority: input.priority,
      mode: input.mode,
      fault_spec_id: input.fault_spec_id,
      fault_composition_id: input.fault_composition_id,
      match_ast: input.match_ast,
      match_expr: input.match_expr,
      updated_at: new Date().toISOString(),
    };
    _mockRules = _mockRules.map((r) => (r.id === id ? updated : r));
    return updated;
  }
  return apiClient.put(`/api/v1/rules/${encodeURIComponent(id)}`, input, RuleSchema);
}

export async function deleteRule(id: string): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    _mockRules = _mockRules.filter((r) => r.id !== id);
    return;
  }
  await apiClient.del(`/api/v1/rules/${encodeURIComponent(id)}`);
}
