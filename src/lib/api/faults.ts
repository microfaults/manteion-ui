import {
  type FaultCatalogEntry,
  FaultCatalogResponseSchema,
  type FaultSpec,
  FaultSpecSchema,
  type NetworkEnvelope,
} from "@/types/api";
import { z } from "zod";
import { apiClient } from "./client";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const _mockSpecs: FaultSpec[] = [
  {
    id: "spec-inline-hang-5s",
    name: "hang 5s",
    category: "inline",
    fault_type: "hang",
    params: { duration: "5s" },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-inline-latency-100ms",
    name: "latency 100ms",
    category: "inline",
    fault_type: "latency",
    params: { delay: "100ms" },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-network-blackhole",
    name: "blackhole",
    category: "network",
    fault_type: "blackhole",
    network: { target: "productcatalog", direction: "downstream" },
    params: {},
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-inline-http-error",
    name: "http-error 500",
    category: "inline",
    fault_type: "error",
    params: { status_code: 500 },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-inline-latency-120ms",
    name: "latency 120ms",
    category: "inline",
    fault_type: "latency",
    params: { delay: "120ms" },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-resource-cpu-80",
    name: "cpu 80%",
    category: "resource",
    fault_type: "cpu",
    params: { target_load: 0.8, window: "100ms" },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-network-rst",
    name: "RST toxic",
    category: "network",
    fault_type: "rst",
    network: { target: "currencyservice", direction: "downstream" },
    params: { after_duration: "5s" },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-inline-hang-30s",
    name: "hang 30s",
    category: "inline",
    fault_type: "hang",
    params: { duration: "30s" },
    created_at: "2026-04-01T10:00:00Z",
  },
];

/** Mirrors manteion-go/internal/faultcatalog fieldSpecs — used only when
 *  VITE_USE_MOCK=true so the editor stays usable offline. */
const _mockCatalog: FaultCatalogEntry[] = [
  {
    category: "inline",
    fault_type: "latency",
    description: "Add sleep before response. Supports jitter.",
    network_required: false,
    params: [
      { name: "delay", type: "duration", required: true, description: "base delay per request" },
      {
        name: "jitter",
        type: "duration",
        required: false,
        description: "uniform jitter added to delay",
      },
    ],
  },
  {
    category: "inline",
    fault_type: "error",
    description: "Return a status code without calling downstream.",
    network_required: false,
    params: [
      {
        name: "status_code",
        type: "int",
        required: false,
        default: 500,
        description: "HTTP status (100–599)",
      },
      {
        name: "message",
        type: "string",
        required: false,
        default: "injected fault",
        description: "response body",
      },
    ],
  },
  {
    category: "inline",
    fault_type: "hang",
    description: "Block the request until the duration elapses.",
    network_required: false,
    params: [
      {
        name: "duration",
        type: "duration",
        required: true,
        description: "how long to block the request",
      },
    ],
  },
  {
    category: "network",
    fault_type: "latency",
    description: "Add network-layer latency with jitter.",
    network_required: true,
    params: [
      { name: "delay", type: "duration", required: true, description: "base delay on piped bytes" },
      {
        name: "jitter",
        type: "duration",
        required: false,
        description: "uniform jitter added to delay",
      },
    ],
  },
  {
    category: "network",
    fault_type: "retransmit_delay",
    description: "Delay retransmissions at a given rate.",
    network_required: true,
    params: [
      {
        name: "rate",
        type: "float",
        required: true,
        description: "fraction of reads stalled (0–1)",
      },
      {
        name: "delay",
        type: "duration",
        required: false,
        default: "200ms",
        description: "per-stall delay",
      },
      {
        name: "reset_threshold",
        type: "int",
        required: false,
        default: 0,
        description: "stalls before RST; 0 = never",
      },
    ],
  },
  {
    category: "network",
    fault_type: "blackhole",
    description: "Drop all traffic on a stream.",
    network_required: true,
    params: [],
  },
  {
    category: "network",
    fault_type: "drip",
    description: "Slow-drip data in tiny chunks.",
    network_required: true,
    params: [
      {
        name: "chunk_size",
        type: "int",
        required: false,
        default: 1,
        description: "bytes per chunk",
      },
      { name: "interval", type: "duration", required: false, description: "pause between chunks" },
    ],
  },
  {
    category: "network",
    fault_type: "rst",
    description: "Force-close the connection with a TCP RST.",
    network_required: true,
    params: [
      {
        name: "after_bytes",
        type: "int",
        required: false,
        default: 0,
        description: "forwarded bytes before RST",
      },
      {
        name: "after_duration",
        type: "duration",
        required: false,
        description: "elapsed time before RST",
      },
    ],
  },
  {
    category: "network",
    fault_type: "throttle",
    description: "Cap stream bandwidth with token pacing.",
    network_required: true,
    params: [{ name: "bytes_per_sec", type: "int", required: true, description: "bandwidth cap" }],
  },
  {
    category: "resource",
    fault_type: "cpu",
    description: "Burn CPU at a target load fraction.",
    network_required: false,
    params: [
      {
        name: "target_load",
        type: "float",
        required: true,
        description: "incremental CPU fraction (0–1]",
      },
      {
        name: "window",
        type: "duration",
        required: false,
        default: "100ms",
        description: "duty-cycle period",
      },
    ],
  },
  {
    category: "resource",
    fault_type: "memory",
    description: "Allocate memory to a target load fraction.",
    network_required: false,
    params: [
      {
        name: "target_load",
        type: "float",
        required: true,
        description: "fraction of available memory (0–1]",
      },
      {
        name: "chunk_size",
        type: "int",
        required: false,
        default: 1048576,
        description: "bytes per allocated chunk",
      },
      {
        name: "thrashing",
        type: "bool",
        required: false,
        default: false,
        description: "page-thrash mode",
      },
      {
        name: "thrash_workers",
        type: "int",
        required: false,
        default: 2,
        description: "thrash goroutines",
      },
    ],
  },
  {
    category: "resource",
    fault_type: "disk",
    description: "Sustained disk writes at a fixed rate.",
    network_required: false,
    params: [
      {
        name: "write_rate",
        type: "int",
        required: false,
        default: 10485760,
        description: "bytes/sec sustained writes",
      },
      {
        name: "max_disk_usage",
        type: "int",
        required: false,
        default: 536870912,
        description: "byte cap on scratch usage",
      },
      {
        name: "chunk_size",
        type: "int",
        required: false,
        default: 1048576,
        description: "bytes per write",
      },
      {
        name: "path",
        type: "string",
        required: false,
        description: "scratch dir; empty = OS temp",
      },
    ],
  },
  {
    category: "resource",
    fault_type: "io",
    description: "Stress file I/O with concurrent workers.",
    network_required: false,
    params: [
      {
        name: "read_rate",
        type: "int",
        required: false,
        default: 102400,
        description: "bytes/sec",
      },
      {
        name: "file_size",
        type: "int",
        required: false,
        default: 4096,
        description: "bytes per file",
      },
      {
        name: "file_count",
        type: "int",
        required: false,
        default: 256,
        description: "files in the working set",
      },
      {
        name: "workers",
        type: "int",
        required: false,
        default: 4,
        description: "concurrent I/O goroutines",
      },
      {
        name: "path",
        type: "string",
        required: false,
        description: "scratch dir; empty = OS temp",
      },
      {
        name: "mode",
        type: "enum",
        required: false,
        default: "read",
        enum: ["read", "write", "read_write"],
        description: "I/O direction",
      },
    ],
  },
];

const FaultSpecsList = z.array(FaultSpecSchema);

// The catalog is static for the lifetime of the backend build, so cache the
// first successful fetch for the session.
let _catalogCache: FaultCatalogEntry[] | null = null;

/** GET /api/v1/faults/catalog — the supported-fault catalogue (vocabulary +
 *  per-type param field specs). Fault spec/config forms render from this so
 *  the UI can't drift from what the SDK decoders accept. */
export async function getFaultCatalog(): Promise<FaultCatalogEntry[]> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 60));
    return [..._mockCatalog];
  }
  if (_catalogCache) return _catalogCache;
  const resp = await apiClient.get("/api/v1/faults/catalog", FaultCatalogResponseSchema);
  _catalogCache = resp.catalog;
  return resp.catalog;
}

export async function listFaultSpecs(): Promise<FaultSpec[]> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 60));
    return [..._mockSpecs];
  }
  return apiClient.get("/api/v1/faults/specs", FaultSpecsList);
}

export async function getFaultSpec(id: string): Promise<FaultSpec> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 60));
    const spec = _mockSpecs.find((s) => s.id === id);
    if (!spec) throw new Error(`Mock: fault spec ${id} not found`);
    return { ...spec };
  }
  return apiClient.get(`/api/v1/faults/specs/${encodeURIComponent(id)}`, FaultSpecSchema);
}

export interface FaultSpecInput {
  name: string;
  category: "inline" | "network" | "resource";
  fault_type: string;
  /** Optional placement knob: "" | "proxy" | "inline" (network only) |
   *  "process" (non-network only). */
  host?: string;
  /** Required for network-category faults: which traffic the toxic applies to. */
  network?: NetworkEnvelope;
  /** Type-specific params blob. Strictly validated server-side against
   *  GET /api/v1/faults/catalog — unknown fields and out-of-range values 400,
   *  so keys/values must follow the catalog field specs. */
  params: unknown;
  description?: string;
  duration_ms?: number;
  ramp_up_ms?: number;
  ramp_down_ms?: number;
}

export async function createFaultSpec(input: FaultSpecInput): Promise<FaultSpec> {
  return apiClient.post("/api/v1/faults/specs", input, FaultSpecSchema);
}

export async function updateFaultSpec(id: string, input: FaultSpecInput): Promise<FaultSpec> {
  return apiClient.put(`/api/v1/faults/specs/${encodeURIComponent(id)}`, input, FaultSpecSchema);
}

export async function deleteFaultSpec(id: string): Promise<void> {
  await apiClient.del(`/api/v1/faults/specs/${encodeURIComponent(id)}`);
}
