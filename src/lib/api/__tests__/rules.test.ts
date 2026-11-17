import { CACHEBOX_KEY_STRATEGIES, RuleSchema } from "@/types/api";
import { describe, expect, it } from "vitest";

/**
 * The cache-box key strategies the platform accepts, copied from manteion-go
 * `internal/model/enums.go` (`CacheBoxKeyStrategyValues`). `canonical_v2` is
 * the server-side default (`internal/model/cachebox.go` `DefaultKeyStrategy`),
 * so a rule persisted without an explicit strategy comes back carrying it.
 */
const BACKEND_KEY_STRATEGIES = [
  "exact",
  "exact_with_host",
  "exact_with_body",
  "canonical_v2",
  "exact_with_host_norm",
];

const cacheboxRule = (keyStrategy: string) => ({
  id: "rule-cachebox-001",
  name: "hang-productcatalogservice",
  service: "productcatalog",
  enabled: true,
  priority: 100,
  mode: "inline",
  action: { type: "cachebox", cachebox: { mode: "replay", key_strategy: keyStrategy } },
  created_at: "2026-04-01T10:00:00Z",
  updated_at: "2026-04-20T14:30:00Z",
});

describe("RuleSchema — cache-box key strategies", () => {
  it("parses a cachebox rule using the platform default key strategy", () => {
    const parsed = RuleSchema.parse(cacheboxRule("canonical_v2"));
    expect(parsed.action).toEqual({
      type: "cachebox",
      cachebox: { mode: "replay", key_strategy: "canonical_v2" },
    });
  });

  it.each(BACKEND_KEY_STRATEGIES)("parses a cachebox rule with key_strategy %s", (strategy) => {
    expect(() => RuleSchema.parse(cacheboxRule(strategy))).not.toThrow();
  });

  it("still rejects a key strategy the backend does not define", () => {
    expect(() => RuleSchema.parse(cacheboxRule("exact_with_query"))).toThrow();
  });

  it("exposes every backend key strategy as CACHEBOX_KEY_STRATEGIES", () => {
    expect([...CACHEBOX_KEY_STRATEGIES].sort()).toEqual([...BACKEND_KEY_STRATEGIES].sort());
  });
});
