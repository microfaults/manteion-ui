import { CACHE_HIT_PROMQL, fetchDashboardPrometheusBundle } from "@/lib/prometheus";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("CACHE_HIT_PROMQL", () => {
  it("reads atropos's cache-box hit and miss counters", () => {
    expect(CACHE_HIT_PROMQL).toBe(
      "sum(rate(atropos_cachebox_hits_total[1m])) / (sum(rate(atropos_cachebox_hits_total[1m])) + sum(rate(atropos_cachebox_misses_total[1m]))) * 100",
    );
  });
});

describe("fetchDashboardPrometheusBundle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubPrometheus(cacheHitValue?: string) {
    const queries: string[] = [];
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      const query = url.searchParams.get("query") ?? "";
      queries.push(query);
      let result: unknown[] = [];
      if (url.pathname.endsWith("/api/v1/query") && query === CACHE_HIT_PROMQL && cacheHitValue) {
        result = [{ metric: {}, value: [0, cacheHitValue] }];
      }
      const data = url.pathname.endsWith("/api/v1/series") ? [] : { result };
      return new Response(JSON.stringify({ status: "success", data }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return queries;
  }

  it("queries the cache-hit ratio with CACHE_HIT_PROMQL for both the value and the trend", async () => {
    const queries = stubPrometheus("87.5");
    const bundle = await fetchDashboardPrometheusBundle(15);
    expect(queries.filter((q) => q === CACHE_HIT_PROMQL)).toHaveLength(2);
    expect(queries.some((q) => q.includes("cache_box_"))).toBe(false);
    expect(bundle.cacheHitRate).toBe(87.5);
  });

  it("reports no cache-hit value, not 0, when there is no cache-box traffic", async () => {
    stubPrometheus();
    const bundle = await fetchDashboardPrometheusBundle(15);
    expect(Number.isNaN(bundle.cacheHitRate)).toBe(true);
    expect(bundle.cacheHitRateRange).toEqual([]);
  });
});
