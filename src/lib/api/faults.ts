import { type FaultSpec, FaultSpecSchema } from "@/types/api";
import { z } from "zod";
import { apiClient } from "./client";

const FaultSpecsList = z.array(FaultSpecSchema);

export async function listFaultSpecs(): Promise<FaultSpec[]> {
  return apiClient.get("/api/v1/faults/specs", FaultSpecsList);
}

export async function getFaultSpec(id: string): Promise<FaultSpec> {
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
