# Manteion component contracts (self-contained)

Every reusable primitive in the Manteion Design System, with its TypeScript prop
contract. Implement these as shadcn-style components (cva variants, Radix where
there is interaction) in the manteion-ui repo. Names are the public API. All
visual values resolve to the CSS variables in manteion-theme.css.


## core

### Button

Action button — blue `primary` is reserved for the single most-actionable thing on a screen; use `destructive` for delete / kill-switch and `outline`/`ghost` for everything else.

```jsx
<Button variant="primary" leadingIcon={<Plus size={16} />}>New experiment</Button>
<Button variant="outline" size="sm">Test-push</Button>
<Button variant="destructive">Kill switch</Button>
```

Variants: `primary · secondary · outline · ghost · destructive · link`. Sizes: `sm (28) · md (36) · lg (40) · icon (36²)`. Pass `disabled` to dim + block. Hover darkens fills / tints ghost & outline rows.

```ts
import type { ReactNode, ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. `primary` (blue) is the single most-actionable affordance. */
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link";
  /** Control height. `icon` is a 36×36 square for icon-only buttons. */
  size?: "sm" | "md" | "lg" | "icon";
  disabled?: boolean;
  /** Icon element rendered before the label (e.g. a lucide <Plus/>). */
  leadingIcon?: ReactNode;
  /** Icon element rendered after the label. */
  trailingIcon?: ReactNode;
  children?: ReactNode;
}

/**
 * The primary action button for the Manteion control plane.
 *
 * @startingPoint section="Core" subtitle="Action buttons — primary, secondary, outline, ghost, destructive" viewport="700x180"
 */
export function Button(props: ButtonProps): JSX.Element;
```

### Checkbox

```ts
import type { ReactNode } from "react";

export interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Optional inline label rendered to the right. */
  label?: ReactNode;
  id?: string;
  style?: React.CSSProperties;
}

/** Square checkbox, blue when checked. */
export function Checkbox(props: CheckboxProps): JSX.Element;
```

### Input

```ts
import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Red border + focus ring to signal a validation error. */
  invalid?: boolean;
  /** Use JetBrains Mono — for IDs, latencies, rule names, durations. */
  mono?: boolean;
}

/** 36px text field with a blue focus ring. */
export function Input(props: InputProps): JSX.Element;
```

### Label

```ts
import type { ReactNode, LabelHTMLAttributes } from "react";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  htmlFor?: string;
  required?: boolean;
  /** Muted trailing hint, e.g. "optional". */
  hint?: ReactNode;
  children?: ReactNode;
}

/** Form field label. */
export function Label(props: LabelProps): JSX.Element;
```

### RadioGroup

```ts
export interface RadioOption {
  value: string;
  label: string;
  /** Optional secondary line under the label. */
  hint?: string;
}

export interface RadioGroupProps {
  value?: string;
  onValueChange?: (value: string) => void;
  /** Options as strings or {value,label,hint}. */
  options?: (string | RadioOption)[];
  orientation?: "vertical" | "horizontal";
  name?: string;
  style?: React.CSSProperties;
}

/** Radio set — injection-point and cache-box-mode selectors. */
export function RadioGroup(props: RadioGroupProps): JSX.Element;
```

### Select

```ts
import type { SelectHTMLAttributes, ReactNode } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  /** Options as strings or {value,label}. You can also pass <option> children. */
  options?: (string | SelectOption)[];
  placeholder?: string;
  children?: ReactNode;
}

/** Native select styled to match Input, with a chevron. */
export function Select(props: SelectProps): JSX.Element;
```

### Switch

```ts
export interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Toggle for boolean state — rule.enabled, cache-box mode. Blue when on. */
export function Switch(props: SwitchProps): JSX.Element;
```

### Textarea

```ts
import type { TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** JetBrains Mono (default true) — for rule JSON / DSL / rego. */
  mono?: boolean;
}

/** Multiline input on a sunken surface — rule JSON, DSL snippets, descriptions. */
export function Textarea(props: TextareaProps): JSX.Element;
```

## data

### Card

```ts
import type { ReactNode, HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Add a drop shadow for floating/elevated cards (default flat). */
  elevated?: boolean;
  children?: ReactNode;
}

/**
 * Flat container surface. Compose with the sub-components.
 *
 * @startingPoint section="Layout" subtitle="Card container with header / content / footer" viewport="700x260"
 */
export function Card(props: CardProps): JSX.Element;
export function CardHeader(props: HTMLAttributes<HTMLDivElement>): JSX.Element;
export function CardTitle(props: HTMLAttributes<HTMLDivElement>): JSX.Element;
export function CardDescription(props: HTMLAttributes<HTMLDivElement>): JSX.Element;
export function CardContent(props: HTMLAttributes<HTMLDivElement>): JSX.Element;
export function CardFooter(props: HTMLAttributes<HTMLDivElement>): JSX.Element;
```

### CodeBlock

```ts
import type { ReactNode } from "react";

export interface CodeBlockProps {
  /** Inline chip vs. padded block. */
  inline?: boolean;
  /** Language tag shown top-right (block only). */
  language?: string;
  children?: ReactNode;
  style?: React.CSSProperties;
}

/** Mono code on a sunken surface — rule JSON, rego, shell commands, IDs. */
export function CodeBlock(props: CodeBlockProps): JSX.Element;
```

### ObservabilityCard

```ts
export type SeriesColor = "blue" | "red" | "green" | "amber" | "purple" | "teal";

export interface ObservabilityCardProps {
  title: string;
  /** Context line, e.g. "checkout workflow · last 30m". */
  subtitle: string;
  value: string;
  /** Optional trailing qualifier, e.g. "stable". */
  valueHint?: string;
  /** Array of numbers; last 24 are plotted as bars. */
  trend?: number[];
  color?: SeriesColor;
  grafanaUrl?: string;
  style?: React.CSSProperties;
}

export interface MiniBarsProps {
  trend?: number[];
  color?: SeriesColor;
  height?: number;
}

/**
 * Live-metric tile with a 24-point trend chart and a Grafana deep link.
 *
 * @startingPoint section="Data" subtitle="Live metric tile with trend bars + Grafana link" viewport="360x220"
 */
export function ObservabilityCard(props: ObservabilityCardProps): JSX.Element;
export function MiniBars(props: MiniBarsProps): JSX.Element;
```

### StatCard

```ts
import type { ReactNode } from "react";

export interface StatDelta {
  value: string;
  direction: "up" | "down" | "flat";
}

export interface StatCardProps {
  /** Uppercase eyebrow label. */
  label: ReactNode;
  /** Big top-line value (string or mono number). */
  value: ReactNode;
  /** Optional delta pill — direction colors it (up=green, down=red). */
  delta?: StatDelta;
  /** Muted footer note under the value. */
  footer?: ReactNode;
  /** Accent color for the top bar + hover glow. */
  accent?: "blue" | "red" | "green" | "amber" | "purple" | "neutral";
  /** Optional icon (e.g. a lucide glyph) in the top-right. */
  icon?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Dashboard / experiment metric tile.
 *
 * @startingPoint section="Data" subtitle="KPI stat tile with accent bar + delta" viewport="700x180"
 */
export function StatCard(props: StatCardProps): JSX.Element;
```

### Table

```ts
import type { ReactNode, HTMLAttributes, TableHTMLAttributes } from "react";

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children?: ReactNode;
}
export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Pin the row highlighted (selected detail row). */
  selected?: boolean;
  /** Show a hover background + pointer cursor. */
  clickable?: boolean;
}
export interface TableCellProps extends HTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "center" | "right";
  /** JetBrains Mono + tabular nums — for IDs, latencies, versions. */
  mono?: boolean;
  /** Muted-foreground text — for timestamps / secondary cells. */
  muted?: boolean;
}
export interface TableHeadProps extends HTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "center" | "right";
}

/** Dense data grid — 48px rows, sticky uppercase header. */
export function Table(props: TableProps): JSX.Element;
export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>): JSX.Element;
export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>): JSX.Element;
export function TableRow(props: TableRowProps): JSX.Element;
export function TableHead(props: TableHeadProps): JSX.Element;
export function TableCell(props: TableCellProps): JSX.Element;
```

## experiments

### CacheBoxIndicator

```ts
export interface CacheBoxInfo {
  /** Replay mode. */
  mode: "passthrough" | "replay" | "replay_with_delay";
  /** Request-matching key strategy. */
  keyStrategy: "exact" | "exact_with_host" | "exact_with_body";
  /** Cache-hit rate 0–1 (colored: ≥0.85 green, ≥0.6 amber, else red). */
  hitRate: number;
  /** Exchanges recorded into the cache. */
  recorded: number;
  /** Responses served from the cache. */
  replayed: number;
  /** Human duration the mode has been active, e.g. "12m". */
  since?: string;
}

export interface CacheBoxIndicatorProps {
  /** Telemetry; renders nothing when null/undefined. */
  info?: CacheBoxInfo | null;
  size?: number;
  style?: React.CSSProperties;
}

/** Database-zap icon + hover pill summarizing a service's cache-box telemetry. */
export function CacheBoxIndicator(props: CacheBoxIndicatorProps): JSX.Element | null;
```

### PhaseHoverCard

```ts
import type { ReactNode } from "react";

export interface FrozenService {
  service: string;
  mode: string;
}
export interface AppliedRule {
  name: string;
  target: string;
}
export interface PhaseMetrics {
  p99: string;
  p99Delta?: string;
  rps: string;
  errorRate: string;
}
export interface PhaseSummary {
  status?: "pending" | "running" | "completed" | "failed";
  frozenServices?: FrozenService[];
  appliedRules?: AppliedRule[];
  metrics?: PhaseMetrics;
  /** Pre-formatted duration string, e.g. "2m 14s". */
  durationMs?: string;
}

export interface PhaseHoverCardProps {
  phase: string;
  status?: "pending" | "running" | "completed" | "failed";
  summary?: PhaseSummary;
  /** The trigger element — usually a <PhasePill/>. */
  children: ReactNode;
}

/** Hover popover with a phase's rules, frozen services and p99/RPS/error metrics. */
export function PhaseHoverCard(props: PhaseHoverCardProps): JSX.Element;
```

### PhasePill

```ts
export type PhaseName =
  | "baseline"
  | "isolation-1a"
  | "isolation-1b"
  | "isolation-2a"
  | "isolation-2b"
  | "combined";

export type PhaseStatus = "pending" | "running" | "completed" | "failed";

export interface PhasePillProps {
  name?: PhaseName;
  status?: PhaseStatus;
  /** Fixed pixel width so timelines align row-to-row. */
  width?: number;
  style?: React.CSSProperties;
}

/** Colored bar in an experiment phase timeline. */
export function PhasePill(props: PhasePillProps): JSX.Element;
```

### ServiceRow

```ts
import type { StatusKind } from "../feedback/StatusDot";

export interface ServiceRowProps {
  name: string;
  /** Sub-line: "3 pods · v1.4.2" or "Prometheus traffic only". */
  subtitle?: string;
  status?: StatusKind;
  /** Right-aligned mono metric, e.g. "412 RPS" or "cpu 38%". */
  hint?: string;
  /** Cache-box telemetry object (renders the indicator) or falsy for none. */
  cacheBox?: import("./CacheBoxIndicator").CacheBoxInfo | boolean | null;
  selected?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** One service row in the services list / dashboard panel. */
export function ServiceRow(props: ServiceRowProps): JSX.Element;
```

### TargetBadge

```ts
export interface TargetBadgeProps {
  target?: "inline" | "network" | "resource" | "cachebox";
  /** Optional param summary appended after a dot, e.g. "rst" or "250ms". */
  detail?: string;
  style?: React.CSSProperties;
}

/** Mono pill labeling a rule's fault target type. */
export function TargetBadge(props: TargetBadgeProps): JSX.Element;
```

## feedback

### Badge

```ts
import type { ReactNode, HTMLAttributes } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "secondary"
    | "outline"
    | "destructive"
    | "status-healthy"
    | "status-degraded"
    | "status-down";
  /** Render a leading filled dot (auto-colored for status variants). */
  dot?: boolean;
  children?: ReactNode;
}

/** Status / category pill. Status variants pair with a dot + soft tint. */
export function Badge(props: BadgeProps): JSX.Element;
```

### StatusDot

```ts
import type { ReactNode } from "react";

export type StatusKind =
  | "healthy"
  | "degraded"
  | "down"
  | "unknown"
  | "complete"
  | "running"
  | "stopped";

export interface StatusDotProps {
  status?: StatusKind;
  /** Optional capitalized label to the right of the dot. */
  label?: ReactNode;
  /** Pulse opacity — for live/running states. */
  pulse?: boolean;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** 8px filled health dot — the atomic status signal. */
export function StatusDot(props: StatusDotProps): JSX.Element;
```

### Toast

```ts
import type { ReactNode } from "react";

export interface ToastProps {
  kind?: "success" | "error" | "info";
  title?: ReactNode;
  message?: ReactNode;
  /** Optional action element (e.g. a Button or link). */
  action?: ReactNode;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

/** Async confirmation toast — run started, rule pushed, SDK registered. */
export function Toast(props: ToastProps): JSX.Element;
```

### Tooltip

```ts
import type { ReactNode } from "react";

export interface TooltipProps {
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
  style?: React.CSSProperties;
}

/** Hover/focus tooltip on a floating dark surface. */
export function Tooltip(props: TooltipProps): JSX.Element;
```

## navigation

### Dialog

```ts
import type { ReactNode } from "react";

export interface DialogProps {
  open?: boolean;
  onClose?: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Footer content (usually action Buttons), rendered in a bordered bar. */
  footer?: ReactNode;
  /** Dialog width in px. */
  width?: number;
  children?: ReactNode;
  style?: React.CSSProperties;
}

/** Modal dialog over a dimmed backdrop — create/edit flows. */
export function Dialog(props: DialogProps): JSX.Element;
```

### SidebarItem

```ts
import type { ReactNode } from "react";

export interface SidebarItemProps {
  /** Icon element (e.g. a 16px lucide glyph). */
  icon?: ReactNode;
  label: ReactNode;
  active?: boolean;
  /** Render as an uppercase section heading instead of a nav row. */
  sectionLabel?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** Nav row for the black sidebar — active = blue left accent bar. */
export function SidebarItem(props: SidebarItemProps): JSX.Element;
```

### Tabs

```ts
import type { ReactNode } from "react";

export interface TabItem {
  value: string;
  label: ReactNode;
  /** Optional count badge after the label. */
  badge?: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Controlled active value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  style?: React.CSSProperties;
}

/** Underline tab bar — experiment detail, run detail. */
export function Tabs(props: TabsProps): JSX.Element;
```

## observability

### GrafanaButton

```ts
export interface GrafanaButtonProps {
  /** Grafana deep link (d-solo / dashboard URL). */
  href?: string;
  /** Accessible label + tooltip text. */
  label?: string;
  /** Square size in px. */
  size?: number;
  style?: React.CSSProperties;
}

/** Compact Grafana-branded icon button that deep-links a panel into Grafana. */
export function GrafanaButton(props: GrafanaButtonProps): JSX.Element;
```

### GrafanaPanel

```ts
export interface GrafanaPanelProps {
  title: string;
  /** Time-window label shown under the title. */
  window?: string;
  /** Grafana d-solo iframe src. Omit for the empty-state tile. */
  src?: string;
  /** Render the "Grafana unreachable" failure card. */
  unavailable?: boolean;
  height?: number;
  grafanaUrl?: string;
  style?: React.CSSProperties;
}

/** Card chrome around an embedded Grafana panel, with empty + failure states. */
export function GrafanaPanel(props: GrafanaPanelProps): JSX.Element;
```

### MetricRangeSelector

```ts
export interface MetricRangeSelectorProps {
  /** Active range token, e.g. "30m". */
  value?: string;
  options?: string[];
  /** Whether the live toggle is active (overrides range highlight). */
  live?: boolean;
  onChange?: (value: string) => void;
  onLive?: () => void;
  style?: React.CSSProperties;
}

/** Segmented time-window control for observability panels. */
export function MetricRangeSelector(props: MetricRangeSelectorProps): JSX.Element;
```

### PrometheusErrorBanner

```ts
export interface PrometheusErrorBannerProps {
  message?: string;
  /** Mono command hint for the fix, e.g. a port-forward command. */
  hint?: string;
  style?: React.CSSProperties;
}

/** Inline red banner for Prometheus / manteion unreachable. */
export function PrometheusErrorBanner(props: PrometheusErrorBannerProps): JSX.Element;
```
