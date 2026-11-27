import {
  type RuleTarget,
  TargetBadge,
  deriveTarget,
  ruleSubtitle,
  specLookup,
} from "@/components/rules/target-badge";
import type { Rule } from "@/types/api";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const BASE: Pick<
  Rule,
  "created_at" | "updated_at" | "name" | "service" | "enabled" | "priority" | "mode"
> = {
  name: "test",
  service: "svc",
  enabled: true,
  priority: 50,
  mode: "inline",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("TargetBadge", () => {
  const targets: RuleTarget[] = ["inline", "network", "resource"];

  it.each(targets)("renders label for %s", (target) => {
    render(<TargetBadge target={target} />);
    expect(screen.getByText(target)).toBeTruthy();
  });
});

describe("deriveTarget", () => {
  it("reads _target label when present", () => {
    const rule = {
      ...BASE,
      id: "r",
      action: { type: "fault_spec", fault_spec_id: "spec-123" },
      match: { labels: { _target: "network" } },
    } as Rule;
    expect(deriveTarget(rule)).toBe("network");
  });

  it("derives network from fault_spec_id prefix", () => {
    const rule = {
      ...BASE,
      id: "r",
      action: { type: "fault_spec", fault_spec_id: "network:RST toxic" },
    } as Rule;
    expect(deriveTarget(rule)).toBe("network");
  });

  it("derives resource from fault_spec_id prefix", () => {
    const rule = {
      ...BASE,
      id: "r",
      action: { type: "fault_spec", fault_spec_id: "resource:cpu 80%" },
    } as Rule;
    expect(deriveTarget(rule)).toBe("resource");
  });

  it("defaults to inline when no _target label and no recognized prefix", () => {
    const rule = {
      ...BASE,
      id: "r",
      action: { type: "fault_spec", fault_spec_id: "spec-abc123" },
    } as Rule;
    expect(deriveTarget(rule)).toBe("inline");
  });

  it("defaults to inline when no fault ids", () => {
    const rule = {
      ...BASE,
      id: "r",
      action: { type: "fault_spec", fault_spec_id: "" },
    } as Rule;
    expect(deriveTarget(rule)).toBe("inline");
  });
});

describe("ruleSubtitle", () => {
  it("extracts description from descriptive fault_spec_id", () => {
    const rule = {
      ...BASE,
      id: "r",
      action: { type: "fault_spec", fault_spec_id: "inline:http-error" },
      match: { labels: { _target: "inline" } },
    } as Rule;
    expect(ruleSubtitle(rule)).toBe("inline · http-error");
  });

  it("formats network fault_spec_id", () => {
    const rule = {
      ...BASE,
      id: "r",
      action: { type: "fault_spec", fault_spec_id: "network:RST toxic" },
      match: { labels: { _target: "network" } },
    } as Rule;
    expect(ruleSubtitle(rule)).toBe("network · RST toxic");
  });

  it("truncates opaque fault_spec_id", () => {
    const rule = {
      ...BASE,
      id: "r",
      action: { type: "fault_spec", fault_spec_id: "spec-aa7eec0d7ff2bc00" },
      match: { labels: { _target: "inline" } },
    } as Rule;
    const sub = ruleSubtitle(rule);
    expect(sub.startsWith("inline · ")).toBe(true);
    expect(sub.length).toBeLessThanOrEqual("inline · spec-aa7eec0d7ff2bc00".length + 1);
  });
});

describe("ruleSubtitle for cache-box rules", () => {
  const cacheRule = (mode: "replay" | "passthrough") =>
    ({
      ...BASE,
      id: "r",
      action: { type: "cachebox", cachebox: { mode, key_strategy: "exact" } },
      match: {},
    }) as Rule;

  it("names the mode, not the target twice", () => {
    expect(ruleSubtitle(cacheRule("replay"))).toBe("cachebox · replay");
    expect(ruleSubtitle(cacheRule("passthrough"))).toBe("cachebox · passthrough");
    expect(ruleSubtitle(cacheRule("replay"))).not.toBe("cachebox · cachebox");
  });
});

describe("with the fault library (VM1 ids are opaque)", () => {
  const specs = specLookup([
    {
      id: "spec-019fd79e-01d8-771f-9b45-60555cfd0a97",
      name: "exp1-cpu-spike",
      category: "resource",
    },
  ]);
  const rule = (fault_spec_id: string, labels?: Record<string, string>) =>
    ({
      ...BASE,
      id: "r",
      action: { type: "fault_spec", fault_spec_id },
      match: labels ? { labels } : {},
    }) as Rule;

  it("takes category and name from the resolved spec", () => {
    const r = rule("spec-019fd79e-01d8-771f-9b45-60555cfd0a97");
    expect(deriveTarget(r, specs)).toBe("resource");
    expect(ruleSubtitle(r, specs)).toBe("resource · exp1-cpu-spike");
  });

  it("the spec's category wins over a stale _target label", () => {
    expect(
      deriveTarget(rule("spec-019fd79e-01d8-771f-9b45-60555cfd0a97", { _target: "inline" }), specs),
    ).toBe("resource");
  });

  it("falls back to the old heuristics when the spec does not resolve", () => {
    expect(deriveTarget(rule("spec-unknown"), specs)).toBe("inline");
    expect(ruleSubtitle(rule("spec-unknown"), specs)).toBe("inline · spec-unknown");
  });
});
