import { DatasetListItemSchema, DatasetSampleSchema, DatasetSchema } from "@/types/api";
import { describe, expect, it, vi } from "vitest";

// Mock the shared client so we exercise datasets.ts logic (envelope unwrap,
// path, defaults) without real network. Schema-vs-wire correctness is checked
// separately below by parsing fixtures with the real Zod schemas.
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    del: vi.fn(),
    baseUrl: "",
    environment: "test",
  },
}));

import { apiClient } from "@/lib/api/client";
import * as datasetsApi from "@/lib/api/datasets";

describe("dataset schemas ↔ zeus wire shapes", () => {
  it("DatasetListItemSchema parses a list row", () => {
    const row = DatasetListItemSchema.parse({
      id: "ds1",
      name: "seed",
      source: "upload",
      size_bytes: 100,
      ttl_s: 86400,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(row).toMatchObject({ id: "ds1", source: "upload", ttl_s: 86400 });
  });

  it("DatasetListItemSchema tolerates the create response (no size_bytes)", () => {
    const row = DatasetListItemSchema.parse({
      id: "ds-new",
      name: "x",
      source: "upload",
      created_at: "2026-01-01T00:00:00Z",
      ttl_s: 86400,
    });
    expect(row.size_bytes).toBe(0);
  });

  it("DatasetSchema parses pool_stats keyed by pool name", () => {
    const ds = DatasetSchema.parse({
      id: "ds1",
      name: "seed",
      source: "traffic_capture",
      pool_stats: { products: { row_count: 3, size_bytes: 50, fields: ["id"] } },
      size_bytes: 50,
      ttl_s: 0,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(ds.pool_stats.products?.row_count).toBe(3);
    expect(ds.pool_stats.products?.fields).toEqual(["id"]);
  });

  it("DatasetSampleSchema parses {pool, rows}", () => {
    const s = DatasetSampleSchema.parse({ pool: "products", rows: [{ id: "A" }, { id: "B" }] });
    expect(s.pool).toBe("products");
    expect(s.rows).toHaveLength(2);
  });
});

describe("datasetsApi", () => {
  it("listDatasets calls the zeus proxy path and unwraps the {datasets:[…]} envelope", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      datasets: [
        {
          id: "ds1",
          name: "seed",
          source: "upload",
          size_bytes: 0,
          ttl_s: 0,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const list = await datasetsApi.listDatasets();
    expect(apiClient.get).toHaveBeenCalledWith("/api/v1/zeus/datasets", expect.anything());
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("ds1");
  });

  it("getDataset hits /{id} on the zeus proxy", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      id: "ds1",
      name: "seed",
      source: "upload",
      pool_stats: {},
      size_bytes: 0,
      ttl_s: 0,
      created_at: "2026-01-01T00:00:00Z",
    });
    await datasetsApi.getDataset("ds1");
    expect(apiClient.get).toHaveBeenCalledWith("/api/v1/zeus/datasets/ds1", expect.anything());
  });

  it("sampleDataset encodes pool + limit query params", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ pool: "products", rows: [] });
    await datasetsApi.sampleDataset("ds1", "products", 25);
    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/v1/zeus/datasets/ds1/sample?pool=products&limit=25",
      expect.anything(),
    );
  });
});
