import type { FaultCategory, FaultSpec } from "@/types/api";

// ─── Sub-type definitions ──────────────────────────────────────────────

export const INLINE_TYPES = [
  {
    value: "latency",
    label: "latency",
    description: "Add sleep before response. Supports jitter.",
  },
  {
    value: "error",
    label: "http-error",
    description: "Return a status code without calling downstream.",
  },
  { value: "hang", label: "hang", description: "Never return. Requires caller timeout." },
] as const;

export const NETWORK_TYPES = [
  { value: "blackhole", label: "blackhole", description: "Drop all traffic on a stream." },
  {
    value: "retransmit-delay",
    label: "retransmit-delay",
    description: "Delay retransmissions at a given rate.",
  },
  { value: "rst", label: "rst", description: "Send TCP reset on each connection." },
  { value: "throttle", label: "throttle", description: "Limit bandwidth to a fixed rate." },
  { value: "latency", label: "latency", description: "Add network-layer latency with jitter." },
  { value: "drip", label: "drip", description: "Slow-drip data at a fixed byte rate." },
] as const;

export const RESOURCE_TYPES = [
  { value: "cpu", label: "cpu", description: "Burn CPU at a target load fraction." },
  { value: "memory", label: "memory", description: "Allocate memory to a target load fraction." },
  { value: "disk", label: "disk", description: "Sustained disk writes at a fixed rate." },
  { value: "io", label: "io", description: "Stress file I/O with concurrent workers." },
] as const;

export const DEFAULT_FAULT_TYPE: Record<FaultCategory, string> = {
  inline: "latency",
  network: "blackhole",
  resource: "cpu",
};

// ─── Config state ─────────────────────────────────────────────────────

export interface ConfigState {
  // Inline
  latency_ms: number;
  jitter_ms: number;
  status_code: number;
  error_message: string;
  hang_duration_s: number;

  // Network — proxy config (shared across all network toxics)
  net_direction: "upstream" | "downstream";
  net_scope: number;
  net_listen: string;
  net_upstream: string;

  // Network — per-toxic fields
  retransmit_rate: number;
  retransmit_delay: string;
  retransmit_reset_threshold: number;
  interval_s: number;
  rate_kbps: number;
  rate_bytes_s: number;

  // Resource — CPU
  cpu_target_load: number;
  cpu_window: string;

  // Resource — Memory
  mem_target_load: number;
  mem_chunk_size: number;
  mem_thrashing: boolean;
  mem_thrash_workers: number;

  // Resource — Disk
  disk_write_rate: number;
  disk_max_usage: number;
  disk_chunk_size: number;
  disk_path: string;

  // Resource — IO
  io_read_rate: number;
  io_file_size: number;
  io_file_count: number;
  io_workers: number;
  io_path: string;
  io_mode: "read" | "write" | "readwrite";
}

export const defaultConfig = (): ConfigState => ({
  latency_ms: 250,
  jitter_ms: 50,
  status_code: 500,
  error_message: "",
  hang_duration_s: 30,

  net_direction: "downstream",
  net_scope: 1.0,
  net_listen: "",
  net_upstream: "",

  retransmit_rate: 0.1,
  retransmit_delay: "1s",
  retransmit_reset_threshold: 3,
  interval_s: 5,
  rate_kbps: 100,
  rate_bytes_s: 1024,

  cpu_target_load: 0.8,
  cpu_window: "10s",

  mem_target_load: 0.5,
  mem_chunk_size: 1048576,
  mem_thrashing: false,
  mem_thrash_workers: 2,

  disk_write_rate: 10485760,
  disk_max_usage: 104857600,
  disk_chunk_size: 4096,
  disk_path: "/tmp/atropos-disk",

  io_read_rate: 10485760,
  io_file_size: 1048576,
  io_file_count: 10,
  io_workers: 4,
  io_path: "/tmp/atropos-io",
  io_mode: "readwrite",
});

export function configFromSpec(spec: FaultSpec): ConfigState {
  const state = defaultConfig();
  const c = spec.params as Record<string, unknown> | null | undefined;
  if (!c) return state;
  const num = (k: string, fallback: number) => (c[k] != null ? Number(c[k]) : fallback);
  const str = <T extends string>(k: string, fallback: T): T =>
    (c[k] != null ? String(c[k]) : fallback) as T;
  const bool = (k: string, fallback: boolean): boolean => (c[k] != null ? Boolean(c[k]) : fallback);

  switch (spec.fault_type) {
    case "latency":
      return { ...state, latency_ms: num("latency_ms", 250), jitter_ms: num("jitter_ms", 50) };
    case "error":
      return { ...state, status_code: num("status_code", 500), error_message: str("message", "") };
    case "hang":
      return { ...state, hang_duration_s: spec.duration_ms ? spec.duration_ms / 1000 : 30 };
    case "blackhole":
      return {
        ...state,
        net_direction: str("direction", state.net_direction),
        net_scope: num("scope", state.net_scope),
        net_listen: str("listen", state.net_listen),
        net_upstream: str("upstream", state.net_upstream),
      };
    case "retransmit-delay":
      return {
        ...state,
        retransmit_rate: num("rate", state.retransmit_rate),
        retransmit_delay: str("delay", state.retransmit_delay),
        retransmit_reset_threshold: num("reset_threshold", state.retransmit_reset_threshold),
        net_direction: str("direction", state.net_direction),
        net_scope: num("scope", state.net_scope),
        net_listen: str("listen", state.net_listen),
        net_upstream: str("upstream", state.net_upstream),
      };
    case "rst":
      return {
        ...state,
        interval_s: num("interval_s", 5),
        net_direction: str("direction", state.net_direction),
        net_scope: num("scope", state.net_scope),
        net_listen: str("listen", state.net_listen),
        net_upstream: str("upstream", state.net_upstream),
      };
    case "throttle":
      return {
        ...state,
        rate_kbps: num("rate_kbps", 100),
        net_direction: str("direction", state.net_direction),
        net_scope: num("scope", state.net_scope),
        net_listen: str("listen", state.net_listen),
        net_upstream: str("upstream", state.net_upstream),
      };
    case "drip":
      return {
        ...state,
        rate_bytes_s: num("rate_bytes_s", 1024),
        net_direction: str("direction", state.net_direction),
        net_scope: num("scope", state.net_scope),
        net_listen: str("listen", state.net_listen),
        net_upstream: str("upstream", state.net_upstream),
      };
    case "cpu":
      return {
        ...state,
        cpu_target_load: num("target_load", state.cpu_target_load),
        cpu_window: str("window", state.cpu_window),
      };
    case "memory":
      return {
        ...state,
        mem_target_load: num("target_load", state.mem_target_load),
        mem_chunk_size: num("chunk_size", state.mem_chunk_size),
        mem_thrashing: bool("thrashing", state.mem_thrashing),
        mem_thrash_workers: num("thrash_workers", state.mem_thrash_workers),
      };
    case "disk":
      return {
        ...state,
        disk_write_rate: num("write_rate", state.disk_write_rate),
        disk_max_usage: num("max_disk_usage", state.disk_max_usage),
        disk_chunk_size: num("chunk_size", state.disk_chunk_size),
        disk_path: str("path", state.disk_path),
      };
    case "io":
      return {
        ...state,
        io_read_rate: num("read_rate", state.io_read_rate),
        io_file_size: num("file_size", state.io_file_size),
        io_file_count: num("file_count", state.io_file_count),
        io_workers: num("workers", state.io_workers),
        io_path: str("path", state.io_path),
        io_mode: str("mode", state.io_mode),
      };
    default:
      return state;
  }
}

export function buildConfig(category: FaultCategory, faultType: string, s: ConfigState): unknown {
  if (category === "inline") {
    switch (faultType) {
      case "latency":
        return { latency_ms: s.latency_ms, jitter_ms: s.jitter_ms };
      case "error": {
        const out: Record<string, unknown> = { status_code: s.status_code };
        if (s.error_message) out.message = s.error_message;
        return out;
      }
      case "hang":
        return {};
      default:
        return {};
    }
  }

  if (category === "network") {
    const proxy: Record<string, unknown> = {
      direction: s.net_direction,
      scope: s.net_scope,
    };
    if (s.net_listen) proxy.listen = s.net_listen;
    if (s.net_upstream) proxy.upstream = s.net_upstream;

    switch (faultType) {
      case "blackhole":
        return proxy;
      case "retransmit-delay":
        return {
          ...proxy,
          rate: s.retransmit_rate,
          delay: s.retransmit_delay,
          reset_threshold: s.retransmit_reset_threshold,
        };
      case "rst":
        return { ...proxy, interval_s: s.interval_s };
      case "throttle":
        return { ...proxy, rate_kbps: s.rate_kbps };
      case "latency":
        return { ...proxy, latency_ms: s.latency_ms, jitter_ms: s.jitter_ms };
      case "drip":
        return { ...proxy, rate_bytes_s: s.rate_bytes_s };
      default:
        return proxy;
    }
  }

  // Resource
  switch (faultType) {
    case "cpu":
      return { target_load: s.cpu_target_load, window: s.cpu_window };
    case "memory": {
      const out: Record<string, unknown> = {
        target_load: s.mem_target_load,
        chunk_size: s.mem_chunk_size,
      };
      if (s.mem_thrashing) {
        out.thrashing = true;
        out.thrash_workers = s.mem_thrash_workers;
      }
      return out;
    }
    case "disk": {
      const out: Record<string, unknown> = {
        write_rate: s.disk_write_rate,
        chunk_size: s.disk_chunk_size,
        max_disk_usage: s.disk_max_usage,
      };
      if (s.disk_path) out.path = s.disk_path;
      return out;
    }
    case "io": {
      const out: Record<string, unknown> = {
        read_rate: s.io_read_rate,
        file_size: s.io_file_size,
        file_count: s.io_file_count,
        workers: s.io_workers,
        mode: s.io_mode,
      };
      if (s.io_path) out.path = s.io_path;
      return out;
    }
    default:
      return {};
  }
}
