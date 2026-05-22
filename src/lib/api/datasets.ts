/**
 * Dataset client.
 *
 * Datasets are zeus-owned today, reached through manteion's proxy at
 * `/api/v1/zeus/datasets/*`. This is the INTERIM path: when manteion takes
 * ownership of datasets (mirroring the workflows move in commit 8777543), only
 * the `BASE` constant below changes to `/api/v1/datasets`.
 *
 * Wire shapes (verified against zeus-go/internal/api/dataset_handler.go):
 *   GET    /datasets                       → { datasets: DatasetListItem[] }   (no pools)
 *   GET    /datasets/{id}                   → Dataset (pool_stats keyed by pool)
 *   POST   /datasets {name, source?, ttl_s?}→ { id, name, source, created_at, ttl_s }
 *   POST   /datasets/{id}/upload (NDJSON)   → { ingested: {pool: n}, total, errors? }
 *   GET    /datasets/{id}/sample?pool=&limit=→ { pool, rows: [...] }
 *   DELETE /datasets/{id}                   → 204 (409 if an active run references it)
 */

import {
  type Dataset,
  type DatasetListItem,
  DatasetListItemSchema,
  type DatasetSample,
  DatasetSampleSchema,
  DatasetSchema,
} from "@/types/api";
import { z } from "zod";
import { apiClient } from "./client";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

/** Interim base path — zeus proxy. Repoint to `/api/v1/datasets` when manteion
 *  owns datasets (one-line change; see the dataset capture-replay design). */
const BASE = "/api/v1/zeus/datasets";

const DatasetListEnvelope = z.object({
  datasets: z.array(DatasetListItemSchema).default([]),
});

export interface CreateDatasetInput {
  name: string;
  /** Defaults to "upload" server-side when omitted. */
  source?: string;
  /** TTL in seconds. Server defaults to 24h when omitted/0. */
  ttlS?: number;
}

export const UploadResultSchema = z.object({
  ingested: z.record(z.number()).default({}),
  total: z.number().int().default(0),
  errors: z.array(z.string()).optional(),
});
export type UploadResult = z.infer<typeof UploadResultSchema>;

// ─── Mock fixtures (VITE_USE_MOCK=true) ──────────────────────────────────

let _mockDatasets: Dataset[] = [
  {
    id: "ds-browse-capture",
    name: "online-boutique-browse-capture",
    source: "traffic_capture",
    pool_stats: {
      products: { row_count: 32, size_bytes: 1184, fields: ["id"] },
    },
    size_bytes: 1184,
    ttl_s: 86400,
    created_at: "2026-05-20T18:00:00Z",
  },
  {
    id: "ds-checkout-seed",
    name: "checkout-seed",
    source: "upload",
    pool_stats: {
      users: { row_count: 500, size_bytes: 41200, fields: ["id", "email", "region"] },
      products: { row_count: 50, size_bytes: 2100, fields: ["id", "name"] },
    },
    size_bytes: 43300,
    ttl_s: 0,
    created_at: "2026-05-19T09:30:00Z",
  },
];

const _mockSamples: Record<string, Record<string, DatasetSample>> = {
  "ds-browse-capture": {
    products: {
      pool: "products",
      rows: [
        { id: "OLJCESPC7Z" },
        { id: "66VCHSJNUP" },
        { id: "0PUK6V6EV0" },
        { id: "1YMWWN1N4O" },
        { id: "L9ECAV7KIM" },
      ],
    },
  },
  "ds-checkout-seed": {
    users: {
      pool: "users",
      rows: [
        { id: "u-001", email: "ada@example.com", region: "us-west" },
        { id: "u-002", email: "grace@example.com", region: "eu" },
      ],
    },
    products: {
      pool: "products",
      rows: [
        { id: "OLJCESPC7Z", name: "Sunglasses" },
        { id: "66VCHSJNUP", name: "Tank Top" },
      ],
    },
  },
};

function mockDelay() {
  return new Promise((r) => setTimeout(r, 60));
}

function toListItem(d: Dataset): DatasetListItem {
  return {
    id: d.id,
    name: d.name,
    source: d.source,
    size_bytes: d.size_bytes,
    ttl_s: d.ttl_s,
    created_at: d.created_at,
  };
}

// ─── API ─────────────────────────────────────────────────────────────────

export async function listDatasets(): Promise<DatasetListItem[]> {
  if (USE_MOCK) {
    await mockDelay();
    return _mockDatasets.map(toListItem);
  }
  const env = await apiClient.get(BASE, DatasetListEnvelope);
  return env.datasets;
}

export async function getDataset(id: string): Promise<Dataset> {
  if (USE_MOCK) {
    await mockDelay();
    const ds = _mockDatasets.find((d) => d.id === id);
    if (!ds) throw new Error(`Mock: dataset ${id} not found`);
    return { ...ds };
  }
  return apiClient.get(`${BASE}/${encodeURIComponent(id)}`, DatasetSchema);
}

export async function createDataset(input: CreateDatasetInput): Promise<DatasetListItem> {
  if (USE_MOCK) {
    await mockDelay();
    const ds: Dataset = {
      id: `ds-${Date.now()}`,
      name: input.name,
      source: input.source || "upload",
      pool_stats: {},
      size_bytes: 0,
      ttl_s: input.ttlS ?? 86400,
      created_at: new Date().toISOString(),
    };
    _mockDatasets = [..._mockDatasets, ds];
    return toListItem(ds);
  }
  // Create response omits size_bytes; DatasetListItemSchema defaults it to 0.
  return apiClient.post(
    BASE,
    { name: input.name, source: input.source, ttl_s: input.ttlS },
    DatasetListItemSchema,
  );
}

export async function sampleDataset(id: string, pool: string, limit = 10): Promise<DatasetSample> {
  if (USE_MOCK) {
    await mockDelay();
    return _mockSamples[id]?.[pool] ?? { pool, rows: [] };
  }
  const qs = `pool=${encodeURIComponent(pool)}&limit=${limit}`;
  return apiClient.get(`${BASE}/${encodeURIComponent(id)}/sample?${qs}`, DatasetSampleSchema);
}

export async function deleteDataset(id: string): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    _mockDatasets = _mockDatasets.filter((d) => d.id !== id);
    return;
  }
  await apiClient.del(`${BASE}/${encodeURIComponent(id)}`);
}

/** Upload NDJSON pool rows. Bypasses the JSON client because the body is
 *  raw NDJSON with content-type application/x-ndjson. */
export async function uploadPool(id: string, ndjson: string): Promise<UploadResult> {
  if (USE_MOCK) {
    await mockDelay();
    const lines = ndjson.split("\n").filter((l) => l.trim().length > 0);
    return { ingested: { uploaded: lines.length }, total: lines.length };
  }
  const url = `${apiClient.baseUrl}${BASE}/${encodeURIComponent(id)}/upload`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-ndjson",
      "X-Faults-Lab-Environment": apiClient.environment,
    },
    body: ndjson,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upload failed: HTTP ${res.status} ${text}`);
  }
  return UploadResultSchema.parse(await res.json());
}
