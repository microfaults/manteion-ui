import { formatVersion } from "@/lib/service-panel";
import { describe, expect, it } from "vitest";

describe("formatVersion", () => {
  it("prints exactly one leading v", () => {
    expect(formatVersion("v0.4.0")).toBe("v0.4.0");
    expect(formatVersion("0.4.2")).toBe("v0.4.2");
  });
});
