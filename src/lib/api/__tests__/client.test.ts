import { ApiClient } from "@/lib/api/client";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** A client whose fetch records each request and answers 200 `{}`. */
function recordingClient() {
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  const client = new ApiClient({
    baseUrl: "http://manteion.test",
    environment: "online-boutique",
    fetch: fetchMock as unknown as typeof fetch,
  });
  const headersOf = (call: number) => new Headers(fetchMock.mock.calls[call]?.[1]?.headers);
  return { client, fetchMock, headersOf };
}

describe("ApiClient headers", () => {
  it("sends no Content-Type on a GET, so a cross-origin read needs no preflight", async () => {
    const { client, headersOf } = recordingClient();
    await client.get("/api/v1/rules", z.unknown());
    expect(headersOf(0).has("Content-Type")).toBe(false);
    expect(headersOf(0).get("Accept")).toBe("application/json");
    expect(headersOf(0).get("X-Faults-Lab-Environment")).toBe("online-boutique");
  });

  it("sends no Content-Type on a bodiless DELETE", async () => {
    const { client, headersOf } = recordingClient();
    await client.del("/api/v1/rules/rule-1");
    expect(headersOf(0).has("Content-Type")).toBe(false);
  });

  it("sends Content-Type application/json with a JSON body", async () => {
    const { client, fetchMock, headersOf } = recordingClient();
    await client.post("/api/v1/rules", { name: "r" }, z.unknown());
    expect(headersOf(0).get("Content-Type")).toBe("application/json");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ name: "r" }));
  });
});
