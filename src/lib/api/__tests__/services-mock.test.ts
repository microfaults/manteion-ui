/**
 * The mock kill switch must do what the backend does: disable every enabled
 * rule of the instance's service. Instances report their service's enabled
 * rules, so the panel's count matches what the kill switch disables. Vitest
 * pins VITE_USE_MOCK=false, so the mock functions are called directly; each
 * test loads fresh copies of the rule and instance stores.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Services = typeof import("../services");
type Rules = typeof import("../rules");
type Engine = typeof import("../mock-experiments");

let s: Services;
let r: Rules;
let m: Engine;

beforeEach(async () => {
  vi.resetModules();
  s = await import("../services");
  r = await import("../rules");
  m = await import("../mock-experiments");
});

const INSTANCES = [
  "prod-cat-sdk-a1b2c",
  "prod-cat-sdk-d3e4f",
  "checkout-sdk-g5h6i",
  "cart-sdk-j7k8l",
  "payment-sdk-m9n0o",
  "recommendation-sdk-p1q2r",
];

describe("mock kill switch", () => {
  it("reports the enabled rules of the instance's service as active", () => {
    expect(s.mockSDKInstanceDetail("prod-cat-sdk-a1b2c").active_rule_ids).toEqual([
      "rule-001",
      "rule-014",
    ]);
    for (const id of INSTANCES) {
      const d = s.mockSDKInstanceDetail(id);
      for (const ruleId of d.active_rule_ids) {
        const rule = r.mockRuleById(ruleId);
        expect(rule?.service).toBe(d.service);
        expect(rule?.enabled).toBe(true);
      }
    }
  });

  it("disables every enabled rule of the service and leaves it with none active", () => {
    const res = s.mockKillSwitch("prod-cat-sdk-a1b2c");
    expect(res.disabled_rule_ids).toEqual(["rule-001", "rule-014"]);
    expect(r.mockRuleById("rule-001")?.enabled).toBe(false);
    expect(r.mockRuleById("rule-014")?.enabled).toBe(false);
    expect(s.mockSDKInstanceDetail("prod-cat-sdk-a1b2c").active_rule_ids).toEqual([]);
    // It acts on the whole service, so the other instance has none either.
    expect(s.mockSDKInstanceDetail("prod-cat-sdk-d3e4f").active_rule_ids).toEqual([]);
    // Other services keep their rules.
    expect(r.mockRuleById("rule-003")?.enabled).toBe(true);
  });

  it("disables nothing a second time", () => {
    s.mockKillSwitch("prod-cat-sdk-a1b2c");
    expect(s.mockKillSwitch("prod-cat-sdk-a1b2c").disabled_rule_ids).toEqual([]);
  });
});

describe("mock instance detail", () => {
  it("links recent phases that exist in the fixtures", () => {
    for (const id of INSTANCES) {
      const recent = s.mockSDKInstanceDetail(id).recent_run_ids;
      expect(recent.length).toBeGreaterThan(0);
      for (const phaseId of recent) expect(m.mockPhaseDetail(phaseId).id).toBe(phaseId);
    }
  });

  it("stamps poll times when read, so a status never contradicts its last poll", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
      const ageSec = (id: string) =>
        (Date.now() - Date.parse(s.mockSDKInstanceDetail(id).last_poll_at ?? "")) / 1000;
      expect(ageSec("prod-cat-sdk-a1b2c")).toBeLessThan(10);
      expect(ageSec("prod-cat-sdk-d3e4f")).toBeGreaterThan(30);
      expect(ageSec("cart-sdk-j7k8l")).toBeGreaterThan(300);
      expect(s.mockSDKInstanceDetail("prod-cat-sdk-a1b2c").last_poll_at).toBe(
        "2026-11-16T11:59:58Z",
      );

      // An hour later the alive instance has still just polled.
      vi.setSystemTime(new Date("2026-11-16T13:00:00Z"));
      expect(ageSec("prod-cat-sdk-a1b2c")).toBeLessThan(10);
    } finally {
      vi.useRealTimers();
    }
  });
});
