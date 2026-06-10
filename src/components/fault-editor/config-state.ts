import type {
  FaultCatalogEntry,
  FaultCategory,
  FaultParamSpec,
  FaultSpec,
  NetworkEnvelope,
} from "@/types/api";

// ─── Catalog helpers ──────────────────────────────────────────────────
// Schema epoch 2 replaced the hardcoded per-type vocabulary and param field
// definitions with GET /api/v1/faults/catalog. These helpers derive form
// state from catalog entries so the editor can't drift from what the SDK
// decoders (atropos-go/faultparams) accept.

export function findEntry(
  catalog: FaultCatalogEntry[] | undefined,
  category: string,
  faultType: string,
): FaultCatalogEntry | undefined {
  return catalog?.find((e) => e.category === category && e.fault_type === faultType);
}

export function entriesForCategory(
  catalog: FaultCatalogEntry[] | undefined,
  category: FaultCategory,
): FaultCatalogEntry[] {
  return (catalog ?? []).filter((e) => e.category === category);
}

// ─── Param values ─────────────────────────────────────────────────────

/** UI-side scalar for one catalog param. Durations/strings/enums are
 *  strings; int/float are numbers; bool is boolean. */
export type ParamScalar = string | number | boolean;

/** Sparse overrides keyed by param name. Fields the user hasn't touched
 *  fall back to the catalog default via {@link paramValue}. */
export type ParamValues = Record<string, ParamScalar>;

/** Resolve the displayed value for a param: user override, else the
 *  catalog default, else the type's zero value. */
export function paramValue(param: FaultParamSpec, values: ParamValues): ParamScalar {
  const override = values[param.name];
  if (override !== undefined) return override;
  return coerceScalar(param, param.default);
}

function coerceScalar(param: FaultParamSpec, raw: unknown): ParamScalar {
  switch (param.type) {
    case "int":
    case "float": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    case "bool":
      return Boolean(raw);
    default:
      // duration | string | enum
      return raw == null ? "" : String(raw);
  }
}

/** Extract param overrides from an existing spec's params blob (wire values
 *  are already JSON scalars, so no catalog entry is needed to hydrate). */
export function paramValuesFromSpec(spec: FaultSpec): ParamValues {
  const out: ParamValues = {};
  const params = spec.params;
  if (!params || typeof params !== "object") return out;
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

/** Build the wire `params` object for a catalog entry. Required fields are
 *  always sent; optional fields are omitted at their zero value ("" / 0 /
 *  false), matching faultparams' "zero means SDK default" convention and
 *  keeping the payload clean under strict server-side validation. */
export function buildParams(
  entry: FaultCatalogEntry,
  values: ParamValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const param of entry.params) {
    const v = paramValue(param, values);
    if (!param.required && isZeroValue(v)) continue;
    out[param.name] = v;
  }
  return out;
}

function isZeroValue(v: ParamScalar): boolean {
  return v === "" || v === 0 || v === false;
}

/** Names of required string-like params (duration/string/enum) that are
 *  still empty — used to gate the Save button with a useful hint. Numeric
 *  params always pass here; the server range-checks them. */
export function missingRequiredParams(entry: FaultCatalogEntry, values: ParamValues): string[] {
  return entry.params
    .filter(
      (p) =>
        p.required && typeof paramValue(p, values) === "string" && paramValue(p, values) === "",
    )
    .map((p) => p.name);
}

// ─── Network envelope ─────────────────────────────────────────────────
// Network-category faults carry a `network` envelope OUTSIDE params:
// {target, direction, scope}. host=proxy (the default) requires target.

export interface NetworkEnvelopeState {
  target: string;
  direction: "" | "upstream" | "downstream";
  scope: number;
}

export const defaultNetworkEnvelope = (): NetworkEnvelopeState => ({
  target: "",
  direction: "downstream",
  scope: 0,
});

export function networkFromSpec(spec: FaultSpec): NetworkEnvelopeState {
  const base = defaultNetworkEnvelope();
  if (!spec.network) return base;
  return {
    target: spec.network.target ?? base.target,
    direction: spec.network.direction ?? base.direction,
    scope: spec.network.scope ?? base.scope,
  };
}

export function buildNetworkEnvelope(state: NetworkEnvelopeState): NetworkEnvelope {
  const out: NetworkEnvelope = { target: state.target };
  if (state.direction) out.direction = state.direction;
  if (state.scope > 0) out.scope = state.scope;
  return out;
}
