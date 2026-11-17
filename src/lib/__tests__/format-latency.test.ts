import { SAMPLE_RECORDED_RESULTS } from "@/lib/api/mock-fixtures";
import { formatLatencyUs } from "@/lib/utils";
import { describe, expect, it } from "vitest";

describe("formatLatencyUs", () => {
  it("keeps its default format without a decimals argument", () => {
    expect(formatLatencyUs(undefined)).toBe("—");
    expect(formatLatencyUs(null)).toBe("—");
    expect(formatLatencyUs(850)).toBe("850µs");
    expect(formatLatencyUs(7_000)).toBe("7.00ms");
    expect(formatLatencyUs(10_500)).toBe("11ms");
    expect(formatLatencyUs(364_900)).toBe("365ms");
    expect(formatLatencyUs(1_250_000)).toBe("1.25s");
  });

  it("shows every recorded sample figure to one decimal place", () => {
    const us = Object.values(SAMPLE_RECORDED_RESULTS).flatMap((r) =>
      [r.p50_ms, r.p95_ms, r.p99_ms].map((ms) => Math.round(ms * 1000)),
    );
    expect(us.map((v) => formatLatencyUs(v, 1))).toEqual([
      "7.0ms",
      "10.5ms",
      "39.5ms",
      "76.0ms",
      "364.9ms",
      "366.3ms",
      "5.8ms",
      "8.4ms",
      "14.6ms",
    ]);
  });

  it("leaves microsecond and second values as they are", () => {
    expect(formatLatencyUs(850, 1)).toBe("850µs");
    expect(formatLatencyUs(1_250_000, 1)).toBe("1.25s");
  });
});
