import { type FaultSpec, FaultSpecSchema } from "@/types/api";
import { z } from "zod";
import { apiClient } from "./client";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const _mockSpecs: FaultSpec[] = [
  {
    id: "spec-inline-hang-5s",
    name: "hang 5s",
    category: "inline",
    fault_type: "hang",
    params: { duration_ms: 5000 },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-inline-latency-100ms",
    name: "latency 100ms",
    category: "inline",
    fault_type: "latency",
    params: { latency_ms: 100, jitter_ms: 0 },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-network-blackhole",
    name: "blackhole",
    category: "network",
    fault_type: "blackhole",
    params: { direction: "inbound" },
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
    params: { latency_ms: 120, jitter_ms: 0 },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-resource-cpu-80",
    name: "cpu 80%",
    category: "resource",
    fault_type: "cpu",
    params: { percent: 80, cores: 2 },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-network-rst",
    name: "RST toxic",
    category: "network",
    fault_type: "rst",
    params: { interval_s: 5 },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-inline-hang-30s",
    name: "hang 30s",
    category: "inline",
    fault_type: "hang",
    params: { duration_ms: 30000 },
    created_at: "2026-04-01T10:00:00Z",
  },
];

const FaultSpecsList = z.array(FaultSpecSchema);

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
  /** Backend wire field name. Type-specific config blob — keeps Zod-loose
   *  (z.unknown) since validation happens in the FaultEditor form, not at
   *  the API boundary. */
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
