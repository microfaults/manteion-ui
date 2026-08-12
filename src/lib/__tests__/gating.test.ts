import { experimentCreateGate } from "@/lib/gating";
import { describe, expect, it } from "vitest";

describe("experimentCreateGate", () => {
  it("blocks while workflows are loading", () => {
    const gate = experimentCreateGate({ status: "loading", count: 0 });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("workflows-loading");
  });

  it("blocks (fail-safe) when the workflow list cannot be fetched", () => {
    const gate = experimentCreateGate({ status: "error", count: 0 });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("workflows-unknown");
    expect(gate.message).toMatch(/workflow/i);
  });

  it("blocks with create-a-workflow-first guidance when zero workflows exist", () => {
    const gate = experimentCreateGate({ status: "ready", count: 0 });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("no-workflows");
    expect(gate.message).toMatch(/create a workflow first/i);
  });

  it("still blocks when workflows exist but the backend create endpoint is not wired", () => {
    const gate = experimentCreateGate({ status: "ready", count: 3 });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("backend-missing");
  });

  it("allows creation when workflows exist and the backend supports create", () => {
    const gate = experimentCreateGate(
      { status: "ready", count: 1 },
      { backendSupportsCreate: true },
    );
    expect(gate).toEqual({ allowed: true, reason: "ok", message: "" });
  });

  it("workflow prerequisite wins over the backend flag when both would block", () => {
    const gate = experimentCreateGate(
      { status: "ready", count: 0 },
      { backendSupportsCreate: true },
    );
    expect(gate.reason).toBe("no-workflows");
  });
});
