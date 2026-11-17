import { bucketFaultRules, faultBucketsLabel } from "@/lib/fault-categorize";
import { specLookup } from "@/lib/rule-target";
import type { Rule } from "@/types/api";
import { describe, expect, it } from "vitest";

const rule = (over: Partial<Rule>): Rule =>
  ({
    id: "r",
    name: "n",
    service: "svc",
    enabled: true,
    priority: 100,
    mode: "background",
    action: { type: "fault_spec", fault_spec_id: "spec-a" },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as Rule;
const spec = (id: string) => ({ type: "fault_spec" as const, fault_spec_id: id });

describe("bucketFaultRules", () => {
  it("buckets by the referenced spec's category (VM1: CPU and IO faults no longer read as inline)", () => {
    const specs = specLookup([
      { id: "spec-cpu", name: "exp1-cpu-spike", category: "resource" },
      { id: "spec-lat", name: "exp6-lat-payment", category: "inline" },
      { id: "spec-rst", name: "rst", category: "network" },
    ]);
    const b = bucketFaultRules(
      [
        rule({ action: spec("spec-cpu") }),
        rule({ action: spec("spec-cpu") }),
        rule({ action: spec("spec-lat") }),
        rule({ action: spec("spec-rst") }),
        rule({ action: { type: "cachebox", cachebox: { mode: "replay", key_strategy: "exact" } } }),
      ],
      specs,
    );
    expect(b).toEqual({ inline: 1, network: 1, resource: 2, cacheBox: 1 });
    expect(faultBucketsLabel(b)).toBe("1 inline · 1 network · 2 resource · 1 cache-box");
  });

  it("a rule named like a freeze is not a cache-box unless its action is one", () => {
    expect(bucketFaultRules([rule({ name: "hang-productcatalogservice" })]).cacheBox).toBe(0);
  });

  it("labels an empty set", () => {
    expect(faultBucketsLabel(bucketFaultRules([]))).toBe("none enabled");
  });
});
