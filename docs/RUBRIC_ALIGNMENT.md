# Rubric alignment

Challenge 5 submissions are evaluated on six parameters: **Code Quality, Security, Efficiency, Testing, Accessibility and Problem Statement Alignment**. This page maps each one to concrete implementation and verifiable evidence in this repository.

## 1. Problem statement alignment

*"Create a GenAI-powered planning assistant that helps users organize weddings, birthdays, community events, and other celebrations with budgets, timelines, vendor checklists, and personalized ideas."*

| Brief element | Implementation | Evidence |
|---|---|---|
| GenAI-powered planning assistant | Co-pilot panel: natural-language requests become validated plan proposals (preview → edit → apply / reject / undo). Claude `claude-opus-5` with structured output via `server/copilotApi.ts`; deterministic built-in assistant when no key is configured, clearly labelled | `src/copilot/*`; `tests/copilot.test.ts`, `tests/integration.test.ts`; e2e **G**, **G2**, **J2** |
| Weddings, birthdays, community events, other celebrations | 10 event types with their own categories, lead times, sessions and task templates | `src/domain/catalog.ts`, `generator.ts`; e2e **B** (community gathering), **H** (birthday) |
| Budgets | Budget Lab: planned/quoted/committed/paid/forecast, contingency, variance, cost per guest, payments, Lean/Balanced/Premium scenarios | `src/domain/budget.ts`; unit "budget engine", "scenarios"; e2e **C**, **D** |
| Timelines | Dependency-aware tasks: critical path, blockers, overdue; safe rescheduling with a change report; list/calendar/chronology views; .ics export | `src/domain/timeline.ts`; e2e **E** |
| Vendor checklists | Vendor Hub pipeline, category coverage, booking tasks linked to vendors, comparison, verification | `src/views/Vendors.tsx`; e2e **F**, **G** |
| Personalized ideas | Theme Studio concepts personalised by type, guests, city/season, setting, budget, lead time, accessibility, style; guest-experience ideas | `src/domain/themes.ts`, `brief.ts` |

All ten example requests from the specification ("reduce the budget by 15% without cutting photography", "move the event two weeks earlier", "monsoon-friendly reception", "premium vegetarian catering", "biggest financial risks", "compare quotations", "eco-conscious version", "decisions this week", "decorator cancelled", "client progress summary") are handled and tested.

## 2. Code quality

| Practice | Evidence |
|---|---|
| Layered architecture: pure domain engines with no UI imports; store as the only writer; views render derived data | `src/domain`, `src/store/workspace.ts`, [ARCHITECTURE.md](ARCHITECTURE.md) |
| One change pipeline shared by planner actions, themes, scenarios and AI: typed operations → validate → preview → apply/undo | `src/domain/ops.ts`, `impact.ts`, `views/ProposalPreview.tsx` |
| Strict TypeScript, ESLint (typescript-eslint, react-hooks), Prettier — all enforced in CI | `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.github/workflows/ci.yml` |
| Error boundary per view with recovery and backup download | `src/ui/ErrorBoundary.tsx` |
| Focused modules with explanatory comments on non-obvious rules (forecast precedence, contingency, fitting cascade) | `src/domain/budget.ts`, `timeline.ts` |

## 3. Security

| Control | Evidence |
|---|---|
| Secrets server-side only; never in the bundle; `.env*` git-ignored | `vite.config.ts`, `server/copilotApi.ts`, `.gitignore` |
| Content-Security-Policy + referrer policy on the production build; browser suite runs against it in CI | `vite.config.ts` (`securityHeadersPlugin`), `npm run test:e2e:preview` |
| zod validation of imports and of AI output; dangling references repaired; imports never overwrite | `src/domain/io.ts`, `src/copilot/modelSchema.ts`, `tests/domain.test.ts` |
| CSV formula-injection neutralisation | `src/domain/csv.ts`, unit test "round-trips guests through CSV and neutralises formula injection" |
| Endpoint hardening: method check, body limit, rate limit, timeouts, generic errors | `server/copilotApi.ts`, `tests/integration.test.ts` |
| Privacy: no guest names/contacts in model context or client reports | `tests/integration.test.ts`, e2e **I** |
| Dependency hygiene: `npm audit` in CI, Dependabot | `.github/` |

Full model: [SECURITY.md](../SECURITY.md).

## 4. Efficiency

| Technique | Evidence |
|---|---|
| Route-level code-splitting with `React.lazy` — main bundle 767 kB → 481 kB (≈153 kB gzipped); views load on demand (3–8 kB gzipped each) | `src/App.tsx`, `npx vite build` output |
| Insights cached per immutable plan version (WeakMap) and shared by all components and rows | `src/domain/insights.ts` (`getInsights`), `src/views/common.tsx` |
| `useMemo` for scenarios, previews and filters; inputs commit on blur to avoid per-keystroke store writes | `src/views/*`, `src/ui/kit.tsx` |
| No runtime third-party requests; fonts bundled; static hosting with hash routing | `src/main.tsx`, `src/lib/router.ts` |

## 5. Testing

| Layer | Count | What it proves |
|---|---|---|
| Unit (Vitest) | 35 | Exact budget figures and reconciliation, scenarios and ceiling fitting, rescheduling, blockers, run-of-show conflicts, validation, CSV/JSON safety, intake generation, all co-pilot intents |
| Component (React Testing Library, jsdom) | 8 | Input validation, proposal preview errors and impact, accessible charts, error boundary, Overview, co-pilot reject/apply/undo |
| Integration | 9 | Provider fallbacks with mocked network, every model operation converted/applied, exports and templates, server request validation and rate limiting |
| Browser (Playwright) | 21 | The brief's acceptance tests A–J, responsive K at 5 widths, accessibility — run against the production build in CI |
| Coverage gates | — | Logic layers ≈93% lines / ≈93% functions; CI fails below 90% lines / 85% functions |

Details: [TEST_REPORT.md](TEST_REPORT.md).

## 6. Accessibility

| Practice | Evidence |
|---|---|
| axe-core WCAG 2.1 A/AA scan: 0 serious/critical issues on every view, intake, report, co-pilot and drawer | `e2e/a11y.spec.ts` (CI) |
| Keyboard: focus-trapped dialogs with Escape and focus return, skip link, focusable scroll regions, visible focus rings | `src/ui/kit.tsx`, `src/styles/app.css` |
| Screen readers: labelled fields, inline errors with `role="alert"`, live regions for toasts and the co-pilot, `aria-pressed`/`aria-current` states | `src/ui/kit.tsx`, `src/views/Copilot.tsx` |
| Visual: AA contrast tokens, colour never the only signal (badges carry text; charts print values), reduced-motion support, responsive down to 360 px | e2e **K**, `src/ui/charts.tsx` |

## Open gaps (stated honestly)

- A successful live Claude response has not been observed (no key during development); the request path, error mapping and response validation are tested.
- No real-time multi-user collaboration or cloud database (local workspace, stated in the UI).
- Budget benchmarks are illustrative heuristics, not sourced market prices.
