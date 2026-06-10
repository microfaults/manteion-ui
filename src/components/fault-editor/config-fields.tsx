import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { FaultCatalogEntry, FaultParamSpec } from "@/types/api";
import {
  type NetworkEnvelopeState,
  type ParamScalar,
  type ParamValues,
  paramValue,
} from "./config-state";

// ─── Catalog-driven param fields ──────────────────────────────────────
// Renders one input per catalog FieldSpec. The field vocabulary comes from
// GET /api/v1/faults/catalog, so there is no per-fault-type JSX to keep in
// sync with the backend's strict params validation.

interface CatalogParamFieldsProps {
  entry: FaultCatalogEntry;
  values: ParamValues;
  onChange: (name: string, value: ParamScalar) => void;
}

export function CatalogParamFields({ entry, values, onChange }: CatalogParamFieldsProps) {
  if (entry.params.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        <code className="font-mono">{entry.fault_type}</code> takes no parameters.
      </p>
    );
  }
  const switches = entry.params.filter((p) => p.type === "bool");
  const inputs = entry.params.filter((p) => p.type !== "bool");
  return (
    <div className="space-y-3">
      {inputs.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {inputs.map((param) => (
            <ParamInput
              key={param.name}
              param={param}
              value={paramValue(param, values)}
              onChange={(v) => onChange(param.name, v)}
            />
          ))}
        </div>
      ) : null}
      {switches.map((param) => (
        <ParamSwitch
          key={param.name}
          param={param}
          value={paramValue(param, values) === true}
          onChange={(v) => onChange(param.name, v)}
        />
      ))}
    </div>
  );
}

function paramLabel(param: FaultParamSpec): string {
  const pretty = param.name.replace(/_/g, " ");
  return param.required ? `${pretty} *` : pretty;
}

function ParamInput({
  param,
  value,
  onChange,
}: {
  param: FaultParamSpec;
  value: ParamScalar;
  onChange: (v: ParamScalar) => void;
}) {
  const id = `fe-param-${param.name}`;
  if (param.type === "enum") {
    return (
      <Field label={paramLabel(param)} htmlFor={id} hint={param.description}>
        <Select value={String(value)} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(param.enum ?? []).map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }
  if (param.type === "int" || param.type === "float") {
    return (
      <Field label={paramLabel(param)} htmlFor={id} hint={param.description}>
        <Input
          id={id}
          type="number"
          step={param.type === "float" ? 0.05 : 1}
          value={Number(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </Field>
    );
  }
  // duration | string
  return (
    <Field label={paramLabel(param)} htmlFor={id} hint={param.description}>
      <Input
        id={id}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={param.type === "duration" ? "250ms" : undefined}
        className="font-mono"
      />
    </Field>
  );
}

function ParamSwitch({
  param,
  value,
  onChange,
}: {
  param: FaultParamSpec;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = `fe-param-${param.name}`;
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {param.name.replace(/_/g, " ")}
        </Label>
        {param.description ? (
          <p className="text-xs text-muted-foreground">{param.description}</p>
        ) : null}
      </div>
      <Switch id={id} checked={value} onCheckedChange={onChange} />
    </div>
  );
}

// ─── Network envelope ─────────────────────────────────────────────────
// Lives OUTSIDE params (FaultSpec.network): selects which traffic the toxic
// applies to. Required for the network category; target is mandatory with
// the default proxy host.

interface NetworkEnvelopeFieldsProps {
  value: NetworkEnvelopeState;
  onChange: (patch: Partial<NetworkEnvelopeState>) => void;
}

export function NetworkEnvelopeFields({ value, onChange }: NetworkEnvelopeFieldsProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Network envelope</p>
      <Field label="Target *" htmlFor="fe-net-target" hint="Logical upstream service name">
        <Input
          id="fe-net-target"
          value={value.target}
          onChange={(e) => onChange({ target: e.target.value })}
          placeholder="productcatalog"
          className="font-mono"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Direction" htmlFor="fe-net-dir">
          <Select
            value={value.direction || "downstream"}
            onValueChange={(v) => onChange({ direction: v as "upstream" | "downstream" })}
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
        <Field label="Scope (0–1)" htmlFor="fe-net-scope" hint="Fraction of connections; 0 = all">
          <Input
            id="fe-net-scope"
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={value.scope}
            onChange={(e) => onChange({ scope: Number(e.target.value) })}
          />
        </Field>
      </div>
    </div>
  );
}

// ─── Field helper ────────────────────────────────────────────────────

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
