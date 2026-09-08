import { PhasePill } from "@/components/phase-pill";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("PhasePill", () => {
  it("colors free-form isolation-* names with the isolation family", () => {
    render(<PhasePill name="isolation-productcatalog" status="completed" />);
    expect(screen.getByRole("img").className).toContain("bg-phase-isolation");
  });

  it("overrides the family color for paused so it reads as halted", () => {
    render(<PhasePill name="isolation-productcatalog" status="paused" />);
    expect(screen.getByRole("img").className).toContain("bg-status-degraded");
  });

  it("renders skipped muted like a not-run phase", () => {
    render(<PhasePill name="combined" status="skipped" />);
    expect(screen.getByRole("img").className).toContain("bg-phase-pending");
  });
});

describe("PhasePill draining", () => {
  it("renders draining with the degraded color and a pulse (frozen services flushing)", () => {
    render(<PhasePill name="isolation-cartservice" status="draining" />);
    const el = screen.getByRole("img");
    expect(el.className).toContain("bg-status-degraded");
    expect(el.className).toContain("animate-pulse");
    expect(el.getAttribute("aria-label")).toBe("isolation-cartservice — draining");
  });
});
