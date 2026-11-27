import { plural } from "@/lib/utils";
import { describe, expect, it } from "vitest";

describe("plural", () => {
  it("says No for zero and agrees the verb with the count", () => {
    expect(plural(0, "rule", "uses this", "use this")).toBe("No rules use this");
    expect(plural(1, "rule", "uses this", "use this")).toBe("1 rule uses this");
    expect(plural(3, "rule", "uses this", "use this")).toBe("3 rules use this");
    expect(plural(2500, "rule", "uses this", "use this")).toBe("2,500 rules use this");
  });

  it("works with a noun alone", () => {
    expect(plural(0, "service")).toBe("No services");
    expect(plural(1, "service")).toBe("1 service");
    expect(plural(11, "service")).toBe("11 services");
  });

  it("takes an irregular plural", () => {
    expect(plural(2, ["entry", "entries"])).toBe("2 entries");
    expect(plural(1, ["entry", "entries"])).toBe("1 entry");
  });
});
