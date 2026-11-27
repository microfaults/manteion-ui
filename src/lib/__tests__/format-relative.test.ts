import { formatRelative } from "@/lib/utils";
import { describe, expect, it } from "vitest";

const NOW = Date.parse("2026-08-25T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("formatRelative", () => {
  it("reads just now under 10 s, never 0s ago", () => {
    expect(formatRelative(ago(0), NOW)).toBe("just now");
    expect(formatRelative(ago(9_999), NOW)).toBe("just now");
  });

  it("counts seconds, minutes, hours and days after that", () => {
    expect(formatRelative(ago(10_000), NOW)).toBe("10s ago");
    expect(formatRelative(ago(45_000), NOW)).toBe("45s ago");
    expect(formatRelative(ago(12 * 60_000), NOW)).toBe("12 min ago");
    expect(formatRelative(ago(3 * 3_600_000), NOW)).toBe("3h ago");
    expect(formatRelative(ago(2 * 86_400_000), NOW)).toBe("2d ago");
  });

  it("reads just now for a future time and a dash for none", () => {
    expect(formatRelative(ago(-5_000), NOW)).toBe("just now");
    expect(formatRelative(null, NOW)).toBe("—");
  });
});
