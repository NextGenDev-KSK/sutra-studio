# Architecture & key decisions

## Shape of the system

```
┌──────────────────────────── Browser (React 19 + TypeScript) ────────────────────────────┐
│ views/  Overview · Brief · Budget Lab · Timeline · Vendors · Themes · Guests · Run of   │
│         Show · Team · Exports · Intake · Reports · Co-pilot panel · Proposal preview    │
│            │ read                                   │ write (all edits & proposals)      │
│            ▼                                        ▼                                    │
│ domain/ pure engines            store/workspace.ts (Zustand)                            │
│  budget · scenarios             - one mutation helper → activity log + undo snapshot    │
│  timeline · reschedule          - applyProposal(ops) → domain/ops.applyOps              │
│  runOfShow · guests · themes    - persisted to localStorage, validated on load          │
│  insights (risks, next actions)                                                          │
│  ops (validate/apply/describe) ◄── copilot/engine.ts (rules)                            │
│  impact (before/after diff)    ◄── copilot/provider.ts ──fetch──┐                       │
└──────────────────────────────────────────────────────────────────┼──────────────────────┘
                                                                   ▼
                      server/copilotApi.ts (Vite dev/preview middleware, Node)
                      Anthropic SDK · claude-opus-5 · structured output (zod schema)
                      key from ANTHROPIC_API_KEY (server-side only)
```

There is one source of truth — the `EventPlan` record (`src/domain/types.ts`). Nothing in the UI is a hard-coded display value: every figure, flag and recommendation is derived by pure functions from the plan, so all views stay consistent.

## Data model

`EventPlan` holds the brief (type, city, date, sessions, guests, budget, style, dietary, accessibility, voluntary cultural preferences, priorities, risks), the generated narrative (with per-section "edited" flags), budget categories (fixed or per-guest, with units such as meal services or nights), payments, vendors (with quotation, availability, status, verification level), tasks (relative or pinned dates, dependencies, venue and vendor links), guests, run-of-show items, day settings (sound cut-off), theme concepts, team, notes and an activity log.

## Engines

| Engine | Responsibility | Notable rules |
|---|---|---|
| `budget.ts` | Plan summary and scenarios | Forecast per category = booked contracts, else the preferred quotation, else the planning estimate — plus sunk payments to cancelled vendors. Contingency is a separate reserve on the subtotal, never a category, so nothing is double-counted. Per-guest lines and per-guest contracts re-price with guest count. Vendors in a category with no allocation get a synthetic line so money is never dropped. |
| scenarios | Lean / Balanced / Premium | Benchmark tiers scaled by event type, city tier, guests, days and sessions. Protected categories get one tier higher. Balanced and Premium are fitted under the ceiling in stages (unprotected first, then protected, floors at lean); Premium is uncapped only when the planner turns on the over-budget comparison. Line labels reflect where a line lands after trimming. Totals reconcile exactly. |
| `timeline.ts` | Schedule analysis and rescheduling | Earliest finish via dependency recursion (in-progress tasks count half their duration), slack, critical (≤2 days slack), at-risk, overdue, venue-blocked, vendor-blocked and cycle detection. Event-date moves shift relative tasks, never touch done or pinned tasks, clamp past dates to today and report each conflict. |
| `runOfShow.ts` | Event-day checks | Overlaps in the same space, setup windows vs the previous item, dependency order, sound cut-off, a lead in two places, buffers; items past midnight are handled. |
| `insights.ts` | Risks and next three actions | Scores actions from overdue critical tasks, venue blockers, budget overruns, payments, cancellations, RSVP pressure and run-of-show conflicts. |
| `themes.ts` / `season.ts` | Concepts and seasonal outlook | Region is used only for design vocabulary and climate guidance — never to infer culture. |
| `brief.ts` / `generator.ts` | Intake → plan | Builds sessions, a budget fitted to the stated ceiling, tasks from templates scaled to the actual lead time, a suggested run of show, concepts and a narrative with explicit assumptions. |

## Change pipeline (the core idea)

Every consequential change — from the co-pilot, a theme, a scenario adoption, a vendor booking or cancellation, an event-date move or an RSVP-driven headcount — is expressed as a list of typed **plan operations** (`src/domain/ops.ts`, 18 operation types defined with zod).

1. **Propose**: produce `PlanOp[]` plus reason, trade-offs and assumptions.
2. **Validate**: `validateOps` checks schema and references against the live plan (ids exist, dates in the future, sane ranges).
3. **Preview**: `applyOps` runs on a deep clone; `computeImpact` diffs before/after (forecast, remaining, cost per guest, per-category changes, rescheduled/compressed/preserved tasks, newly blocked or unblocked work, vendor/session/run-of-show changes).
4. **Decide**: apply, edit individual operations (values and inclusion), or reject. Rejecting changes nothing.
5. **Commit**: the store applies the same operations, logs the activity (actor: planner, co-pilot or system) and keeps an undo snapshot.

Vendor status side-effects (booking marks the "book" task done and confirms the venue; cancelling reopens it and blocks venue work) live in one function, `applyVendorStatus`, shared by direct edits and proposals.

## Co-pilot

- **Rule-based engine** (`copilot/engine.ts`): parses intent (budget cut with protections, date shifts or explicit dates, weather, vegetarian catering, eco version, quotation comparison, decisions this week, vendor cancellation, client summary, guest count, contingency, ceiling, prefer/book vendor) and builds proposals from computed facts. It always says it's rule-based.
- **Model path** (`copilot/provider.ts` → `server/copilotApi.ts`): sends a compact, privacy-preserving context (no guest names or contacts) to `claude-opus-5` via `client.beta.messages.parse` with a zod structured-output schema, adaptive thinking, `effort: "medium"` for interactive latency, and server-side refusal fallbacks (`fallbacks: "default"`). The model returns *flat* operations, which the client converts and validates with the same `PlanOpSchema` + `validateOps` used everywhere. Invalid output, timeouts, refusals, rate limits or outages fall back to the rule-based engine with a visible notice.
- **Server hygiene**: 400 kB body limit, simple per-minute rate limit, typed SDK errors mapped to clear statuses, no secrets in responses or client bundle.

## Persistence

Zustand `persist` with a guarded storage adapter: write failures (quota or private mode) show a "not being saved" banner; unreadable JSON is copied to a backup key and the demo reloads; each stored event is validated against `EventPlanSchema` on load and invalid ones are skipped with a message. Undo snapshots and co-pilot conversations are in memory only. Imports are untrusted: they are schema-validated with capped string lengths, and dangling references are repaired with warnings. They are always added as a new event.

**Path to a real database:** the store already funnels every write through one `edit`/`applyProposal` helper operating on whole `EventPlan` documents, which maps directly onto a document store (for example Firestore or Postgres JSONB) keyed by event id, with the activity log as an append-only collection. Multi-user sync would add server-side validation with the same zod schemas and per-event access control.

## UI and design system

A single CSS file of tokens and components (warm ivory surfaces, forest structure, antique gold and muted rose accents, Fraunces display serif with Inter UI text, both bundled locally via Fontsource). Accessible primitives: focus-trapped modals and drawers with Escape and focus return, labelled fields, toast live region, visible focus rings, a skip link. Charts follow one rule set: single-hue magnitude bars, status colours only for over-allocation, solid hairline reference markers, visible values (tooltips enhance, never gate) and a validated three-hue RSVP palette with text labels. Hash routing keeps the build fully static.

## Performance and hardening

- **Code-splitting**: every view, the intake, reports and the co-pilot panel are `React.lazy` chunks behind `Suspense`; the main bundle holds React, the store and the domain engines.
- **Derived-data cache**: `getInsights(plan, today)` memoises budget, timeline, run-of-show and risk analysis in a `WeakMap` keyed by the immutable plan object, so every component and table row reuses one computation per plan version (entries are garbage-collected with old versions).
- **Error containment**: an `ErrorBoundary` around each routed view keeps a crash local, with retry, return-to-overview and a raw workspace backup download.
- **Content-Security-Policy**: injected into the production `index.html` by a small Vite plugin (dev mode is excluded because Vite's HMR needs inline scripts). The browser suite runs against this build in CI.
- **CI**: format, types, lint, coverage-gated tests, build and `npm audit`, then Playwright (Chromium) against the production build; GitHub Pages deploys on every push to `main`.

## Key decisions and trade-offs

| Decision | Why | Trade-off |
|---|---|---|
| Local-first, no backend database | Works instantly for judges; no accounts or credentials | No collaboration; data is per browser (backup/import provided) |
| Operations + preview for every consequential change | Makes AI changes inspectable, editable, reversible and testable | More code than letting a model edit JSON directly |
| Deterministic co-pilot as a first-class mode | The product must be fully useful without a key; behaviour is testable | Narrower language coverage than a model |
| Flat model op schema, re-validated client-side | Robust under constrained decoding; one validation path for all sources | Conversion layer to maintain |
| Contingency as reserve, not a category | Prevents double counting; scenarios reconcile exactly | Planners used to a "contingency line" see it as a footer row |
| Forecast precedence: contract > preferred quote > estimate | Mirrors how planners track money; no double counting of alternatives | A partially scoped contract under-represents remaining spend in that category |
| Illustrative benchmarks with explicit labels | Useful starting allocations without pretending to be market data | Numbers are heuristics, not sourced prices |
| Vite middleware for the API | One command runs app and API; key stays server-side | Static hosting alone runs the rule-based mode |
