import { GrafanaPanel } from "@/components/observability/grafana-panel";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("GrafanaPanel without an iframe src", () => {
  it("explains that embedding is off when a Grafana link exists, instead of claiming no panel is configured", () => {
    render(
      <GrafanaPanel
        title="p99 latency"
        grafanaUrl="http://localhost:3300/d/atropos-overview?viewPanel=5"
      />,
    );
    expect(screen.getByText(/embedding is off/i)).toBeTruthy();
    expect(screen.queryByText(/no panel configured/i)).toBeNull();
    expect(screen.getByRole("link", { name: /grafana/i }).getAttribute("href")).toContain(
      "viewPanel=5",
    );
  });

  it("still says no panel is configured when there is nothing to link to", () => {
    render(<GrafanaPanel title="Cache-box hit rate" />);
    expect(screen.getByText(/no panel configured/i)).toBeTruthy();
  });
});
