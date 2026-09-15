import { summarizeServiceHealth } from "@/lib/service-health";
import { describe, expect, it } from "vitest";

const reg = (service: string, status?: "alive" | "stale" | "dead") => ({ service, status });

describe("summarizeServiceHealth", () => {
  it("a live pod among dead registrations of replaced pods is healthy (VM1: every service had old dead pods)", () => {
    const h = summarizeServiceHealth([
      reg("adservice", "alive"),
      reg("adservice", "dead"),
      reg("cartservice", "alive"),
      ...Array.from({ length: 6 }, () => reg("cartservice", "dead")),
    ]);
    expect(h).toEqual({ services: 2, healthy: 2, degraded: 0, failing: 0, unknown: 0 });
  });

  it("failing only when every registration is dead; stale-only is degraded; unreported is unknown", () => {
    const h = summarizeServiceHealth([
      reg("a", "dead"),
      reg("a", "dead"),
      reg("b", "stale"),
      reg("b", "dead"),
      reg("c"),
      reg("c", "dead"),
      reg("d", "alive"),
    ]);
    expect(h).toEqual({ services: 4, healthy: 1, degraded: 1, failing: 1, unknown: 1 });
  });
});
