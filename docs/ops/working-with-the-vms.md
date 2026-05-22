# Working with the faults-lab VMs (agent + human workflow)

Conventions for changing, building, and debugging the backend services that run
on the lab VMs. Written because ad-hoc remote editing is slow, error-prone, and
(for AI agents) token-expensive. Cross-repo: applies to `manteion-go` (VM1) and
`zeus-go` (VM2).

## The VMs

| VM | host | ssh-manager alias | runs |
|----|------|-------------------|------|
| VM1 | `2262-cse115b-01.be.ucsc.edu` | `vm1-server` | k3s cluster: manteion + demo stack (Online Boutique, Grafana, Prometheus, postgres) |
| VM2 | `2262-cse115b-02.be.ucsc.edu` | `vm2-server` | zeus (host process `:8080`), slug-mcp (nginx `:443`) |

Both backend repos are git checkouts on branch `develop`:
`/home/faults-lab/manteion-go`, `/home/faults-lab/zeus-go`.

## 1. Edit locally, never on the VM

Do **not** edit source files directly on the VM (`sed -i`, heredoc, `base64 -d > file`).
Each remote edit is multiple round-trips (read → construct → write → verify) and
large writes hit the ssh tooling's ~30 s wall-time cap.

Instead:

1. Edit in a **local clone** (clone the backend repo next to `manteion-ui` if you
   don't have one). Use normal local editing.
2. Commit + push to `develop` (single commit per change; push direct, no PR).
3. On the VM: `cd /home/faults-lab/<repo> && git pull`.
4. Build / test on the VM.

**Exceptions** — editing on the VM is fine for: a genuine one-liner where a
round-trip is cheaper than clone→push→pull, or files that only exist on the VM
(e.g. live `/etc/nginx` configs). For the latter, back up first
(`cp x x.bak.$(date +%s)`) and capture the change in a source-controlled location
afterward.

## 2. Verify builds locally; check only the exit code on the VM

1. **Build locally first.** `go build ./...` (backend) or
   `./node_modules/.bin/tsc -b` (UI) catches compile errors — the common build
   failure — without touching the VM. After that, the VM build is confirmation.
2. **On the VM, read an exit-code sentinel, not the log.** A docker build runs
   longer than the ssh ~30 s cap, so background it and check back:

   ```sh
   nohup sh -c 'docker build -t localhost:5000/manteion:dev -f manteion-go/Dockerfile . \
       > /tmp/build.log 2>&1; echo "EXIT=$?" > /tmp/build.done' >/dev/null 2>&1 &
   # …later, one cheap check:
   cat /tmp/build.done 2>/dev/null    # → EXIT=0
   ```

   Read the one-line `EXIT=` sentinel. Only `tail`/pull the verbose
   `/tmp/build.log` if the exit code is non-zero. Don't poll the full log to
   watch progress — local already proved it compiles.

For the manteion deploy specifics (image-digest repointing so migrations run),
see [`connecting-to-vm1.md`](./connecting-to-vm1.md) and the backend deploy notes.

## 3. Getting a file/blob onto the VM: commit → pull → cleanup

Don't pipe content through SSH with `base64 -d` or heredocs. If the VM needs a
file (a JSON payload, a fixture, generated content):

1. Write it locally, **commit it** (a scratch path under the repo is fine), push.
2. `git pull` on the VM, then use it (`curl --data-binary @file …`, etc.).
3. **Mark it for cleanup** — remove or revert the scratch file/commit afterward so
   it doesn't pollute the repo.

## 4. Live log inspection while debugging a running service

When you need to watch a running service's behavior on the VM:

- **Existing output:** `grep` a tight pattern with a small line cap —
  `kubectl logs -l app=manteion --tail=50 | grep 'rule action'`. Never pull the
  unfiltered firehose.
- **Behavior you need to add visibility for (multi-round debugging):** add
  *temporary* debug lines tagged **`[AGENT]`** at the decision points, rebuild +
  redeploy, then filter:

  ```sh
  kubectl logs -l app=manteion --tail=100 | grep '\[AGENT\]'
  ```

  The tag keeps inspection cheap **and** doubles as a cleanup marker — strip the
  `[AGENT]` lines (or gate them behind a debug flag) before the final commit.
  Only worth it when the bug needs several observation rounds; for a one-shot
  look, grep existing output instead.

## Why these rules exist

All four target wasted effort (and, for agents, wasted tokens): remote file
edits, polling verbose build logs, base64 blobs round-tripped through SSH, and
unfiltered log dumps. Established 2026-05-21 after a session that did all four.
