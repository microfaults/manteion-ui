import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { FaultCategory } from "@/types/api";
import type { ConfigState } from "./config-state";

// ─── Props ────────────────────────────────────────────────────────────

interface ConfigFieldsProps {
  category: FaultCategory;
  faultType: string;
  cfg: ConfigState;
  onChange: (patch: Partial<ConfigState>) => void;
}

// ─── Main component ──────────────────────────────────────────────────

export function ConfigFields({ category, faultType, cfg, onChange }: ConfigFieldsProps) {
  if (category === "inline")
    return <InlineFields faultType={faultType} cfg={cfg} onChange={onChange} />;
  if (category === "network")
    return <NetworkFields faultType={faultType} cfg={cfg} onChange={onChange} />;
  return <ResourceFields faultType={faultType} cfg={cfg} onChange={onChange} />;
}

// ─── Inline ──────────────────────────────────────────────────────────

function InlineFields({
  faultType,
  cfg,
  onChange,
}: { faultType: string; cfg: ConfigState; onChange: ConfigFieldsProps["onChange"] }) {
  if (faultType === "latency") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latency (ms)" htmlFor="fe-lat-ms">
          <Input
            id="fe-lat-ms"
            type="number"
            min={0}
            value={cfg.latency_ms}
            onChange={(e) => onChange({ latency_ms: Number(e.target.value) })}
          />
        </Field>
        <Field label="Jitter ± (ms)" htmlFor="fe-jitter-ms">
          <Input
            id="fe-jitter-ms"
            type="number"
            min={0}
            value={cfg.jitter_ms}
            onChange={(e) => onChange({ jitter_ms: Number(e.target.value) })}
          />
        </Field>
      </div>
    );
  }
  if (faultType === "error") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status code" htmlFor="fe-status">
            <Input
              id="fe-status"
              type="number"
              min={100}
              max={599}
              value={cfg.status_code}
              onChange={(e) => onChange({ status_code: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Field label="Response body" htmlFor="fe-error-msg">
          <Input
            id="fe-error-msg"
            value={cfg.error_message}
            onChange={(e) => onChange({ error_message: e.target.value })}
            placeholder="Service temporarily unavailable"
          />
        </Field>
      </div>
    );
  }
  if (faultType === "hang") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Duration (s)" htmlFor="fe-hang-dur">
          <Input
            id="fe-hang-dur"
            type="number"
            min={1}
            value={cfg.hang_duration_s}
            onChange={(e) => onChange({ hang_duration_s: Number(e.target.value) })}
          />
        </Field>
      </div>
    );
  }
  return null;
}

// ─── Network ─────────────────────────────────────────────────────────

function NetworkFields({
  faultType,
  cfg,
  onChange,
}: { faultType: string; cfg: ConfigState; onChange: ConfigFieldsProps["onChange"] }) {
  return (
    <div className="space-y-4">
      <NetworkProxyFields cfg={cfg} onChange={onChange} />
      <Separator />
      <NetworkToxicFields faultType={faultType} cfg={cfg} onChange={onChange} />
    </div>
  );
}

function NetworkProxyFields({
  cfg,
  onChange,
}: { cfg: ConfigState; onChange: ConfigFieldsProps["onChange"] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Proxy config</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Direction" htmlFor="fe-net-dir">
          <Select
            value={cfg.net_direction}
            onValueChange={(v) => onChange({ net_direction: v as "upstream" | "downstream" })}
          >
            <SelectTrigger id="fe-net-dir">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upstream">upstream</SelectItem>
              <SelectItem value="downstream">downstream</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Scope (0–1)" htmlFor="fe-net-scope">
          <Input
            id="fe-net-scope"
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={cfg.net_scope}
            onChange={(e) => onChange({ net_scope: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Listen" htmlFor="fe-net-listen">
          <Input
            id="fe-net-listen"
            value={cfg.net_listen}
            onChange={(e) => onChange({ net_listen: e.target.value })}
            placeholder="localhost:0"
            className="font-mono"
          />
        </Field>
        <Field label="Upstream" htmlFor="fe-net-upstream">
          <Input
            id="fe-net-upstream"
            value={cfg.net_upstream}
            onChange={(e) => onChange({ net_upstream: e.target.value })}
            placeholder="host:port"
            className="font-mono"
          />
        </Field>
      </div>
    </div>
  );
}

function NetworkToxicFields({
  faultType,
  cfg,
  onChange,
}: { faultType: string; cfg: ConfigState; onChange: ConfigFieldsProps["onChange"] }) {
  if (faultType === "blackhole") return null;

  if (faultType === "retransmit-delay") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rate (0–1)" htmlFor="fe-rt-rate">
            <Input
              id="fe-rt-rate"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={cfg.retransmit_rate}
              onChange={(e) => onChange({ retransmit_rate: Number(e.target.value) })}
            />
          </Field>
          <Field label="Delay" htmlFor="fe-rt-delay">
            <Input
              id="fe-rt-delay"
              value={cfg.retransmit_delay}
              onChange={(e) => onChange({ retransmit_delay: e.target.value })}
              placeholder="1s"
              className="font-mono"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reset threshold" htmlFor="fe-rt-thresh">
            <Input
              id="fe-rt-thresh"
              type="number"
              min={0}
              value={cfg.retransmit_reset_threshold}
              onChange={(e) => onChange({ retransmit_reset_threshold: Number(e.target.value) })}
            />
          </Field>
        </div>
      </div>
    );
  }

  if (faultType === "rst") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Interval (s)" htmlFor="fe-rst-int">
          <Input
            id="fe-rst-int"
            type="number"
            min={1}
            value={cfg.interval_s}
            onChange={(e) => onChange({ interval_s: Number(e.target.value) })}
          />
        </Field>
      </div>
    );
  }

  if (faultType === "throttle") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rate (kbps)" htmlFor="fe-throttle">
          <Input
            id="fe-throttle"
            type="number"
            min={1}
            value={cfg.rate_kbps}
            onChange={(e) => onChange({ rate_kbps: Number(e.target.value) })}
          />
        </Field>
      </div>
    );
  }

  if (faultType === "latency") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latency (ms)" htmlFor="fe-net-lat">
          <Input
            id="fe-net-lat"
            type="number"
            min={0}
            value={cfg.latency_ms}
            onChange={(e) => onChange({ latency_ms: Number(e.target.value) })}
          />
        </Field>
        <Field label="Jitter ± (ms)" htmlFor="fe-net-jitter">
          <Input
            id="fe-net-jitter"
            type="number"
            min={0}
            value={cfg.jitter_ms}
            onChange={(e) => onChange({ jitter_ms: Number(e.target.value) })}
          />
        </Field>
      </div>
    );
  }

  if (faultType === "drip") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rate (B/s)" htmlFor="fe-drip">
          <Input
            id="fe-drip"
            type="number"
            min={1}
            value={cfg.rate_bytes_s}
            onChange={(e) => onChange({ rate_bytes_s: Number(e.target.value) })}
          />
        </Field>
      </div>
    );
  }

  return null;
}

// ─── Resource ────────────────────────────────────────────────────────

function ResourceFields({
  faultType,
  cfg,
  onChange,
}: { faultType: string; cfg: ConfigState; onChange: ConfigFieldsProps["onChange"] }) {
  if (faultType === "cpu") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target load (0–1)" htmlFor="fe-cpu-load">
          <Input
            id="fe-cpu-load"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={cfg.cpu_target_load}
            onChange={(e) => onChange({ cpu_target_load: Number(e.target.value) })}
          />
        </Field>
        <Field label="Window" htmlFor="fe-cpu-window">
          <Input
            id="fe-cpu-window"
            value={cfg.cpu_window}
            onChange={(e) => onChange({ cpu_window: e.target.value })}
            placeholder="10s"
            className="font-mono"
          />
        </Field>
      </div>
    );
  }

  if (faultType === "memory") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target load (0–1)" htmlFor="fe-mem-load">
            <Input
              id="fe-mem-load"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={cfg.mem_target_load}
              onChange={(e) => onChange({ mem_target_load: Number(e.target.value) })}
            />
          </Field>
          <Field label="Chunk size (bytes)" htmlFor="fe-mem-chunk">
            <Input
              id="fe-mem-chunk"
              type="number"
              min={1}
              value={cfg.mem_chunk_size}
              onChange={(e) => onChange({ mem_chunk_size: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
          <div>
            <Label htmlFor="fe-mem-thrash" className="text-sm font-medium">
              Thrashing
            </Label>
            <p className="text-xs text-muted-foreground">Continuously churn allocated memory</p>
          </div>
          <Switch
            id="fe-mem-thrash"
            checked={cfg.mem_thrashing}
            onCheckedChange={(v) => onChange({ mem_thrashing: v })}
          />
        </div>
        {cfg.mem_thrashing && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Thrash workers" htmlFor="fe-mem-thrash-w">
              <Input
                id="fe-mem-thrash-w"
                type="number"
                min={1}
                value={cfg.mem_thrash_workers}
                onChange={(e) => onChange({ mem_thrash_workers: Number(e.target.value) })}
              />
            </Field>
          </div>
        )}
      </div>
    );
  }

  if (faultType === "disk") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Write rate (B/s)" htmlFor="fe-disk-rate">
            <Input
              id="fe-disk-rate"
              type="number"
              min={1}
              value={cfg.disk_write_rate}
              onChange={(e) => onChange({ disk_write_rate: Number(e.target.value) })}
            />
          </Field>
          <Field label="Max usage (bytes)" htmlFor="fe-disk-max">
            <Input
              id="fe-disk-max"
              type="number"
              min={1}
              value={cfg.disk_max_usage}
              onChange={(e) => onChange({ disk_max_usage: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Chunk size (bytes)" htmlFor="fe-disk-chunk">
            <Input
              id="fe-disk-chunk"
              type="number"
              min={1}
              value={cfg.disk_chunk_size}
              onChange={(e) => onChange({ disk_chunk_size: Number(e.target.value) })}
            />
          </Field>
          <Field label="Path" htmlFor="fe-disk-path">
            <Input
              id="fe-disk-path"
              value={cfg.disk_path}
              onChange={(e) => onChange({ disk_path: e.target.value })}
              placeholder="/tmp/atropos-disk"
              className="font-mono"
            />
          </Field>
        </div>
      </div>
    );
  }

  if (faultType === "io") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mode" htmlFor="fe-io-mode">
            <Select
              value={cfg.io_mode}
              onValueChange={(v) => onChange({ io_mode: v as "read" | "write" | "readwrite" })}
            >
              <SelectTrigger id="fe-io-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">read</SelectItem>
                <SelectItem value="write">write</SelectItem>
                <SelectItem value="readwrite">readwrite</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Read rate (B/s)" htmlFor="fe-io-rate">
            <Input
              id="fe-io-rate"
              type="number"
              min={1}
              value={cfg.io_read_rate}
              onChange={(e) => onChange({ io_read_rate: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="File size (bytes)" htmlFor="fe-io-fsize">
            <Input
              id="fe-io-fsize"
              type="number"
              min={1}
              value={cfg.io_file_size}
              onChange={(e) => onChange({ io_file_size: Number(e.target.value) })}
            />
          </Field>
          <Field label="File count" htmlFor="fe-io-fcount">
            <Input
              id="fe-io-fcount"
              type="number"
              min={1}
              value={cfg.io_file_count}
              onChange={(e) => onChange({ io_file_count: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Workers" htmlFor="fe-io-workers">
            <Input
              id="fe-io-workers"
              type="number"
              min={1}
              value={cfg.io_workers}
              onChange={(e) => onChange({ io_workers: Number(e.target.value) })}
            />
          </Field>
          <Field label="Path" htmlFor="fe-io-path">
            <Input
              id="fe-io-path"
              value={cfg.io_path}
              onChange={(e) => onChange({ io_path: e.target.value })}
              placeholder="/tmp/atropos-io"
              className="font-mono"
            />
          </Field>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Field helper ────────────────────────────────────────────────────

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}
