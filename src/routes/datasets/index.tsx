import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { datasetsApi } from "@/lib/api";
import { formatBytes, formatRelative, formatTtl } from "@/lib/utils";
import type { DatasetListItem } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Database, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/datasets/")({
  component: DatasetsPage,
});

function DatasetsPage() {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["datasets"],
    queryFn: datasetsApi.listDatasets,
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (d) => d.name.toLowerCase().includes(needle) || d.source.toLowerCase().includes(needle),
    );
  }, [data, query]);

  return (
    <>
      <Topbar
        breadcrumbs={["Datasets"]}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New dataset
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-1">
          <h1 className="text-2xl font-semibold tracking-tight">Datasets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Named pools of rows that fill a workflow&apos;s{" "}
            <code className="font-mono">{"{{data.*}}"}</code> variables at run time.
          </p>
        </div>

        <div className="mb-4 mt-6 flex max-w-md items-center gap-2">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search datasets…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Could not load datasets.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query
              ? `No datasets match "${query}".`
              : "No datasets yet. Create one with New dataset, then upload NDJSON pools."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((ds) => (
              <DatasetCard key={ds.id} dataset={ds} />
            ))}
          </div>
        )}
      </div>

      <NewDatasetDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function DatasetCard({ dataset }: { dataset: DatasetListItem }) {
  return (
    <Link to="/datasets/$datasetId" params={{ datasetId: dataset.id }} className="group block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Database className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-sm font-semibold">{dataset.name}</span>
              </div>
              <div className="mt-1">
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {dataset.source}
                </Badge>
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>

          <div className="mt-auto flex items-end justify-between text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Size</div>
              <div className="font-mono tabular-nums">{formatBytes(dataset.size_bytes)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">TTL</div>
              <div className="font-mono">{formatTtl(dataset.ttl_s)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Created
              </div>
              <div className="font-mono text-muted-foreground">
                {formatRelative(dataset.created_at)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function NewDatasetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [ttlDays, setTtlDays] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  function reset() {
    setName("");
    setTtlDays("1");
    setError(null);
  }

  const mutation = useMutation({
    mutationFn: datasetsApi.createDataset,
    onSuccess: async (ds) => {
      await queryClient.invalidateQueries({ queryKey: ["datasets"] });
      onOpenChange(false);
      reset();
      navigate({ to: "/datasets/$datasetId", params: { datasetId: ds.id } });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New dataset</DialogTitle>
          <DialogDescription>
            Creates an empty dataset shell. Upload NDJSON pools from its detail page.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              setError("Name is required");
              return;
            }
            const days = Number(ttlDays);
            mutation.mutate({
              name: name.trim(),
              ttlS: Number.isFinite(days) && days > 0 ? Math.round(days * 86400) : undefined,
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="ds-name">Name</Label>
            <Input
              id="ds-name"
              autoFocus
              placeholder="checkout-seed"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ds-ttl">TTL (days)</Label>
            <Input
              id="ds-ttl"
              type="number"
              min={0}
              step={1}
              value={ttlDays}
              onChange={(e) => setTtlDays(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              0 = no expiry. Server default is 1 day.
            </p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create dataset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
