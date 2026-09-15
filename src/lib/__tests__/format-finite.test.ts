import { formatFinite } from "@/lib/utils";
import { describe, expect, it } from "vitest";

describe("formatFinite", () => {
  const ms = (v: number) => `${Math.round(v)} ms`;
  it("formats finite numbers, including zero", () => {
    expect(formatFinite(148.4, ms)).toBe("148 ms");
    expect(formatFinite(0, ms)).toBe("0 ms");
  });
  it("renders a dash for NaN (Prometheus quantile over an empty window), infinities and missing values", () => {
    expect(formatFinite(Number.NaN, ms)).toBe("—");
    expect(formatFinite(Number.POSITIVE_INFINITY, ms)).toBe("—");
    expect(formatFinite(undefined, ms)).toBe("—");
    expect(formatFinite(null, ms)).toBe("—");
  });
});
