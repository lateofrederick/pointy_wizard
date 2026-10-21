# Migrating the UI to the Pointy Wizard designs

Working reference for taking `app/` from the current prototype to the Figma
designs. Written against the code as of commit `58d086d`.

**Figma file:** `BiUnX2KnG4hiDwbubFh6ri`
— page **Initial Prototype** (20 screens, left to right at 1720px spacing)
— page **Design System** (`60:5535`, nine component sets)

Open a screen by pasting its node id into Figma's URL (`?node-id=3-2`). Ids are
listed in [Screen inventory](#screen-inventory).

---

## 1. Read this first: what kind of job this is

This is **not a restyle.** The designs assume a domain model the code does not
have, and cannot express without one.

The current model is:

```ts
PipelineEvent = { id, name, code }
PipelineEdge  = Edge          // bare reactflow — no operator field
```

There is nowhere to put the operator on a connection. `->`, `|->`, `||`, `*n`
and `( )` are the entire semantics of Pointy, and the data model has no slot for
any of them. Every screen from 03 onward is about something the model can't
represent: operators on wires, branch descriptors, namespaces, meta events,
directives, attributes, retry policy.

So the order of work is: **model first, emitter second, UI third.** Re-skinning
the current components would produce a dark-themed editor that still can't
author a valid `.pointy` file.

The one genuinely reusable asset is the choice of **reactflow** — it stays, but
as a *view*, not as the source of truth (see §4).

---

## 2. What exists today, file by file

| File | What it is | Gap vs. the design |
|---|---|---|
| `app/layout.tsx` | Geist Sans/Mono, default `create-next-app` metadata | Fonts must become DM Sans / DM Mono. Title/description still say "Create Next App". |
| `app/globals.css` | Tailwind v4 import, light `--background:#fff` with a `prefers-color-scheme` dark override | Design is dark-only with a 33-token palette. Replace wholesale (§3). |
| `app/page.tsx` | `<h1>Pointy Pipeline Editor</h1>` + bordered box | The app chrome is a top bar + left palette + canvas + inspector + output panel. No page heading. |
| `app/types/pipeline.ts` | `Pipeline{config,nodes,edges}` | Replace entirely (§4). `PipelineConfig.fields` (name/type/required/batch) has no equivalent in Pointy and appears to predate the language. |
| `app/utils/pointy.ts` | `compileToPointy`, `parsePointyCode`, `validatePointyCode` | **All three implement a syntax that isn't Pointy.** See §5. |
| `app/hooks/usePipeline.ts` | localStorage persistence, JSON import/export | Keep the shape, widen to the new document model. Screens 19/20 add accounts + a server, so treat localStorage as the offline tier. |
| `app/components/PipelineEditor.tsx` | ReactFlow + Monaco split 3/4 – 1/4 | Becomes the canvas region only. Palette, inspector and output panel are siblings, not children. |
| `app/components/EventNode.tsx` | White card, `Handle` top/bottom | Replaced by the `Node` component set (`61:5722`). Ports move to **left/right**, and branch nodes get one right-hand port **per descriptor row**. |
| `app/components/CodeEditor.tsx` | Monaco, `theme="vs-dark"`, plus a "Pipeline Fields" list | Becomes the inspector's **Definition** tab (screen 04). Needs a Pointy-aware theme matching the syntax palette. |
| `app/components/MenuBar.tsx` | File/Edit/View dropdowns on `bg-gray-800` | Replaced by the top bar: file name, validity chip, zoom, Export .pty, Run pipeline, avatar. No menu bar in the design. |
| `app/components/PipelineConfiguration.tsx` | Modal: pipeline name + repeated field rows | Closest analogue is screen 13 (Pipeline settings), but the content is different: directives, variables, registry sources. |

Nothing in `app/components/` survives unchanged.

---

## 3. Design tokens

**Implemented — see `app/globals.css`.** Values come from the Figma variable
collection **"Pointy Wizard"**, mode **Dark**, read from the file rather than
eyeballed.

The designs are dark-only, but the app ships **both themes**. `:root` holds
light, `.dark` holds dark, and the app defaults to dark so an unconfigured
visitor sees the design as drawn. `@theme inline` maps each token to a
`var()` so the whole UI swaps by toggling one class on `<html>`.

**Light is not an inversion.** Two things had to be re-reasoned:

- **Elevation.** In dark, surfaces get lighter as they rise (`#070910` sunken →
  `#1A1F29` raised). In light they run out of headroom at white, so `surface`
  and `raised` are both `#FFFFFF` and raised separates by **shadow and border**
  instead. Anything that relied on "raised is a lighter box" needs a shadow.
- **The operator colours.** `#00E5FF` on white is effectively invisible, and it
  carries meaning, so it is darkened rather than dropped. Same for the rest:

  | Token | Dark | Light |
  |---|---|---|
  | `--op-seq` `->` | `#00E5FF` | `#007D93` |
  | `--op-flow` `\|->` `\|\|` | `#7B61FF` | `#5B3FE0` |
  | `--syntax-keyword` | `#00FF94` | `#00875A` |
  | `--syntax-template` | `#FFB830` | `#B87400` |
  | `--syntax-retry` | `#FDCB6E` | `#8A6200` |
  | `--syntax-accent` | `#FD9FCA` | `#C2417E` |
  | `--status-red` | `#FF5F57` | `#D93025` |
  | `--status-yellow` | `#FFBD2E` | `#9A6A00` |
  | `--status-green` | `#28C840` | `#1E8E3E` |

  **When a screen is implemented, its dark rendering is the reference.** Light
  is derived from it, and where the two disagree, dark wins.

Each tone also has a `-tint` companion (the 12–16% wash used by chips, callouts
and selected rows) because a fixed alpha over a light ground reads differently
from the same alpha over a dark one.

**Consume semantic tokens only, never a raw hex** — that is what makes the
theme swap work. `bg-bg-surface`, `text-secondary`, `border-edge`, `text-seq`,
`bg-danger-tint`, `shadow-raised`.

Theme control lives in `app/lib/theme.tsx`: a three-way preference
(dark / light / system) persisted to `localStorage`, plus an inline `<head>`
script that sets the class **before first paint** — without it the app flashes
the wrong ground on every load.

**Type scale actually used in the designs** (px / line-height):

| Role | Font | Size |
|---|---|---|
| Page title | DM Sans Medium | 24 |
| Modal title | DM Sans Medium | 15 |
| Node name, field value | DM Mono Medium / Regular | 13 / 11.5 |
| Node attributes | DM Mono Regular | 10 |
| Node badges (`local`, `hub`, `{}`) | DM Mono Medium | 8.6 |
| Section header (`DIRECTIVES`) | DM Mono Medium, +0.7px tracking | 9.4 |
| Field label, nav item | DM Sans Regular / Medium | 10.5 – 11.5 |
| Body / hint | DM Sans Regular | 9.5 / 15 |
| Code in the output panel | DM Mono Regular | 10 / 16 |

**Rule worth keeping:** anything that is Pointy source or a value the user could
paste into a `.pointy` file is **mono**; anything that is prose about the product
is **sans**. The designs never mix this up.

---

## 4. The domain model

**Implemented — `app/types/pointy.ts` and `app/lib/pointy/`.** 56 tests,
`npm test`.

| Module | What it does |
|---|---|
| `types/pointy.ts` | `Expr`, `Attr`, `EventRef`, `Chain`, `PointyDocument` |
| `lib/pointy/emit.ts` | document → `.pointy` source |
| `lib/pointy/lint.ts` | structural + semantic diagnostics |
| `lib/pointy/flow.ts` | document → nodes + edges for rendering |
| `lib/pointy/walk.ts` | `events`, `entries`, `exits`, `mapEvents` |
| `lib/pointy/document.ts` | pure document operations |

Two things worth knowing before using them:

- **`EventRef.id` is per-occurrence, not per-event.** Under CFG the same event
  appears many times and each appearance is a discrete traversal with its own
  node. Identity for "same event" is `name` + `namespace`.
- **`flow.ts` imports nothing from reactflow.** The model layer stays testable
  and the canvas library stays swappable; the mapping to reactflow's
  `Node`/`Edge` happens at the component boundary in phase 3.

The single most important change. **The chain is the truth; canvas position is
presentation.** This was settled explicitly during design: a node can sit
anywhere, and connection happens only via a typed wire. Dragging a node never
reorders the emitted Pointy.

That rules out deriving the program from a flat `edges: Edge[]`, because Pointy
is an expression with precedence, grouping and nesting — `{ }` groups, `( )`
branches and `||` pairs are structural, not adjacency.

Proposed `app/types/pointy.ts`:

```ts
export type Descriptor = 0|1|2|3|4|5|6|7|8|9;      // 0 success, 1 failure, 2+ user
export type Namespace  = 'local'|'pypi'|'github'|'hub';
export type MetaMode   = 'MAP'|'FILTER'|'REDUCE'|'FOREACH'|'FLATMAP'|'FANOUT';

/* Values in [attributes] and @variables. Deliberately tiny — the language has
   no arithmetic, no function calls, no concatenation, no boolean operators. */
export type Expr =
  | { kind:'literal'; value: string|number|boolean|null }
  | { kind:'list';    items: Expr[] }
  | { kind:'map';     entries: Record<string, Expr> }
  | { kind:'ref';     name: string }                       // $batch_size
  | { kind:'env';     name: string }                       // $env.TIMEOUT
  | { kind:'coalesce'; operands: Expr[] }                  // a ?? b ?? c
  | { kind:'ternary'; left: Expr; op: '=='|'!='|'>'|'<'|'>='|'<=';
      right: Expr; then: Expr; otherwise: Expr };

export interface Attr { name: string; value: Expr }

export interface EventRef {
  id: string;                    // stable, survives rename
  name: string;                  // ClassifyIntent
  namespace: Namespace;          // local is implicit in output
  version?: string;              // only for non-local
  attributes: Attr[];            // [executor="celery", timeout=60]
  retry?: number | 'default';    // *3  |  bare *   (numeric must be >= 2)
  meta?: { mode: MetaMode; template: string; metaAttributes: Attr[] };
  definitionId?: string;         // -> PointyDocument.definitions
}

export type Chain =
  | { kind:'event';    ref: EventRef }
  | { kind:'seq';      left: Chain; right: Chain }          // ->
  | { kind:'pipe';     left: Chain; right: Chain }          // |->
  | { kind:'parallel'; members: Chain[] }                   // ||
  | { kind:'group';    members: Chain[]; attributes: Attr[] }// { }
  | { kind:'branch';   on: EventRef;
      paths: { descriptor: Descriptor; label?: string; body: Chain }[] };

export interface PointyDocument {
  directives: { version?: string; mode: 'DAG'|'CFG' };      // CFG is the default
  variables:  { name: string; value: Expr }[];
  sources:    { namespace: Exclude<Namespace,'local'>; package: string; version: string }[];
  chain:      Chain | null;
  definitions: Record<string, { filename: string; source: string }>;  // Python
  /* presentation only — never read by the emitter */
  layout: Record<string, { x: number; y: number }>;
}
```

### How reactflow fits

Keep reactflow as the **editing surface**, not the store:

- `chainToFlow(doc)` → `{ nodes, edges }` for rendering. Positions come from
  `doc.layout`, falling back to an auto-layout pass for nodes it hasn't seen.
- User gestures mutate the **document**, then re-derive. Dragging a node writes
  only to `doc.layout` and never touches `chain`.
- `onConnect` does not push an `Edge`; it splices a `seq` node into the chain
  (sequential is always the default for a new connection — settled) and the user
  changes the operator afterwards.

This is more work than mutating `edges` directly, and it is the only way groups,
branches and `||` pairs can round-trip.

### Structural rules to enforce in the editor, not the parser

These come from the language docs and each has a designed UI state:

| Rule | Where it shows |
|---|---|
| `{ }` may contain `\|\|` at leaf level; `\|\|` may **not** contain `{ }` | Screen 17 — "Wrap in group" is greyed out with a reason |
| Meta events cannot nest — `MAP<FILTER<X>>` is invalid | Screen 17 — chain them with `\|->` instead |
| Descriptors are ints 0–9, so a branch caps at 10 paths | `+ add branch  2 / 10` on every canvas |
| Retry must be ≥ 2 when set | Stepper hint: `off · min 2 when set` |
| `@mode: "DAG"` forbids event reuse; `"CFG"` allows it | Screen 10 error, screen 16 the legitimate case |

**Descriptors are integers by design, not a parser limitation.** `return True, x`
is branch 0, `return False, err` is branch 1, and anything else is an explicit
`self.goto(n, ok, result)`. Do not offer free-text branch names; 2–9 may carry a
human label but it is UI metadata only and is not emitted.

---

## 5. The emitter and parser

`app/utils/pointy.ts` currently emits:

```
EventName {
  ...python...
}

EventName -> OtherEvent
```

That syntax does not exist in Pointy. Real output is a directive block, an
optional variable block, and **one chain expression** — with the Python living in
separate class files, not inline. Compare screen 03's output panel:

```pointy
# my-etl-pipeline.pointy — generated by Pointy Wizard
@version: "1.2.0"
@mode: "CFG"

@batch_size = 50
@timeout = $env.TIMEOUT ?? 30.0

hub::RestApiExtract[timeout=$timeout]
  -> MAP<ValidateProfile>[batch_size=$batch_size]
  |-> ClassifyIntent[node="gpu-cluster"]
  -> RouteDecision(
       0 -> { GPT4Transform[executor="celery"] * 3 }[timeout=60] -> SlackNotify,
       1 -> SlackNotify
     )
```

Replace all three functions:

- **`emit(doc): string`** — walk the chain, parenthesise by precedence, indent
  continuation lines by 2. Branch paths get their own lines. `local::` is never
  written out. This is a pure function over `PointyDocument` and should be unit
  tested against the screens' output panels, which are hand-verified.
- **`parse(source): PointyDocument`** — needed for **Import .pointy** (screen 20)
  and currently has no implementation at all. It is the larger job; consider
  shipping the emitter first and treating import as phase 5.
- **`lint(doc): Diagnostic[]`** — replaces `validatePointyCode`, which today
  checks for semicolons and indentation, i.e. it lints Python, not Pointy. Real
  diagnostics, all of which have a designed presentation on screen 10:
  unresolved namespace, event reuse under DAG, deprecated `@recursive-depth`,
  plus the structural rules above.

`Diagnostic` needs `severity`, `message`, the **Pointy rule it broke**, the node
or line it attaches to, and an optional fix action — screen 10's callout has a
title, a cause and a single "Register source →" action, and the design note is
explicit that `"invalid pipeline"` alone is not an acceptable string.

---

## 6. Wires: the execution-model language

The operator is the most important thing on the canvas and the hardest to see,
so it is encoded in the **drawing of the wire**, not in a badge.

**The rule:** the arrowhead always means direction. Hue says whether the next
event blocks. Form says how data moves.

| Operator | Hue | Form |
|---|---|---|
| `->` sequential | `--color-op-seq` cyan | one 2px strand, solid head |
| `\|->` streaming | `--color-op-flow` violet | one 2px strand with **chevrons along it**, solid head |
| `\|\|` parallel | `--color-op-flow` violet | strand **splits into two 1.8px lanes and rejoins** into one head |

Reference drawings: the legend on screen 03 (`65:6349`) and the live `||` pair on
screen 17 (`66:6383`).

**Geometry, settled and worth copying exactly:**

- Stroke 2 (1.8 for parallel lanes), `stroke-linecap="round"`.
- Arrowhead is a filled triangle **10.5 long × 8.8 wide**.
- Ports are 10px circles. The apex sits **6px short of the port centre** so the
  tip touches the port ring instead of disappearing under it; the strand stops a
  further ~9px back.
- Bezier handles follow the **port's axis** — horizontal for left/right ports,
  vertical for top/bottom. Handle length ≈ 40–50% of the span.
- Chevrons: 1.6px stroke, ±4px from the strand, round cap and join.
- A wire that leaves a right-hand port but must travel left **exits right and
  hooks back** rather than running left under its own node (screens 08/09). A
  wire whose origin is hidden reads as broken.

**Implementation in reactflow v11:** one custom edge type per operator, or one
component switching on `data.operator`.

- Build the path with `getBezierPath`, or hand-roll control points when you need
  the axis rule above.
- Do **not** use reactflow's `markerEnd` — it can't do the 6px pullback or the
  split-lane form. Render the head as a `<path>` sibling inside the edge's `<g>`.
- Chevrons need positions along the curve: render the path, then
  `ref.current.getPointAtLength(t * ref.current.getTotalLength())` for t ≈ 0.35
  and 0.7, and rotate each chevron to the local tangent.
- Parallel is two `<path>`s offset ±5px through the middle, converging on a
  single shared head.
- Edges render **behind** nodes; the operator label, if kept, renders in front.

### Open decision, blocking

The per-wire operator **chips are currently hidden, not deleted** (`9:9 9:11
9:13 9:15 9:17 9:19` on screen 03, `37:4206` on screen 17) because the wire now
carries the meaning and a 31px chip covered most of a 72px wire. Three things
follow, and they are not settled:

1. Chips gone for good, or floated above the wire as a label?
2. If gone, the click target for the operator popover becomes the wire itself.
3. **Screen 07's entire premise is "click the chip"** — inverted chip, popover
   pointing at it. If chips go, that screen needs rebuilding around wire
   selection before it can be implemented.

Do not build the operator popover until this is decided.

---

## 7. Nodes and ports

Master: `Node` component set `61:5722`, variants `default · selected · error ·
failed · skipped · reused`.

- 200×82, radius 9, `--color-bg-raised`, 1px white-15% stroke, shadow
  `0 4px 12px rgba(0,0,0,.45)`.
- A **3px accent bar** across the top carries the node's category colour.
- Meta row: source badge (`✎ local` pink, `◇ hub` cyan, `◈ pypi` amber,
  `⌥ github` violet), executor badge `{}`, an optional **status** slot
  (`✕ failed 1.4s`, `⊘ skipped`, `↺ 2nd visit`), then `⋮`.
- Name in DM Mono Medium 13. For a meta event the hidden `mode` layer is shown
  and the name becomes the template: `MAP` + `<Parse>`.
- Attributes line in DM Mono Regular 10: `[executor="process"]`.
- **Ports are absolute children on the node's edge**, 10px: left-in and right-out
  at y = 38 on an 82-high card; top-in and bottom-out at the horizontal centre.
  A **branch node gets one right-hand port per descriptor row** — on screen 03
  RouteDecision's are at local `(215,72)` and `(215,100)`.

In reactflow terms: `Handle` with explicit `id` per port, `Position.Left` /
`Position.Right`, and `style` to pin branch handles to their row's y. The
current top/bottom handles in `EventNode.tsx` must go — they imply a vertical
flow the design does not use.

Branch nodes and concurrency groups are **different components**, not states of
`Node`. The group is a dashed violet container with a `{ } label [attrs]` tab.

---

## 8. Component inventory

Figma component sets on page `60:5535`. Each carries a written contract above it
in the file; read that before implementing.

| Figma | Node id | Variants | Suggested file |
|---|---|---|---|
| Chip | `61:5568` | tone = neutral·green·amber·red·violet·cyan | `components/ui/Chip.tsx` |
| Button | `61:5589` | kind = primary·secondary·ghost·disabled | `components/ui/Button.tsx` |
| Toggle | `61:5603` | state = on·off·locked | `components/ui/Toggle.tsx` |
| Field | `61:5781` | kind = text·select·stepper·focused·error | `components/ui/Field.tsx` |
| SectionHeader | `61:5856` | action = none·add | `components/ui/SectionHeader.tsx` |
| Callout | `61:5881` | tone = error·warning·info·success | `components/ui/Callout.tsx` |
| Node | `61:5722` | state = default·selected·error·failed·skipped·reused | `components/canvas/EventNode.tsx` |
| Operator | `61:5742` | op = sequential·pipe·parallel·retry·branch | see §6 |
| PaletteTile | `61:5841` | source = hub·local·pypi·github·blank | `components/palette/PaletteTile.tsx` |

Not yet componentised, read them off the screens: TopBar, Modal shell,
ContextMenu/MenuRow, Segmented control, Tabs, Scrim, Avatar, SearchInput, the
branch node, the concurrency group, and the output panel's code + gutter.

**Note on Figma text overrides:** variant sets in this file carry no TEXT
properties (a tooling limitation), so text is overridden through named layers —
`label`, `name`, `attrs`, `status`, `value`, `hint`. Those names are the prop
names worth mirroring in React.

---

## 9. Screen inventory

| # | Screen | Node id | What it pins down |
|---|---|---|---|
| 01 | Sign in | `29:533` | Account ≠ EventHub grant. Sign-in never asks for registry access. |
| 02 | Sign up | `29:596` | |
| 03 | Canvas, node selected | `3:2` | The core layout; inspector Properties tab; the wire language (§6) |
| 04 | Canvas, Definition tab | `17:2` | Python lives in the right pane, never on the canvas |
| 05 | New custom event (modal) | `17:526` | The secondary creation path |
| 06 | Blank event dropped | `17:1124` | The **primary** path: drag a blank tile, name it inline |
| 07 | Wire selected | `17:1675` | Operator popover — **blocked, see §6** |
| 08 | Branch promotion, mid-drag | `25:2210` | A second wire promotes a node to a branch; nothing committed until release |
| 09 | Branch committed | `27:2` | `0 success` / `1 failure`, auto-assigned |
| 10 | Invalid pipeline | `35:671` | Errors in three places at once: top bar, canvas, output panel |
| 11 | Publish to EventHub | `35:1198` | Version, visibility, manifest, package contents |
| 12 | Run results | `36:1767` | Per-node status; **compile error and runtime failure are separate states** |
| 13 | Pipeline settings | `36:2267` | Directives, variables, registry sources |
| 14 | Empty pipeline | `36:2792` | Empty state, three gesture hints |
| 15 | Meta events | `37:3300` | All six modes; meta-level vs template-level attributes |
| 16 | CFG reuse + remote | `37:3615` | Event appearing twice; `grpc` executor |
| 17 | Rejected constructs | `37:3963` | The two rules the canvas *enforces* rather than reports |
| 18 | Expression editor | `37:4315` | The whole expression grammar, and the four things it isn't |
| 19 | Authorise EventHub | `41:4759` | Scopes itemised; what the grant **cannot** do |
| 20 | Your pipelines | `41:5374` | Where sign-in actually lands. Import .pointy lives here. |

Screen 20 sits between 01 and 03 in the real product; it is last in the deck
only because it was built last.

---

## 10. Suggested phases

Each phase should end somewhere shippable.

**Phase 1 — Foundation.** Tokens, fonts, dark shell. Replace `globals.css` and
`layout.tsx`. Build the six `ui/` primitives from §8 against the Design System
page. No behaviour change; the old editor can still be mounted underneath.

**Phase 2 — Model + emitter.** `types/pointy.ts`, `emit()`, `lint()`, and
`chainToFlow()`. Unit test `emit()` against the output panels of screens 03, 09,
13, 15, 16, 17 — those strings were checked by hand and make good fixtures. No
UI yet.

**Phase 3 — Canvas.** App shell (top bar, palette, canvas, inspector, output
panel). `EventNode` with ports and variants, custom edges per §6, branch node,
concurrency group. Target: screens 03, 04, 14 pixel-close.

**Phase 4 — Authoring.** Drag-to-create (06), inline naming, wire creation with
sequential default, branch promotion (08, 09), meta events (15), context menu
with the enforced rules (17), expression editor (18). Needs §6 decided.

**Phase 5 — Beyond one file.** Auth (01, 02), pipeline list (20), import/parse,
EventHub grant (19), publish (11), run results (12).

### Phase 5 as built

Done: parser (`lib/pointy/parse.ts`), JSON-file store and session auth
(`lib/server/`), routes under `app/api/`, pages `/signin`, `/signup`,
`/pipelines`, `/pipelines/[id]`, `/sandbox`, editable pipeline settings
(screen 13), EventHub grant (screen 19).

**The stored form is `.pointy` source, not serialised JSON.** Loading parses it
back, so every save and load exercises the round trip `emit()` and `parse()`
are tested against; `PUT` refuses source that will not parse. If the two ever
disagree the app finds out at once rather than persisting something the
language cannot express.

**Not built: publish (11) and run results (12).** Both need a service that does
not exist — a registry and a runner. The grant in screen 19 could be made real
because a grant is consent this app records; a publish or a run cannot be.
Building them now means inventing product semantics or drawing fabricated data.

Departures from the frames are listed in `todo.txt` under PHASE 5, each with
the reason.

---

## 11. What is still undesigned

Do not plan these from this document — they need design first:

- **Browsing EventHub.** The palette shows "32 components" and a search box, but
  there is no results state, component detail, version list or install flow.
- **Run history.** Screen 12 is one run. No list of past runs, no per-event log
  or traceback drill-down.
- **Import .pointy.** Screen 20 has the button; the paste/upload → parse →
  canvas flow is undrawn. Pairs with `parse()` in §5.
- **Undo/redo, multi-select, copy/paste** on the canvas.

---

## 12. Traps

Collected while building the designs; each one cost time.

- **Descriptors are integers, by design.** `process()` returns `(bool, result)` —
  the second value is the *result*, not a descriptor. An earlier version of these
  designs used named branches throughout and was wrong.
- **`@mode: "CFG"` is the default**, and it is how loops, retries and agent
  handoffs are expressed — the language has no loop keyword. DAG is the strict
  opt-in.
- **`|->` is a streaming pipe**, not "pipe the result". Memory-bounded, and
  downstream starts before upstream finishes. It was mislabelled in an early pass.
- **`local::` is implicit** and should never be written into the output.
- **`@recursive-depth` is deprecated** — kept for backward compatibility, and it
  is one of the warnings on screen 10.
- **Node position carries no meaning.** If you find yourself sorting nodes by x
  to build the chain, stop — that is the bug §4 exists to prevent.
