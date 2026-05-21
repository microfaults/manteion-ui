/**
 * Catalog client — live SDK-route inventory aggregated from
 * sdk_instances.routes, served by manteion-go's
 * GET /api/v1/catalog/endpoints.
 *
 * Wire shape:
 *   { data: CatalogEndpoint[], hint?: string }
 *
 * The handler caches for 30s and filters by SDK liveness (2-min window).
 * When no SDK is publishing routes, `data` is `[]` and `hint` carries a
 * human-readable explanation for an empty-state tile.
 */

import { type CatalogEndpoint, CatalogResponseSchema } from "@/types/api";
import { apiClient } from "./client";

export interface CatalogResult {
  endpoints: CatalogEndpoint[];
  hint?: string;
}

export async function listEndpoints(): Promise<CatalogResult> {
  const resp = await apiClient.get("/api/v1/catalog/endpoints", CatalogResponseSchema);
  return { endpoints: resp.data, hint: resp.hint };
}

export type { CatalogEndpoint };
