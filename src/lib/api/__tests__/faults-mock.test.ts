/**
 * Mock-mode parity: with VITE_USE_MOCK=true the fault spec client keeps a
 * mutable in-memory store, so create, update and delete work without a
 * backend and reads see the result. Loaded with fresh modules so the env flag
 * applies and each test starts from the fixture list.
 */
import type { FaultSpecInput } from "@/lib/api/faults";
import { afterEach, describe, expect, it, vi } from "vitest";

type FaultsApi = typeof import("@/lib/api/faults");

/** Reports whether err is a 404 from the client's ApiError (shape-checked,
 *  since resetModules gives each test its own ApiError class). */
function isNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === "ApiError" &&
    (err as Error & { status?: unknown }).status === 404
  );
}

/** Spies on fetch before the module loads: the api client binds fetch at
 *  construction, so a spy added afterwards would never see its calls. */
function spyOnFetch() {
  return vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch called in mock mode"));
}

async function loadMockApi(): Promise<FaultsApi> {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MOCK", "true");
  return import("@/lib/api/faults");
}

const input: FaultSpecInput = {
  name: "latency 250ms",
  category: "inline",
  fault_type: "latency",
  params: { delay: "250ms" },
  description: "demo spec",
  duration_ms: 30000,
};

describe("fault spec mutations in mock mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("createFaultSpec returns a new spec with the input's fields and lists it", async () => {
    const fetchSpy = spyOnFetch();
    const api = await loadMockApi();
    const before = await api.listFaultSpecs();

    const created = await api.createFaultSpec(input);

    expect(created).toMatchObject(input);
    expect(created.id).toMatch(/^spec-inline-latency-/);
    expect(before.map((s) => s.id)).not.toContain(created.id);
    const after = await api.listFaultSpecs();
    expect(after).toHaveLength(before.length + 1);
    expect(after.find((s) => s.id === created.id)).toEqual(created);
    expect(api.mockFaultSpecById(created.id)).toEqual(created);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("updateFaultSpec changes the spec and getFaultSpec returns the new values", async () => {
    const fetchSpy = spyOnFetch();
    const api = await loadMockApi();
    const original = await api.getFaultSpec("spec-inline-latency-100ms");

    const updated = await api.updateFaultSpec(original.id, input);

    expect(updated).toMatchObject({ ...input, id: original.id, created_at: original.created_at });
    expect(await api.getFaultSpec(original.id)).toEqual(updated);
    expect(api.mockFaultSpecById(original.id)).toEqual(updated);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("deleteFaultSpec removes the spec and getFaultSpec then rejects with a 404", async () => {
    const fetchSpy = spyOnFetch();
    const api = await loadMockApi();

    await api.deleteFaultSpec("spec-network-rst");

    const err = await api.getFaultSpec("spec-network-rst").catch((e: unknown) => e);
    expect(isNotFound(err)).toBe(true);
    expect((await api.listFaultSpecs()).map((s) => s.id)).not.toContain("spec-network-rst");
    expect(api.mockFaultSpecById("spec-network-rst")).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("update and delete of an unknown id reject like a missing id on read", async () => {
    const fetchSpy = spyOnFetch();
    const api = await loadMockApi();

    for (const call of [
      () => api.getFaultSpec("spec-missing"),
      () => api.updateFaultSpec("spec-missing", input),
      () => api.deleteFaultSpec("spec-missing"),
    ]) {
      const err = await call().catch((e: unknown) => e);
      expect(isNotFound(err)).toBe(true);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
