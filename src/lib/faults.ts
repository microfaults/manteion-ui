import type { FaultSpec } from "@/types/api";

/** Returns a human-readable one-line summary of a fault spec's parameters,
 *  matching the PARAMS column format in the design. Param names follow the
 *  fault catalog (GET /api/v1/faults/catalog) — durations are Go duration
 *  strings ("250ms"), byte sizes/rates plain integers. */
export function formatParams(spec: FaultSpec): string {
  const cfg = spec.params as Record<string, unknown> | null | undefined;
  const get = (k: string): number => Number(cfg?.[k] ?? 0);
  const getStr = (k: string): string => String(cfg?.[k] ?? "");

  switch (spec.fault_type) {
    // Inline + network latency share {delay, jitter?} duration strings.
    case "latency": {
      const jitter = getStr("jitter");
      return `latency ${getStr("delay") || "?"}${jitter ? ` ± ${jitter}` : ""}`;
    }
    case "error":
      return `status ${get("status_code") || 500} - deterministic`;
    case "hang":
      return `hang ${getStr("duration") || "?"}`;

    // Network — the placement envelope lives on spec.network, not params.
    case "blackhole": {
      const dir = spec.network?.direction;
      return dir ? `drop ${dir}` : "drop all";
    }
    case "retransmit_delay":
      return `retransmit rate ${get("rate")} delay ${getStr("delay") || "200ms"}`;
    case "rst": {
      const parts: string[] = [];
      if (get("after_bytes") > 0) parts.push(`after ${get("after_bytes")} B`);
      if (getStr("after_duration")) parts.push(`after ${getStr("after_duration")}`);
      return parts.length > 0 ? `rst ${parts.join(" · ")}` : "rst immediate";
    }
    case "throttle":
      return `throttle ${get("bytes_per_sec")} B/s`;
    case "drip": {
      const interval = getStr("interval");
      return `drip ${get("chunk_size") || 1} B${interval ? ` every ${interval}` : ""}`;
    }

    // Resource
    case "cpu": {
      const window = getStr("window") || "100ms";
      return `cpu ${(get("target_load") * 100).toFixed(0)}% · window ${window}`;
    }
    case "memory": {
      const pct = (get("target_load") * 100).toFixed(0);
      const thrash = cfg?.thrashing ? " · thrashing" : "";
      return `memory ${pct}%${thrash}`;
    }
    case "disk":
      return `disk write ${get("write_rate")} B/s · max ${get("max_disk_usage")} bytes`;
    case "io":
      return `io ${getStr("mode") || "read"} · ${get("workers") || 4} workers`;

    default:
      return spec.fault_type;
  }
}
