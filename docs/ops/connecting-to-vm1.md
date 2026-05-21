# Connecting the UI to manteion-go on VM1

The dev UI talks to `manteion-go` via `VITE_MANTEION_URL` → Vite dev-server
proxy → `localhost:9090`. On VM1 the backend runs as a ClusterIP service
inside k3s and is **not** exposed on the host network. Bridge the gap with an
SSH local-forward.

## The one-liner

```sh
ssh -L 9090:localhost:9090 pmundra@2262-cse115b-01.be.ucsc.edu \
    'kubectl port-forward svc/manteion 9090:8080'
```

Run it in a dedicated terminal. Ctrl-C tears down both the SSH tunnel and the
kubectl port-forward.

In another terminal:

```sh
pnpm dev   # http://localhost:5173 — UI now reaches manteion via the tunnel
```

## What's happening

```
laptop:5173 (Vite dev) ──proxy /api/*──▶ laptop:9090
                                            │  (SSH local-forward)
                                            ▼
                          vm1:127.0.0.1:9090
                                            │  (kubectl port-forward)
                                            ▼
                         k3s svc/manteion:8080
```

- The k3s service is named `manteion` (not `manteion-go`) and listens on
  `8080`. The README's old `kubectl port-forward svc/manteion 9090:9090`
  examples were stale from a pre-k8s host-process layout.
- The Vite proxy target stays `http://localhost:9090`; nothing in the app code
  needs to know about VM1.
- The default `VITE_MANTEION_URL=http://localhost:5173` in `.env.example` is
  correct as-is — leave it alone.

## Quick health check

After the tunnel is up:

```sh
curl -s http://localhost:9090/healthz
curl -s http://localhost:9090/api/v1/status | jq
```

If `/healthz` succeeds and `/api/v1/status` returns a `{rules, instances, zeus_reachable}`
JSON object, the UI dashboard will load.

## Grafana and Prometheus

Grafana and Prometheus also run as ClusterIP services on VM1 (`svc/grafana:3000`,
`svc/prometheus:9090`). For dashboard observability cards, port-forward them
the same way in separate terminals, then set `VITE_GRAFANA_URL` and
`VITE_PROMETHEUS_URL` in `.env.local`. See `README.md` for the env table.

## Troubleshooting

- **`bind: Address already in use`** — something else has `9090` on the
  laptop. Kill it (`lsof -nP -iTCP:9090 -sTCP:LISTEN`) or pick another
  local port (`-L 9091:localhost:9090`) and update `VITE_MANTEION_URL`
  accordingly.
- **`unable to forward port because pod is not running`** — the manteion pod
  is down. SSH to VM1 and check `kubectl get pods -l app=manteion`.
- **`Could not reach manteion — is VITE_MANTEION_URL correct?` in the UI** —
  tunnel died, or `kubectl port-forward` exited. Re-run the one-liner.
