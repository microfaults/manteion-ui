/**
 * Public demo landing page at `/` (mock build only): what Manteion does, shown
 * on Online Boutique, the figures one real run measured, and a one-click start
 * of the sample experiment in the simulated console.
 */
import { PhasePill } from "@/components/phase-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { startSampleExperiment } from "@/lib/sample-experiment";
import { cn } from "@/lib/utils";
import type { PhaseName } from "@/types/api";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { HeldConstant } from "./held-constant";
import { MeshDiagram } from "./mesh-diagram";
import { COLUMN, ExternalLink, Eyebrow, LandingSection, Lead } from "./section";

const GITHUB = "https://github.com/microfaults";

export function LandingPage() {
  useEffect(() => {
    document.title = "Manteion";
  }, []);

  return (
    <div className="min-h-screen bg-background text-sm text-foreground">
      <TopBar />
      <main>
        <Hero />
        <HowItWorks />
        <HeldConstant />
        <Measured />
        <Parts />
      </main>
      <Footer />
    </div>
  );
}

function TopBar() {
  return (
    <header className="border-b border-border">
      <div
        className={cn(COLUMN, "flex min-h-14 flex-wrap items-center justify-between gap-3 py-2.5")}
      >
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="size-6" />
          <div className="flex flex-col">
            <span className="text-[15px] font-bold leading-[18px] tracking-[-0.02em]">
              Manteion
            </span>
            <span className="font-mono text-[10px] font-medium leading-3 tracking-[0.14em] text-muted-foreground">
              FAULTS · LAB
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant="status-degraded" dot>
            Simulated data
          </Badge>
          <ExternalLink href={GITHUB}>GitHub</ExternalLink>
          <Button asChild variant="primary" size="sm">
            <Link to="/dashboard">Open the console</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<string | null>(null);

  const runSample = () => {
    let id: string;
    try {
      id = startSampleExperiment();
    } catch (e) {
      setRefusal(
        e instanceof ApiError && e.status === 409
          ? "The sample could not start because another experiment in this session is using the same service. Stop it in the console, then try again."
          : "The sample could not start. Reload the page and try again.",
      );
      return;
    }
    setRefusal(null);
    // A cached copy from an earlier visit would show the old run until it went stale.
    for (const queryKey of [["experiment", id], ["experiments"], ["phases"]])
      queryClient.invalidateQueries({ queryKey });
    navigate({ to: "/experiments/$experimentId", params: { experimentId: id } });
  };

  return (
    <section className={cn(COLUMN, "flex flex-col gap-5 pb-14 pt-[72px]")}>
      <Eyebrow>Fault injection · open-loop load · attribution</Eyebrow>
      <h1 className="max-w-[780px] text-balance text-[length:clamp(32px,5vw,46px)] font-extrabold leading-[1.1] tracking-[-0.02em]">
        Change one thing. Hold the traffic. Measure what moved.
      </h1>
      <p className="max-w-[660px] text-base leading-[26px] text-muted-foreground">
        Manteion is the control plane of faults-lab. It injects a fault into one service of a
        running microservice application, keeps identical load arriving, and compares what each
        phase measured.
      </p>
      <div className="flex flex-col gap-2 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" onClick={runSample}>
            Run the sample experiment
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/dashboard">Browse the console</Link>
          </Button>
        </div>
        {refusal ? (
          <p role="alert" className="text-[13px] text-muted-foreground">
            {refusal}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex max-w-[660px] items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <span
          aria-hidden="true"
          className="mt-1.5 size-2 flex-none rounded-full bg-status-degraded"
        />
        <span className="text-[13px] leading-5 text-muted-foreground">
          This site runs on simulated data. No cluster is attached, so every service, run and number
          in the console is generated in your browser.
        </span>
      </div>
    </section>
  );
}

function LegendItem({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={swatch} />
      {children}
    </li>
  );
}

function HowItWorks() {
  return (
    <LandingSection eyebrow="How it works" title="One fault, on Online Boutique">
      <Lead className="mb-5">
        Online Boutique is an eleven-service shop. Here the product catalog is the service under
        test: a rule tells the atropos layer in front of it to add 50 ms to every request, while
        zeus keeps the same load arriving at the frontend. The frontend reaches the catalog directly
        and again through the recommendation service, so one added delay is paid more than once.
      </Lead>
      <MeshDiagram />
      <ul className="flex flex-wrap gap-x-7 gap-y-3 pt-4 text-[13px] leading-5 text-muted-foreground">
        <LegendItem swatch="w-7 border-t-2 border-muted-foreground">
          request path under load
        </LegendItem>
        <LegendItem swatch="w-7 border-t-2 border-dashed border-primary">control plane</LegendItem>
        <LegendItem swatch="size-3 rounded-[3px] border border-status-down bg-status-down-muted">
          where the fault is injected
        </LegendItem>
      </ul>
    </LandingSection>
  );
}

interface Result {
  phase: PhaseName;
  setting: string;
  p95: string;
  caption: string;
  faulted?: boolean;
}

/** Browse p95 per phase of `exp12-dose`, measured on the real testbed on 2026-08-25. */
const RESULTS: Result[] = [
  { phase: "baseline", setting: "plain", p95: "10.5 ms", caption: "Browse p95 with no fault." },
  {
    phase: "isolation-1a",
    setting: "catalog +50 ms",
    p95: "364.9 ms",
    caption: "Browse p95 with the fault on.",
    faulted: true,
  },
  {
    phase: "baseline",
    setting: "plain again",
    p95: "8.4 ms",
    caption: "Browse p95 after the fault is removed.",
  },
];

function ResultCard({ phase, setting, p95, caption, faulted }: Result) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2.5">
        <PhasePill name={phase} status="completed" width={72} />
        <span className="font-mono text-xs text-mono">{setting}</span>
      </div>
      <div
        className={cn(
          "font-mono text-[30px] font-semibold leading-9 tracking-[-0.02em] tabular-nums slashed-zero",
          faulted && "text-status-down",
        )}
      >
        {p95}
      </div>
      <div className="text-muted-foreground">{caption}</div>
    </div>
  );
}

function Measured() {
  return (
    <LandingSection
      eyebrow="What that run measured"
      title="50 ms at one service, 355 ms at the edge"
    >
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-4">
        {RESULTS.map((r) => (
          <ResultCard key={r.setting} {...r} />
        ))}
      </div>
      <p className="mt-4 max-w-[760px] text-muted-foreground">
        A browse request crosses the product catalog about seven times, so the delay multiplies on
        the way out. Measured on the real testbed on 2026-08-25 (experiment{" "}
        <span className="font-mono text-mono">exp12-dose</span>, zero dropped iterations), not in
        this simulation.
      </p>
    </LandingSection>
  );
}

const REPOS: { name: string; blurb: string }[] = [
  {
    name: "atropos-go",
    blurb:
      "Fault injection SDK. Compiled into every service; applies rules where a request enters or leaves, and records metrics and traces.",
  },
  {
    name: "manteion-go",
    blurb:
      "Control plane. Stores fault specs and rules, runs an experiment as ordered phases, and harvests each phase's results.",
  },
  {
    name: "zeus-go",
    blurb:
      "Load plane. Runs k6 user journeys at a constant arrival rate, so a slow system never slows its own load down.",
  },
  {
    name: "service-beds",
    blurb:
      "The application under test: a Go port of Online Boutique, eleven services and a Redis cart store.",
  },
];

function Parts() {
  return (
    <LandingSection eyebrow="The parts" title="Four repositories, one loop">
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
        {REPOS.map(({ name, blurb }) => (
          <div
            key={name}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5"
          >
            <ExternalLink
              href={`${GITHUB}/${name}`}
              className="self-start font-mono text-[13px] font-semibold"
            >
              {name}
            </ExternalLink>
            <div className="text-muted-foreground">{blurb}</div>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div
        className={cn(
          COLUMN,
          "flex flex-wrap justify-between gap-x-6 gap-y-3 pb-10 pt-7 text-[13px] leading-5 text-muted-foreground",
        )}
      >
        <span>
          Manteion · faults-lab. The console on this site is a simulation; the figures above are
          from the real testbed.
        </span>
        <ExternalLink href={GITHUB}>github.com/microfaults</ExternalLink>
      </div>
    </footer>
  );
}
