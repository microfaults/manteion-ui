# manteion-design — portable handoff bundle

Everything Claude Code needs to implement the Manteion Design System in the
`manteion-ui` repo **and** push it to Figma — with **no dependency on the design
system project**. Copy this whole folder into the repo (e.g. to `manteion-ui/manteion-design/`)
and run the prompt in `../HANDOFF-figma-and-codegen.md` §3.

## Contents

| File | What it is | Used for |
|---|---|---|
| `tokens.json` | W3C / Tokens-Studio token sets (`dark`, `light`, `size`, `font`) | Import into **Tokens Studio** → writes Figma **Variables** (two color modes). The Figma round-trip. |
| `manteion-theme.css` | Drop-in shadcn variable block (`:root` dark + `[data-theme=light]`) | Replace the color block in `src/globals.css`. Re-skins the whole app; no component changes. |
| `component-contracts.md` | Every primitive's TypeScript prop contract + usage note | The spec Claude Code implements against — self-contained, no repo lookups. |

## Why this exists

The earlier prompt assumed the design-system files sat next to the repo. They
don't — they live in a separate design-system project. This bundle is that
project's essence (tokens + contracts) flattened into three portable files, so
Claude Code finds everything locally.

## Quick start

1. Copy this folder into the repo: `manteion-ui/manteion-design/`.
2. **Theme:** open `src/globals.css`, replace its `:root`/`.dark` color block with
   the contents of `manteion-theme.css` (keep `@tailwind` lines + non-color rules).
3. **Figma:** in Figma, open Tokens Studio → import `tokens.json` → import the
   `dark` and `light` sets, then create a variable collection with two modes bound
   to them. (Or use the Figma MCP to mirror the same values.)
4. **Components:** implement the primitives in `component-contracts.md` as
   shadcn-style components, matching the prop APIs exactly.
5. Write a `MIGRATION.md` back into the design-system project with token diffs,
   any prop mismatches, and the Figma file/node ids you created.
