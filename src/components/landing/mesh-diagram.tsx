/**
 * One fault on Online Boutique, drawn on the landing artboard's 960 by 380
 * grid: request path in grey, control plane dashed in the primary colour,
 * the injected hop in the status-down colour. Only the services the example
 * touches are shown.
 */
import { cn } from "@/lib/utils";

const LABEL =
  "How one fault runs on Online Boutique: zeus sends load to the frontend, which reaches productcatalogservice directly and through recommendationservice; the atropos SDK compiled into productcatalogservice adds 50 ms to each request it receives; manteion controls atropos and zeus";

type Tone = "request" | "control" | "fault";

const strokeClass: Record<Tone, string> = {
  request: "stroke-muted-foreground",
  control: "stroke-primary",
  fault: "stroke-status-down",
};
const headClass: Record<Tone, string> = {
  request: "fill-muted-foreground",
  control: "fill-primary",
  fault: "fill-status-down",
};
const markerId = (tone: Tone) => `mesh-arrow-${tone}`;

/** A straight segment in host coordinates; `arrow` adds a head at (x2, y2). */
function Line({
  x1,
  y1,
  x2,
  y2,
  tone,
  arrow = true,
}: { x1: number; y1: number; x2: number; y2: number; tone: Tone; arrow?: boolean }) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      className={strokeClass[tone]}
      strokeWidth={2}
      strokeLinecap="round"
      strokeDasharray={tone === "control" ? "6 6" : undefined}
      markerEnd={arrow ? `url(#${markerId(tone)})` : undefined}
    />
  );
}

interface NodeProps {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  /** Second line under the name; omitted for single-line nodes. */
  subtitle?: string;
  boxClass: string;
  subtitleClass?: string;
  subtitleMono?: boolean;
  nameSize?: number;
}

/** A rounded card with a mono name and an optional subtitle line, centred. */
function DiagramNode({
  x,
  y,
  w,
  h,
  name,
  subtitle,
  boxClass,
  subtitleClass = "fill-muted-foreground",
  subtitleMono = false,
  nameSize = 13,
}: NodeProps) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g>
      <rect x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={8} className={boxClass} />
      <text
        x={cx}
        y={subtitle ? cy - 9 : cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={nameSize}
        className="fill-foreground font-mono font-semibold"
      >
        {name}
      </text>
      {subtitle ? (
        <text
          x={cx}
          y={cy + 9}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={13}
          className={cn(subtitleClass, subtitleMono && "font-mono")}
        >
          {subtitle}
        </text>
      ) : null}
    </g>
  );
}

/** A free-standing caption; `y` is the centre of its 16px line. */
function Caption({
  x,
  y,
  anchor = "middle",
  className = "fill-muted-foreground",
  children,
}: {
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
      fontSize={13}
      className={className}
    >
      {children}
    </text>
  );
}

const plainBox = "fill-card stroke-border-strong";

export function MeshDiagram() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-sunken p-6">
      <svg
        role="img"
        aria-label={LABEL}
        viewBox="0 0 960 380"
        width={960}
        height={380}
        className="mx-auto block max-w-none"
      >
        <defs>
          {(Object.keys(headClass) as Tone[]).map((tone) => (
            <marker
              key={tone}
              id={markerId(tone)}
              orient="auto"
              markerWidth={5}
              markerHeight={5}
              refX={2}
              refY={2}
              overflow="visible"
            >
              <path d="M0 0 L4 2 L0 4 Z" className={headClass[tone]} />
            </marker>
          ))}
        </defs>

        {/* One process: the atropos SDK is compiled into the service under test. */}
        <rect x={552.5} y={100.5} width={383} height={167} rx={8} className={plainBox} />

        <Line x1={168} y1={184} x2={307} y2={184} tone="request" />
        <Line x1={456} y1={184} x2={563} y2={184} tone="request" />
        <Line x1={688} y1={184} x2={731} y2={184} tone="fault" />
        <Line x1={628} y1={64} x2={628} y2={143} tone="control" />
        <Line x1={548} y1={36} x2={96} y2={36} tone="control" arrow={false} />
        <Line x1={96} y1={36} x2={96} y2={143} tone="control" />
        <Line x1={384} y1={220} x2={384} y2={295} tone="request" />
        <Line x1={472} y1={328} x2={628} y2={328} tone="request" arrow={false} />
        <Line x1={628} y1={328} x2={628} y2={273} tone="request" />

        <DiagramNode
          x={24}
          y={148}
          w={144}
          h={72}
          name="zeus"
          subtitle="load generator"
          boxClass={plainBox}
        />
        <DiagramNode
          x={312}
          y={148}
          w={144}
          h={72}
          name="frontend"
          subtitle="edge service"
          boxClass={plainBox}
        />
        <DiagramNode
          x={568}
          y={148}
          w={120}
          h={72}
          name="atropos SDK"
          subtitle="+50 ms"
          boxClass="fill-status-down-muted stroke-status-down"
          subtitleClass="fill-status-down"
          subtitleMono
        />
        <DiagramNode
          x={736}
          y={148}
          w={184}
          h={72}
          name="productcatalogservice"
          subtitle="service under test"
          nameSize={12}
          boxClass="fill-surface-sunken stroke-border-strong"
        />
        <DiagramNode
          x={548}
          y={8}
          w={160}
          h={56}
          name="manteion"
          subtitle="control plane"
          boxClass="fill-primary-muted stroke-primary"
          subtitleClass="fill-mono"
        />
        <DiagramNode
          x={296}
          y={300}
          w={176}
          h={56}
          name="recommendationservice"
          nameSize={12}
          boxClass={plainBox}
        />

        <Caption x={240} y={164}>
          open-loop load
        </Caption>
        <Caption x={512} y={164}>
          direct call
        </Caption>
        <Caption x={96} y={236}>
          <tspan x={96}>browse p95 is </tspan>
          <tspan x={96} dy={16}>
            measured here
          </tspan>
        </Caption>
        <Caption x={322} y={16} className="fill-primary">
          starts and stops each load run
        </Caption>
        <Caption x={640} y={82} anchor="start" className="fill-primary">
          rules, long-polled by the SDK
        </Caption>
        <text
          x={920}
          y={118}
          textAnchor="end"
          dominantBaseline="central"
          fontSize={10}
          letterSpacing="0.08em"
          className="fill-muted-foreground font-mono uppercase"
        >
          One process
        </text>
        <Caption x={484} y={348} anchor="start">
          a second path into the catalog
        </Caption>
      </svg>
    </div>
  );
}
