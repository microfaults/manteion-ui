import {
  type RuleTarget,
  TargetBadge,
  deriveTarget,
  ruleSubtitle,
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
