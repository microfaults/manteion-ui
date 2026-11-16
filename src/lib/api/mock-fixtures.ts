/**
 * Demo fixtures for VITE_USE_MOCK=true — the experiments, workflows and
 * API-catalog data the other api/ modules don't carry inline.
 *
 * Everything here is deliberately coherent with the fixtures in rules.ts,
 * services.ts and faults.ts: the real bed's service names (REAL_SERVICES in
 * lib/known-services.ts) and routes, the same
 * rule ids (rule-001…) and fault-spec ids (spec-inline-hang-5s…), so panels
 * that cross-reference by id resolve names instead of showing raw ids.
 *
 * Timestamps are minted relative to load time so a demo session always reads
 * as "2m ago" rather than a frozen date.
 */
import type { Workflow, WorkflowSummary } from "@/lib/workflow-types";
import type {
  CatalogEndpoint,
  Experiment,
  FrozenService,
  PhaseResults,
  PhaseSummary,
  PhaseWorkflowResult,
} from "@/types/api";

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
        {
          type: "request",
          id: "r-checkout-2-0",
          method: "POST",
          path: "/cart/{user_id}/items",
        },
        { type: "request", id: "r-checkout-2-1", method: "POST", path: "/convert" },
      ],
    },
    { type: "request", id: "r-checkout-3", method: "POST", path: "/placeorder" },
    {
      type: "optional",
      id: "o-checkout-4",
      probability: 0.35,
      child: {
        type: "request",
        id: "r-checkout-4",
        method: "POST",
        path: "/send-order-confirmation",
      },
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
    { type: "request", id: "r-browse-4", method: "GET", path: "/recommendations" },
  ],
};

const ABANDON_ROOT: Workflow["root"] = {
  type: "sequence",
  id: "root",
  label: "cart-abandon",
  children: [
    { type: "request", id: "r-abandon-0", method: "GET", path: "/products" },
    { type: "request", id: "r-abandon-1", method: "POST", path: "/cart/{user_id}/items" },
    { type: "delay", id: "d-abandon-2", label: "abandon", minMs: 2000, maxMs: 5000 },
  ],
};

export const mockWorkflows: Workflow[] = [
  {
    id: "wf-checkout-burst",
    name: "checkout-burst",
    version: "v2",
    targets: [
      "frontend",
      "productcatalogservice",
      "cartservice",
      "checkoutservice",
      "currencyservice",
      "emailservice",
    ],
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
    targets: ["frontend", "productcatalogservice", "adservice", "recommendationservice"],
    estRpsPerVu: 6.8,
    updatedAt: ago(3 * HOUR),
    description: "Read-heavy catalog browsing with ads and recommendations.",
    requestNodeCount: 4,
    root: BROWSE_ROOT,
  },
  {
    id: "wf-cart-abandon",
    name: "cart-abandon",
    version: "v2",
    targets: ["frontend", "productcatalogservice", "cartservice"],
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
// Shapes mirror manteion-go epoch 2: phases carry workflows + bare rule_ids,
// never metrics. Results live in `mockPhaseResults` (keyed by phase id) the
// way GET …/phases/{id}/results serves them once a phase is terminal.

function phase(
  p: Partial<PhaseSummary> & Pick<PhaseSummary, "id" | "name" | "status">,
): PhaseSummary {
  return { workflows: [], frozen_services: [], rule_ids: [], ...p };
}

/** Frozen-service config as the backend serialises it (model.CacheBoxConfig). */
const replay = (service: string): FrozenService => ({
  service,
  mode: "replay",
  workflow_scope: "",
  key_strategy: "canonical_v2",
  mutation_policy: "deny",
});

/** The planned demo experiment: plain → 50 ms catalog latency → plain, no freeze. */
export const SAMPLE_EXPERIMENT_ID = "exp-sample-catalog-latency";

export const mockExperiments: Experiment[] = [
  {
    id: "exp-001",
    name: "checkout-p99-isolation",
    description: "Isolate which downstream dominates checkout tail latency.",
    hypothesis: "shippingservice CPU saturation drives >60% of checkout p99.",
    status: "running",
    targeted_services: ["shippingservice", "checkoutservice", "cartservice"],
    created_by: "operator",
    created_at: ago(2 * HOUR),
    started_at: ago(38 * MINUTE),
    phases: [
      phase({
        id: "ph-001-baseline",
        name: "baseline",
        position: 0,
        status: "completed",
        persist_cache: true,
        workflows: [
          {
            workflow_id: "wf-checkout-burst",
            vus: 25,
            duration_sec: 300,
            zeus_run_id: "run-001-baseline",
          },
        ],
        started_at: ago(38 * MINUTE),
        completed_at: ago(33 * MINUTE),
      }),
      phase({
        id: "ph-001-isolation",
        name: "isolation-shippingservice",
        position: 1,
        status: "running",
        workflows: [
          {
            workflow_id: "wf-checkout-burst",
            vus: 25,
            duration_sec: 300,
            zeus_run_id: "run-001-isolation",
          },
        ],
        started_at: ago(4 * MINUTE),
        frozen_services: [replay("cartservice")],
        rule_ids: ["rule-005"],
      }),
      phase({
        id: "ph-001-combined",
        name: "combined",
        position: 2,
        status: "pending",
        workflows: [{ workflow_id: "wf-checkout-burst", vus: 25, duration_sec: 300 }],
        rule_ids: ["rule-005", "rule-003"],
      }),
    ],
  },
  {
    id: "exp-002",
    name: "cart-replay-freeze",
    description: "Serve cartservice from the cache box and measure drift.",
    status: "completed",
    targeted_services: ["cartservice"],
    created_by: "operator",
    created_at: ago(30 * HOUR),
    started_at: ago(28 * HOUR),
    completed_at: ago(27 * HOUR),
    phases: [
      phase({
        id: "ph-002-baseline",
        name: "baseline",
        position: 0,
        status: "completed",
        persist_cache: true,
        workflows: [
          { workflow_id: "wf-cart-abandon", vus: 10, duration_sec: 600, zeus_run_id: "run-002-b" },
        ],
        started_at: ago(28 * HOUR),
        completed_at: ago(27.8 * HOUR),
      }),
      phase({
        id: "ph-002-replay",
        name: "isolation-cartservice",
        position: 1,
        status: "completed",
        workflows: [
          { workflow_id: "wf-cart-abandon", vus: 10, duration_sec: 600, zeus_run_id: "run-002-r" },
        ],
        started_at: ago(27.7 * HOUR),
        completed_at: ago(27 * HOUR),
        frozen_services: [replay("cartservice")],
        rule_ids: ["rule-009"],
      }),
    ],
  },
  {
    id: "exp-003",
    name: "payment-latency-sweep",
    description: "Ramp injected payment latency 50→400ms.",
    status: "planned",
    targeted_services: ["paymentservice", "checkoutservice"],
    created_by: "operator",
    created_at: ago(20 * MINUTE),
    phases: [
      phase({
        id: "ph-003-baseline",
        name: "baseline",
        position: 0,
        status: "pending",
        workflows: [{ workflow_id: "wf-checkout-burst", vus: 40, duration_sec: 240 }],
      }),
      phase({
        id: "ph-003-100",
        name: "isolation-payment-100ms",
        position: 1,
        status: "pending",
        workflows: [{ workflow_id: "wf-checkout-burst", vus: 40, duration_sec: 240 }],
        rule_ids: ["rule-004"],
      }),
      phase({
        id: "ph-003-400",
        name: "isolation-payment-400ms",
        position: 2,
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
    targeted_services: ["adservice", "productcatalogservice"],
    created_by: "nathan",
    created_at: ago(5 * HOUR),
    started_at: ago(4.5 * HOUR),
    completed_at: ago(4.2 * HOUR),
    failure_reason:
      "phase isolation-adservice failed: zeus run run-004-bh exited early (k6 exit 99)",
    phases: [
      phase({
        id: "ph-004-baseline",
        name: "baseline",
        position: 0,
        status: "completed",
        workflows: [
          {
            workflow_id: "wf-browse-catalog",
            vus: 15,
            duration_sec: 180,
            zeus_run_id: "run-004-b",
          },
        ],
        started_at: ago(4.5 * HOUR),
        completed_at: ago(4.4 * HOUR),
      }),
      phase({
        id: "ph-004-blackhole",
        name: "isolation-adservice",
        position: 1,
        status: "failed",
        workflows: [
          {
            workflow_id: "wf-browse-catalog",
            vus: 15,
            duration_sec: 180,
            zeus_run_id: "run-004-bh",
          },
        ],
        started_at: ago(4.35 * HOUR),
        completed_at: ago(4.2 * HOUR),
        rule_ids: ["rule-008"],
        failure_reason: "zeus run run-004-bh exited early (k6 exit 99)",
      }),
      phase({ id: "ph-004-combined", name: "combined", position: 2, status: "skipped" }),
    ],
  },
  {
    id: SAMPLE_EXPERIMENT_ID,
    name: "sample-catalog-latency",
    description: "Add 50 ms to productcatalogservice between two plain browse phases.",
    hypothesis: "50 ms on productcatalogservice shows up in browse p50 and recovers after.",
    status: "planned",
    targeted_services: ["productcatalogservice"],
    created_by: "operator",
    created_at: ago(10 * MINUTE),
    phases: [
      phase({
        id: "ph-sample-plain",
        name: "plain",
        position: 0,
        status: "pending",
        workflows: [{ workflow_id: "wf-browse-catalog", vus: 10, duration_sec: 120 }],
      }),
      phase({
        id: "ph-sample-latency",
        name: "catalog-latency-50ms",
        position: 1,
        status: "pending",
        workflows: [{ workflow_id: "wf-browse-catalog", vus: 10, duration_sec: 120 }],
        rule_ids: ["rule-014"],
      }),
      phase({
        id: "ph-sample-plain-end",
        name: "plain-end",
        position: 2,
        status: "pending",
        workflows: [{ workflow_id: "wf-browse-catalog", vus: 10, duration_sec: 120 }],
      }),
    ],
  },
];

/** One harvested workflow result. Request count = rps × seconds. */
function harvested(
  phase_id: string,
  workflow_id: string,
  seconds: number,
  m: { p50: number; p95: number; p99: number; rps: number; err: number },
): PhaseWorkflowResult {
  const request_count = Math.round(m.rps * seconds);
  return {
    phase_id,
    workflow_id,
    request_count,
    error_count: Math.round(request_count * m.err),
    error_rate: m.err,
    throughput_rps: m.rps,
    latency_p50_us: m.p50,
    latency_p95_us: m.p95,
    latency_p99_us: m.p99,
    latency_p999_us: Math.round(m.p99 * 1.6),
    computed_at: ago(HOUR),
  };
}

/** GET …/phases/{id}/results per terminal phase. Absent key = nothing
 *  harvested yet (pending / running) — exactly what the backend answers. */
export const mockPhaseResults: Record<string, PhaseResults> = {
  "ph-001-baseline": {
    workflow_results: [
      harvested("ph-001-baseline", "wf-checkout-burst", 300, {
        p50: 18_400,
        p95: 42_100,
        p99: 61_200,
        rps: 104.6,
        err: 0.0021,
      }),
    ],
    service_latency: [],
    service_cache: [],
    drain: { status: "clean" },
  },
  "ph-002-baseline": {
    workflow_results: [
      harvested("ph-002-baseline", "wf-cart-abandon", 600, {
        p50: 7_900,
        p95: 16_300,
        p99: 24_800,
        rps: 21.4,
        err: 0,
      }),
    ],
    service_latency: [],
    service_cache: [],
    drain: { status: "clean" },
  },
  "ph-002-replay": {
    workflow_results: [
      harvested("ph-002-replay", "wf-cart-abandon", 600, {
        p50: 3_100,
        p95: 6_400,
        p99: 9_100,
        rps: 22.0,
        err: 0,
      }),
    ],
    service_latency: [
      {
        phase_id: "ph-002-replay",
        service: "cartservice",
        workflow_id: "wf-cart-abandon",
        latency_p50_us: 410,
        latency_p95_us: 880,
        latency_p99_us: 1_240,
        request_count: 13_200,
      },
    ],
    service_cache: [
      {
        phase_id: "ph-002-replay",
        service: "cartservice",
        cache_hit_rate: 0.984,
        cache_exact_match: 0.91,
        cache_staleness: 0.06,
        request_count: 13_200,
        recorded_entry_count: 1_870,
      },
    ],
    verdict: {
      verdict: "VALID",
      collision_rate: 0.002,
      replay_age_max_ms: 2_100,
      replay_age_mean_ms: 640,
    },
  },
  "ph-004-baseline": {
    workflow_results: [
      harvested("ph-004-baseline", "wf-browse-catalog", 180, {
        p50: 9_800,
        p95: 22_400,
        p99: 31_500,
        rps: 88.1,
        err: 0.0009,
      }),
    ],
    service_latency: [],
    service_cache: [],
  },
  "ph-004-blackhole": {
    workflow_results: [
      harvested("ph-004-blackhole", "wf-browse-catalog", 180, {
        p50: 41_000,
        p95: 380_000,
        p99: 512_000,
        rps: 12.4,
        err: 0.418,
      }),
    ],
    service_latency: [],
    service_cache: [],
  },
};

// ─── API catalog (workflow builder picker) ─────────────────────────────
// `depends_on` drives the picker's dependency auto-expansion: picking
// POST /placeorder also pulls in the cart and product routes, prerequisites first.

export const mockCatalogEndpoints: CatalogEndpoint[] = [
  {
    id: "get-products",
    service: "productcatalogservice",
    method: "GET",
    path: "/products",
    description: "List catalog",
    depends_on: [],
  },
  {
    id: "get-product",
    service: "productcatalogservice",
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
    id: "get-recommendations",
    service: "recommendationservice",
    method: "GET",
    path: "/recommendations",
    description: "Product recommendations",
    depends_on: [],
  },
  {
    id: "post-convert",
    service: "currencyservice",
    method: "POST",
    path: "/convert",
    description: "FX conversion",
    depends_on: [],
  },
  {
    id: "post-cart",
    service: "cartservice",
    method: "POST",
    path: "/cart/{user_id}/items",
    description: "Add item to cart",
    depends_on: ["get-product"],
  },
  {
    id: "get-cart",
    service: "cartservice",
    method: "GET",
    path: "/cart/{user_id}",
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
    path: "/placeorder",
    description: "Place order",
    depends_on: ["post-cart", "post-shipping-quote"],
  },
  {
    id: "post-charge",
    service: "paymentservice",
    method: "POST",
    path: "/charge",
    description: "Charge a card",
    depends_on: [],
  },
  {
    id: "post-email",
    service: "emailservice",
    method: "POST",
    path: "/send-order-confirmation",
    description: "Order confirmation",
    depends_on: [],
  },
];
