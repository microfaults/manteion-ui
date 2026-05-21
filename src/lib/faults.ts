import type { FaultSpec } from "@/types/api";

/** Returns a human-readable one-line summary of a fault spec's parameters,
 *  matching the PARAMS column format in the design. */
export function formatParams(spec: FaultSpec): string {
  const cfg = spec.params as Record<string, unknown> | null | undefined;
  const get = (k: string): number => Number(cfg?.[k] ?? 0);

  switch (spec.fault_type) {
    // Inline
    case "latency":
      if (spec.category === "inline") {
        return `latency ${get("latency_ms")}ms ± ${get("jitter_ms")}ms`;
      }
      return `latency ${get("latency_ms")}ms ± ${get("jitter_ms")}ms`;
    case "error":
      return `status ${get("status_code")} - deterministic`;
    case "hang": {
      const durS = spec.duration_ms ? spec.duration_ms / 1000 : 0;
      return `sleep ${durS}s`;
    }

    // Network
    case "blackhole": {
      const dir = String(cfg?.direction ?? "inbound");
      return `drop ${dir}`;
    }
    case "loss":
      return `packet loss ${get("percent")}%`;
    case "rst":
      return `rst every ${get("interval_s")}s - TCP proxy`;
    case "throttle":
      return `throttle ${get("rate_kbps")} kbps`;
    case "drip":
      return `drip ${get("rate_bytes_s")} B/s`;

    // Resource
    case "cpu":
      return `cpu ${get("percent")}% · ${get("cores")} cores`;
    case "memory":
      return `memory ${get("size_mb")} MiB`;
    case "io":
      return `io ${get("rate_mbps")} MiB/s`;

    default:
      return spec.fault_type;
  }
}
