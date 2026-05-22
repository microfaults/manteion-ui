import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a count + noun. 1 → "1 rule", 2 → "2 rules". */
export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return `1 ${singular}`;
  return `${count.toLocaleString()} ${plural ?? `${singular}s`}`;
}

/** Format microseconds as a compact latency string. */
export function formatLatencyUs(us: number | null | undefined): string {
  if (us == null) return "—";
  if (us < 1000) return `${Math.round(us)}µs`;
  const ms = us / 1000;
  if (ms < 10) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format milliseconds as a short duration: "1h 12m", "4m 12s", "18s". */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

/** Bytes → short human string: "0 B", "184 B", "1.2 KB", "43 KB". */
export function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** TTL seconds → human string; 0 / null means no expiry. */
export function formatTtl(ttlS: number | null | undefined): string {
  if (!ttlS || ttlS <= 0) return "no expiry";
  if (ttlS % 86400 === 0) return `${ttlS / 86400}d`;
  if (ttlS % 3600 === 0) return `${ttlS / 3600}h`;
  if (ttlS % 60 === 0) return `${ttlS / 60}m`;
  return `${ttlS}s`;
}

/** Relative "N minutes ago" style timestamp. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
