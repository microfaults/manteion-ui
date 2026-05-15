import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatLatencyUs } from "@/lib/utils";
import { StepStat } from "@/lib/api/runs";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  ReferenceLine
} from "recharts";
import { useState } from "react";

interface HistogramProps {
  steps: StepStat[];
}

export function RunHistogram({ steps }: HistogramProps) {
  const [metric, setMetric] = useState<"p50" | "p95" | "p99">("p99");

  if (steps.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center p-8 text-muted-foreground italic text-sm">
        No histogram data available for this run.
      </Card>
    );
  }

  return (
    <Card className="h-full shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Histogram
        </CardTitle>
        <Tabs value={metric} onValueChange={(v) => setMetric(v as any)} className="h-8">
          <TabsList className="h-8 p-1">
            <TabsTrigger value="p50" className="text-[10px] px-2 h-6">p50</TabsTrigger>
            <TabsTrigger value="p95" className="text-[10px] px-2 h-6">p95</TabsTrigger>
            <TabsTrigger value="p99" className="text-[10px] px-2 h-6">p99</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-12">
          {steps.map((step) => {
            const histogramData = step.histogram?.[metric] || [];
            const data = histogramData.map(b => ({
              range: `${formatLatencyUs(b.min_us)} - ${formatLatencyUs(b.max_us)}`,
              count: b.count,
              min: b.min_us,
              max: b.max_us
            }));

            const value = metric === "p50" ? step.p50_us : metric === "p95" ? step.p95_us : step.p99_us;
            const isHighLatency = value > 250000;
            const barColor = isHighLatency ? "var(--status-down)" : "var(--primary)";

            return (
              <div key={step.name} className="space-y-3">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="font-bold text-foreground">{step.name}</span>
                  <span className="text-muted-foreground">{metric}: {formatLatencyUs(value)}</span>
                </div>
                
                <div className="h-24 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <XAxis hide dataKey="range" />
                      <YAxis hide />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-popover border border-border rounded px-2 py-1 text-[10px] font-mono shadow-md">
                                <div className="text-muted-foreground">{d.range}</div>
                                <div className="font-bold text-foreground">{d.count} samples</div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                        {data.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={barColor} 
                            fillOpacity={0.3 + (index / data.length) * 0.5} 
                          />
                        ))}
                      </Bar>
                      {metric !== "p50" && (
                        <ReferenceLine 
                          x={data.findIndex(d => d.max >= step.p50_us)} 
                          stroke="var(--foreground)" 
                          strokeDasharray="3 3"
                          strokeOpacity={0.2}
                          label={{ 
                            value: 'p50', 
                            position: 'top', 
                            fill: 'var(--muted-foreground)', 
                            fontSize: 8,
                            fontFamily: 'JetBrains Mono'
                          }}
                        />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-8 pt-4 border-t text-center text-[10px] text-muted-foreground uppercase tracking-widest">
          drag to brush & zoom
        </div>
      </CardContent>
    </Card>
  );
}
