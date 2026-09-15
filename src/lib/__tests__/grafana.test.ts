import { grafanaDashboardUrl, grafanaPanelSrc } from "@/lib/grafana";
import { describe, expect, it } from "vitest";

const window = { from: "2026-09-12T19:41:00Z", to: "2026-09-12T19:44:30Z" };

describe("grafana links", () => {
  it("deep-links the dashboard pinned to the experiment window", () => {
    const url = grafanaDashboardUrl("http://localhost:3300/", "p99-latency", window);
    expect(url).toBe(
      `http://localhost:3300/d/atropos-overview?orgId=1&viewPanel=5&from=${Date.parse(window.from)}&to=${Date.parse(window.to)}`,
    );
    expect(grafanaDashboardUrl(undefined, "p99-latency")).toBeUndefined();
  });

  it("only builds an iframe src when embedding is allowed — VM1's Grafana answers X-Frame-Options: deny", () => {
    expect(grafanaPanelSrc("http://localhost:3300", "requests-sec", window, false)).toBeUndefined();
    expect(grafanaPanelSrc("http://localhost:3300", "requests-sec", window, true)).toMatch(
      /^http:\/\/localhost:3300\/d-solo\/atropos-overview\?orgId=1&panelId=3&theme=dark&from=\d+&to=\d+$/,
    );
    expect(
      grafanaPanelSrc("http://localhost:3300", "cache-hit-rate", window, true),
    ).toBeUndefined();
  });
});
