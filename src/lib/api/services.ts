import { type SDKInstance, SDKInstanceSchema } from "@/types/api";
import { z } from "zod";
import { apiClient } from "./client";

const List = z.array(SDKInstanceSchema);

export async function listSDKInstances(): Promise<SDKInstance[]> {
  return apiClient.get("/api/v1/sdk/instances", List);
}

/** NEW endpoint — disable all rules for a service. See docs/api/api-needed.md. */
export async function killSwitch(instanceId: string): Promise<void> {
  await apiClient.post(
    `/api/v1/sdk/instances/${encodeURIComponent(instanceId)}/kill-switch`,
    {},
    z.unknown(),
  );
}
