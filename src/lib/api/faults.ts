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
    config: { duration_ms: 5000 },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-inline-latency-100ms",
    name: "latency 100ms",
    category: "inline",
    fault_type: "latency",
    config: { latency_ms: 100, jitter_ms: 0 },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-network-blackhole",
    name: "blackhole",
    category: "network",
    fault_type: "blackhole",
    config: { direction: "inbound" },
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
  config: unknown;
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
