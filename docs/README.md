# manteion-ui — docs

Knowledge base for the faults-lab operator console. Three live sections and an
archive.

## Live

- **[design/](./design/)** — what the UI looks like and why.
  - [`ui-design.md`](./design/ui-design.md) — design spec, tokens, per-screen
    behaviour. The authoritative description of *what* every page does.
  - [`figma-changes.md`](./design/figma-changes.md) — handoff notes for the
    Rules v1.1 (OPA) and Experiments hover-card work; what shipped to the
    Figma file and why.
- **[api/](./api/)** — what the UI expects from the backend.
  - [`api-needed.md`](./api/api-needed.md) — full endpoint contract for
    `manteion-go`. Marks what exists, what's missing, and the semantic gaps
    that need a backend decision.
- **[ops/](./ops/)** — how to run it.
  - [`connecting-to-vm1.md`](./ops/connecting-to-vm1.md) — SSH tunnel from a
    laptop to manteion-go on the VM1 k3s cluster.
  - [`working-with-the-vms.md`](./ops/working-with-the-vms.md) — conventions for
    editing, building, and debugging the backend services on the lab VMs
    (edit locally → push → pull; build-verify; blob transfer; `[AGENT]` log tag).
  - [`testing-rules-end-to-end.md`](./ops/testing-rules-end-to-end.md) — manual
    end-to-end test plan for the rules editor against the live VM1 backend.

## Archive

- **[archive/plans/](./archive/plans/)** — already-shipped review and fix plans
  kept for history. Paths inside these files reflect the pre-2026-05-20 docs
  layout (`docs/UI-DESIGN.md`, `docs/figma-changes.md`, etc.) and have not
  been rewritten — read them as historical artifacts.

## What belongs here

This tree is the **current knowledge base** — it reflects how the system
actually is (design, API contract, ops runbooks). It is **not** a home for
forward-looking implementation plans.

Brainstorming specs and implementation plans are agent **working artifacts**:
they live under `docs/superpowers/` (gitignored, local-only) and are never
committed. When that work ships, the change is reflected here by **updating the
relevant knowledge-base doc** (e.g. `api/api-needed.md`, `design/ui-design.md`,
a new `ops/` runbook) — not by committing the plan.
