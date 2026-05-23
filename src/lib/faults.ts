import type { FaultSpec } from "@/types/api";

/** Returns a human-readable one-line summary of a fault spec's parameters,
 *  matching the PARAMS column format in the design. */
export function formatParams(spec: FaultSpec): string {
  const cfg = spec.params as Record<string, unknown> | null | undefined;
  const get = (k: string): number => Number(cfg?.[k] ?? 0);
  const getStr = (k: string): string => String(cfg?.[k] ?? "");

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
      const dir = getStr("direction") || "downstream";
      return `drop ${dir}`;
    }
    case "retransmit-delay":
      return `retransmit rate ${get("rate")} delay ${getStr("delay")}`;
    case "rst":
      return `rst every ${get("interval_s")}s - TCP proxy`;
    case "throttle":
      return `throttle ${get("rate_kbps")} kbps`;
    case "drip":
      return `drip ${get("rate_bytes_s")} B/s`;

    // Resource
    case "cpu":
      return `cpu ${(get("target_load") * 100).toFixed(0)}% · window ${getStr("window")}`;
    case "memory": {
      const pct = (get("target_load") * 100).toFixed(0);
      const thrash = cfg?.thrashing ? " · thrashing" : "";
      return `memory ${pct}%${thrash}`;
    }
    case "disk":
      return `disk write ${get("write_rate")} B/s · max ${get("max_disk_usage")} bytes`;
    case "io":
      return `io ${getStr("mode")} · ${get("workers")} workers`;

    default:
      return spec.fault_type;
  }
}
