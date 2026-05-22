import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { datasetsApi } from "@/lib/api";
import { cn, formatBytes, formatRelative, formatTtl, pluralize } from "@/lib/utils";
import type { Dataset } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/datasets/$datasetId")({
  component: DatasetDetailPage,
});

function DatasetDetailPage() {
  const { datasetId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dataset", datasetId],
    queryFn: () => datasetsApi.getDataset(datasetId),
  });

  const deleteMut = useMutation({
    mutationFn: () => datasetsApi.deleteDataset(datasetId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["datasets"] });
      navigate({ to: "/datasets" });
    },
  });
  function handleDelete() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete dataset "${datasetId}"? This cannot be undone.`)
    ) {
      return;
    }
    deleteMut.mutate();
  }

  if (isLoading) {
    return (
      <>
        <Topbar breadcrumbs={[{ label: "Datasets", to: "/datasets" }, datasetId]} />
        <div className="flex-1 overflow-y-auto px-6 py-6 text-sm text-muted-foreground">
          Loading…
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <Topbar breadcrumbs={[{ label: "Datasets", to: "/datasets" }, datasetId]} />
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <p className="text-sm text-muted-foreground">
            Dataset <code className="font-mono">{datasetId}</code> not found.{" "}
            <Link to="/datasets" className="text-primary hover:underline">
              Back to datasets
            </Link>
            .
          </p>
        </div>
      </>
    );
  }

  const poolNames = Object.keys(data.pool_stats).sort();

  return (
    <>
      <Topbar
        breadcrumbs={[{ label: "Datasets", to: "/datasets" }, datasetId]}
        action={
          <div className="flex items-center gap-2">
            <UploadButton datasetId={datasetId} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <DatasetHeader dataset={data} />
        <Separator className="my-6" />

        {poolNames.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pools yet. Use <span className="font-medium">Upload NDJSON</span> to add rows. Each
            top-level JSON key (or the <code className="font-mono">pool</code> field) becomes a
            pool.
          </p>
        ) : (
          <div className="space-y-6">
            {poolNames.map((name) => (
              <PoolSection
                key={name}
                datasetId={datasetId}
                name={name}
                fields={data.pool_stats[name]?.fields ?? []}
                rowCount={data.pool_stats[name]?.row_count ?? 0}
                sizeBytes={data.pool_stats[name]?.size_bytes ?? 0}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function DatasetHeader({ dataset }: { dataset: Dataset }) {
  const poolCount = Object.keys(dataset.pool_stats).length;
  return (
    <div>
      <h1 className="font-mono text-2xl font-semibold tracking-tight">{dataset.name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="font-mono text-[10px]">
          {dataset.source}
        </Badge>
        <span>·</span>
        <span>{pluralize(poolCount, "pool")}</span>
        <span>·</span>
        <span className="font-mono">{formatBytes(dataset.size_bytes)}</span>
        <span>·</span>
        <span>
          TTL <span className="font-mono">{formatTtl(dataset.ttl_s)}</span>
        </span>
        <span>·</span>
        <span>created {formatRelative(dataset.created_at)}</span>
      </div>
    </div>
  );
}

function PoolSection({
  datasetId,
  name,
  fields,
  rowCount,
  sizeBytes,
}: {
  datasetId: string;
  name: string;
  fields: string[];
  rowCount: number;
  sizeBytes: number;
}) {
  const [open, setOpen] = useState(false);
  const sample = useQuery({
    queryKey: ["dataset-sample", datasetId, name],
    queryFn: () => datasetsApi.sampleDataset(datasetId, name, 10),
    enabled: open,
  });

  // Prefer the declared field order; fall back to keys seen in the rows.
  const columns =
    fields.length > 0
      ? fields
      : Array.from(new Set((sample.data?.rows ?? []).flatMap((r) => Object.keys(r))));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-sm font-semibold">{name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <span className="font-mono tabular-nums">{rowCount.toLocaleString()}</span>
              <span>rows ·</span>
              <span className="font-mono">{formatBytes(sizeBytes)}</span>
              {fields.length > 0 ? (
                <>
                  <span>·</span>
                  {fields.map((f) => (
                    <Badge key={f} variant="outline" className="font-mono text-[10px]">
                      {f}
                    </Badge>
                  ))}
                </>
              ) : null}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide sample" : "Sample rows"}
          </Button>
        </div>

        {open ? (
          <div className="mt-3">
            {sample.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading sample…</p>
            ) : sample.isError ? (
              <p className="text-xs text-muted-foreground">Could not load sample.</p>
            ) : (sample.data?.rows.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">Pool is empty.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((c) => (
                        <TableHead key={c} className="font-mono text-[11px]">
                          {c}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(sample.data?.rows ?? []).map((row, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: sample rows have no stable id
                      <TableRow key={i}>
                        {columns.map((c) => (
                          <TableCell key={c} className="font-mono text-xs">
                            {formatCell(row[c])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function UploadButton({ datasetId }: { datasetId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);

  // Clear the transient note after a few seconds.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(t);
  }, [note]);

  const upload = useMutation({
    mutationFn: (ndjson: string) => datasetsApi.uploadPool(datasetId, ndjson),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["dataset", datasetId] });
      await queryClient.invalidateQueries({ queryKey: ["dataset-sample", datasetId] });
      setNote(`Ingested ${res.total} ${res.total === 1 ? "row" : "rows"}.`);
    },
    onError: (err: Error) => setNote(err.message),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const text = await file.text();
    upload.mutate(text);
  }

  return (
    <div className="flex items-center gap-2">
      {note ? <span className="text-[11px] text-muted-foreground">{note}</span> : null}
      <input
        ref={inputRef}
        type="file"
        accept=".ndjson,.jsonl,application/x-ndjson,application/jsonl"
        className="hidden"
        onChange={onFile}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        className={cn(upload.isPending && "opacity-70")}
      >
        <Upload className="size-4" />
        {upload.isPending ? "Uploading…" : "Upload NDJSON"}
      </Button>
    </div>
  );
}
