/**
 * Demo fixtures for VITE_USE_MOCK=true — the experiments, workflows and
 * API-catalog data the other api/ modules don't carry inline.
 *
 * Everything here is deliberately coherent with the fixtures in rules.ts,
 * services.ts and faults.ts: the same nine online-boutique services, the same
 * rule ids (rule-001…) and fault-spec ids (spec-inline-hang-5s…), so panels
 * that cross-reference by id resolve names instead of showing raw ids.
 *
 * Timestamps are minted relative to load time so a demo session always reads
 * as "2m ago" rather than a frozen date.
 */
import type { Workflow, WorkflowSummary } from "@/lib/workflow-types";
import type { CatalogEndpoint, Experiment, PhaseSummary } from "@/types/api";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** ISO timestamp `ms` milliseconds before now. */
export const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

// ─── Workflows ─────────────────────────────────────────────────────────

const CHECKOUT_ROOT: Workflow["root"] = {
  type: "sequence",
  id: "root",
  label: "checkout-burst",
  children: [
    { type: "request", id: "r-checkout-0", method: "GET", path: "/products" },
    { type: "delay", id: "d-checkout-1", label: "think", minMs: 300, maxMs: 900 },
    {
      type: "parallel",
      id: "p-checkout-2",
      waitPolicy: "all",
      children: [
        { type: "request", id: "r-checkout-2-0", method: "POST", path: "/cart" },
        { type: "request", id: "r-checkout-2-1", method: "GET", path: "/currency/convert" },
      ],
    },
    { type: "request", id: "r-checkout-3", method: "POST", path: "/cart/checkout" },
    {
      type: "optional",
      id: "o-checkout-4",
      probability: 0.35,
      child: { type: "request", id: "r-checkout-4", method: "POST", path: "/email/confirm" },
    },
  ],
};

const BROWSE_ROOT: Workflow["root"] = {
  type: "sequence",
  id: "root",
  label: "browse-catalog",
  children: [
    { type: "request", id: "r-browse-0", method: "GET", path: "/products" },
    { type: "delay", id: "d-browse-1", label: "think", minMs: 500, maxMs: 1500 },
    { type: "request", id: "r-browse-2", method: "GET", path: "/products/{id}" },
    {
      type: "optional",
      id: "o-browse-3",
      probability: 0.6,
      child: { type: "request", id: "r-browse-3", method: "GET", path: "/ads" },
    },
  ],
};

const ABANDON_ROOT: Workflow["root"] = {
  type: "sequence",
  id: "root",
  label: "cart-abandon",
  children: [
    { type: "request", id: "r-abandon-0", method: "GET", path: "/products" },
    { type: "request", id: "r-abandon-1", method: "POST", path: "/cart" },
    { type: "delay", id: "d-abandon-2", label: "abandon", minMs: 2000, maxMs: 5000 },
  ],
};

export const mockWorkflows: Workflow[] = [
  {
    id: "wf-checkout-burst",
    name: "checkout-burst",
    version: "v2",
    targets: ["frontend", "productcatalog", "cartservice", "checkoutservice", "currencyservice"],
    estRpsPerVu: 4.2,
    updatedAt: ago(35 * MINUTE),
    description: "Hammer the checkout path end to end.",
    requestNodeCount: 5,
    root: CHECKOUT_ROOT,
  },
  {
    id: "wf-browse-catalog",
    name: "browse-catalog",
    version: "v2",
    targets: ["frontend", "productcatalog", "adservice"],
    estRpsPerVu: 6.8,
    updatedAt: ago(3 * HOUR),
    description: "Read-heavy catalog browsing with ad impressions.",
    requestNodeCount: 3,
    root: BROWSE_ROOT,
  },
  {
    id: "wf-cart-abandon",
    name: "cart-abandon",
    version: "v2",
    targets: ["frontend", "productcatalog", "cartservice"],
    estRpsPerVu: 2.1,
    updatedAt: ago(26 * HOUR),
    description: "Add to cart, then walk away — exercises cart TTL.",
    requestNodeCount: 2,
    root: ABANDON_ROOT,
  },
];

export const workflowSummary = (w: Workflow): WorkflowSummary => {
  const { root: _root, ...summary } = w;
  return summary;
};

// ─── Experiments ───────────────────────────────────────────────────────

function phase(
  p: Partial<PhaseSummary> & Pick<PhaseSummary, "id" | "name" | "status">,
): PhaseSummary {
  return {
    workflows: [],
    frozen_services: [],
    applied_rules: [],
    ...p,
  };
}

export const mockExperiments: Experiment[] = [
  {
    id: "exp-001",
    name: "checkout-p99-isolation",
    description: "Isolate which downstream dominates checkout tail latency.",
    hypothesis: "productcatalog hang drives >60% of checkout p99.",
    status: "running",
    targeted_services: ["productcatalog", "checkoutservice", "cartservice"],
    created_by: "pmundra",
    created_at: ago(2 * HOUR),
    started_at: ago(38 * MINUTE),
    phases: [
      phase({
        id: "ph-001-baseline",
        name: "baseline",
        status: "completed",
        workflows: [{ workflow_id: "wf-checkout-burst", vus: 25, duration_sec: 300 }],
        vus: 25,
        duration_ms: 300_000,
        started_at: ago(38 * MINUTE),
        completed_at: ago(33 * MINUTE),
        metrics: { p50_us: 18_400, p95_us: 42_100, p99_us: 61_200, rps: 104.6, error_rate: 0.0021 },
      }),
      phase({
        id: "ph-001-isolation",
        name: "isolation-productcatalog",
        status: "running",
        workflows: [{ workflow_id: "wf-checkout-burst", vus: 25, duration_sec: 300 }],
        vus: 25,
        started_at: ago(4 * MINUTE),
        frozen_services: [{ service: "cartservice", mode: "replay" }],
        applied_rules: [
          {
            rule_id: "rule-001",
            name: "freeze-productcatalog",
            target_summary: "inline · hang 5s",
          },
        ],
        metrics: {
          p50_us: 21_900,
          p95_us: 88_400,
          p99_us: 148_700,
          rps: 96.2,
          error_rate: 0.0164,
          baseline_p99_us: 61_200,
        },
      }),
      phase({
        id: "ph-001-combined",
        name: "combined",
        status: "pending",
        workflows: [{ workflow_id: "wf-checkout-burst", vus: 25, duration_sec: 300 }],
        applied_rules: [
          {
            rule_id: "rule-001",
            name: "freeze-productcatalog",
            target_summary: "inline · hang 5s",
          },
          { rule_id: "rule-003", name: "checkout-latency-p50", target_summary: "inline · latency" },
        ],
      }),
    ],
  },
  {
    id: "exp-002",
    name: "cart-replay-freeze",
    description: "Serve cartservice from the cache box and measure drift.",
    status: "completed",
    targeted_services: ["cartservice"],
    created_by: "pmundra",
    created_at: ago(30 * HOUR),
    started_at: ago(28 * HOUR),
    completed_at: ago(27 * HOUR),
    phases: [
      phase({
        id: "ph-002-baseline",
        name: "baseline",
        status: "completed",
        workflows: [{ workflow_id: "wf-cart-abandon", vus: 10, duration_sec: 600 }],
        duration_ms: 600_000,
        started_at: ago(28 * HOUR),
        completed_at: ago(27.8 * HOUR),
        metrics: { p99_us: 24_800, rps: 21.4, error_rate: 0.0 },
      }),
      phase({
        id: "ph-002-replay",
        name: "isolation-cartservice",
        status: "completed",
        workflows: [{ workflow_id: "wf-cart-abandon", vus: 10, duration_sec: 600 }],
        duration_ms: 600_000,
        started_at: ago(27.7 * HOUR),
        completed_at: ago(27 * HOUR),
        frozen_services: [{ service: "cartservice", mode: "replay" }],
        applied_rules: [
          { rule_id: "rule-009", name: "freeze-cart-replay", target_summary: "cachebox · replay" },
        ],
        metrics: { p99_us: 9_100, rps: 22.0, error_rate: 0.0, baseline_p99_us: 24_800 },
      }),
    ],
  },
  {
    id: "exp-003",
    name: "payment-latency-sweep",
    description: "Ramp injected payment latency 50→400ms.",
    status: "planned",
    targeted_services: ["paymentservice", "checkoutservice"],
    created_by: "pmundra",
    created_at: ago(20 * MINUTE),
    phases: [
      phase({
        id: "ph-003-baseline",
        name: "baseline",
        status: "pending",
        workflows: [{ workflow_id: "wf-checkout-burst", vus: 40, duration_sec: 240 }],
      }),
      phase({
        id: "ph-003-100",
        name: "isolation-payment-100ms",
        status: "pending",
        workflows: [{ workflow_id: "wf-checkout-burst", vus: 40, duration_sec: 240 }],
        applied_rules: [
          { rule_id: "rule-004", name: "payment-latency-100ms", target_summary: "inline · 100ms" },
        ],
      }),
      phase({
        id: "ph-003-400",
        name: "isolation-payment-400ms",
        status: "pending",
        workflows: [{ workflow_id: "wf-checkout-burst", vus: 40, duration_sec: 240 }],
      }),
    ],
  },
  {
    id: "exp-004",
    name: "ad-blackhole-blast",
    description: "Blackhole adservice under browse load.",
    status: "failed",
    targeted_services: ["adservice", "productcatalog"],
    created_by: "nathan",
    created_at: ago(5 * HOUR),
    started_at: ago(4.5 * HOUR),
    completed_at: ago(4.2 * HOUR),
    phases: [
      phase({
        id: "ph-004-baseline",
        name: "baseline",
        status: "completed",
        workflows: [{ workflow_id: "wf-browse-catalog", vus: 15, duration_sec: 180 }],
        duration_ms: 180_000,
        started_at: ago(4.5 * HOUR),
        completed_at: ago(4.4 * HOUR),
        metrics: { p99_us: 31_500, rps: 88.1, error_rate: 0.0009 },
      }),
      phase({
        id: "ph-004-blackhole",
        name: "isolation-adservice",
        status: "failed",
        workflows: [{ workflow_id: "wf-browse-catalog", vus: 15, duration_sec: 180 }],
        started_at: ago(4.35 * HOUR),
        completed_at: ago(4.2 * HOUR),
        applied_rules: [
          { rule_id: "rule-008", name: "ad-blackhole", target_summary: "network · blackhole" },
        ],
        metrics: {
          p99_us: 512_000,
          rps: 12.4,
          error_rate: 0.418,
          baseline_p99_us: 31_500,
        },
      }),
      phase({ id: "ph-004-combined", name: "combined", status: "skipped" }),
    ],
  },
];

// ─── API catalog (workflow builder picker) ─────────────────────────────
// `depends_on` drives the picker's dependency auto-expansion: picking
// /cart/checkout also pulls in /products and /cart, prerequisites first.

export const mockCatalogEndpoints: CatalogEndpoint[] = [
  {
    id: "get-products",
    service: "productcatalog",
    method: "GET",
    path: "/products",
    description: "List catalog",
    depends_on: [],
  },
  {
    id: "get-product",
    service: "productcatalog",
    method: "GET",
    path: "/products/{id}",
    description: "Product detail",
    depends_on: ["get-products"],
  },
  {
    id: "get-ads",
    service: "adservice",
    method: "GET",
    path: "/ads",
    description: "Contextual ads",
    depends_on: [],
  },
  {
    id: "get-currency",
    service: "currencyservice",
    method: "GET",
    path: "/currency/convert",
    description: "FX conversion",
    depends_on: [],
  },
  {
    id: "post-cart",
    service: "cartservice",
    method: "POST",
    path: "/cart",
    description: "Add item to cart",
    depends_on: ["get-product"],
  },
  {
    id: "get-cart",
    service: "cartservice",
    method: "GET",
    path: "/cart",
    description: "Read cart",
    depends_on: ["post-cart"],
  },
  {
    id: "post-shipping-quote",
    service: "shippingservice",
    method: "POST",
    path: "/shipping/quote",
    description: "Shipping estimate",
    depends_on: ["post-cart"],
  },
  {
    id: "post-checkout",
    service: "checkoutservice",
    method: "POST",
    path: "/cart/checkout",
    description: "Place order",
    depends_on: ["post-cart", "post-shipping-quote"],
  },
  {
    id: "post-charge",
    service: "paymentservice",
    method: "POST",
    path: "/payment/charge",
    description: "Capture payment",
    depends_on: ["post-checkout"],
  },
  {
    id: "post-email",
    service: "emailservice",
    method: "POST",
    path: "/email/confirm",
    description: "Order confirmation",
    depends_on: ["post-checkout"],
  },
];
