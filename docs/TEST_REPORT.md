# Test report

**Date:** 24 Oct 2026 · **Environment:** Windows 11, Node 24.18, Microsoft Edge (Chromium) through Playwright 1.64, Vite 8, Vitest 5. CI: Ubuntu, Node 22, Playwright Chromium.

## Summary

| Check | Command | Result |
|---|---|---|
| Formatting | `npm run format:check` | ✅ Prettier clean |
| TypeScript (strict) | `npm run typecheck` | ✅ no errors |
| Lint | `npm run lint` | ✅ no errors or warnings |
| Unit + component + integration tests | `npm run test:coverage` | ✅ 52 / 52 passed (35 unit, 8 component, 9 integration) |
| Coverage of logic layers (`src/domain`, `src/copilot`, `server`) | `npm run test:coverage` | ✅ 93% lines · 93% functions · 89% statements · 71% branches (CI thresholds: 90 / 85 / 85 / 65) |
| Production build | `npx vite build` | ✅ code-split; main chunk 481 kB (≈153 kB gzipped), views 3–8 kB gzipped each |
| Browser acceptance (A–J) | `npm run test:e2e:preview` | ✅ 13 / 13 passed against the production build with CSP |
| Responsive (K) | `npm run test:e2e:preview` | ✅ 6 / 6 passed (360, 390, 768, 1280, 1440 px + phone navigation) |
| Accessibility (axe, WCAG 2.1 A/AA) | `npm run test:e2e:preview` | ✅ 0 serious or critical violations on all 10 views, intake, a report, the co-pilot with a proposal and an editor drawer |
| Dependencies | `npm audit` | ✅ 0 vulnerabilities |
| Preview server + co-pilot API | `vite preview` + curl | ✅ status `{available:false}` without a key; POST → 503; app served 200 |
| Model call path | `vite preview` with an **invalid** key | ✅ SDK request sent; Anthropic rejected it; endpoint returned 401 "The configured API key was rejected." |

## Acceptance tests from the build brief

| Test | What was verified in the running app | Result |
|---|---|---|
| **A — First impression** | Demo loads with 120-day countdown, ₹77.74 L forecast, ₹2.26 L remaining, 3 ranked actions, risks; all 10 nav items open working views | ✅ |
| **B — Event creation** | Community gathering in Pune, 75 days out, 320 guests, ₹9 L: brief, facts, vision, "none assumed" cultural note, budget ceiling, tasks generated; empty vendor state shown | ✅ |
| **C — Budget integrity** | 180 → 200 guests gives forecast ₹80.25 L, remaining −₹25,260, ₹40,126 per guest, over-budget warning, catering contract ₹19.6 L; décor quote ₹11.8 L → ₹10.8 L gives remaining ₹80,740; reconciliation badge | ✅ |
| **D — Scenario comparison** | Lean < Balanced, Premium within the ₹80 L ceiling; Lean tiers with protected Photo & film at Balanced; trade-offs listed; edited line reconciles; Balanced adopted through the preview | ✅ |
| **E — Schedule integrity** | Past date rejected; +14 days: preview, apply, "What changed" banner; all completed tasks unchanged; relative task moved by exactly 14 days; countdown 134 | ✅ |
| **F — Vendor reliability** | Added vendor; "verified" refused without source URL; quote edited (₹9.5 L → ₹9.9 L); 3-way comparison with one "Lowest"; demo records still illustrative with no contact details | ✅ |
| **G — AI change workflow** | Proposal rejected leaves date and tasks byte-identical; decorator-cancellation proposal applied: vendor cancelled, dependent tasks blocked, activity attributed to the co-pilot, Vendor Hub and Budget Lab updated | ✅ |
| **G2 — Edit before apply** | Proposed guest count edited 200 → 190 in the preview, then applied as 190 | ✅ |
| **H — Persistence** | Guest edit and a newly generated event survive a reload; local-workspace notice shown | ✅ |
| **I — Export** | Budget CSV contains the edited ₹12,34,000 venue line; JSON backup, .ics and run-of-show CSV contain current data; print report shows current values and no guest names | ✅ |
| **J — Resilience** | Intake validation (missing name, past date); malformed JSON and invalid backup rejected; malformed guest CSV rows reported and skipped; run-of-show overlap detected; circular dependency option disabled | ✅ |
| **J2 — Model failures** | Mocked "Claude available": 500 outage falls back with a notice; invalid model output (unknown vendor) rejected and nothing changes; valid mocked proposal applies | ✅ |
| **J3 — Corrupt storage** | Unreadable saved data is backed up, the app loads the demo and shows a message | ✅ |
| **K — Responsive** | No horizontal page overflow on any view at 360/390/768/1280/1440 px; base text ≥ 14 px; phone menu and co-pilot usable | ✅ |

## Vitest coverage (52 tests)

**Component tests (8):** numeric input validation and commit; proposal preview blocks invalid changes and shows current → proposed impact; chart accessible name and visible values; error boundary recovery; Overview next actions; co-pilot reject leaves the plan untouched; co-pilot apply + undo.

**Integration tests (9):** status detection (JSON vs HTML 404 vs offline); no network when the model is unavailable; valid model proposal accepted after re-validation; fallback with notice on outage, malformed output and invalid references; no guest names or contacts in model context; every model operation type converted, described and applied; CSV exports; templates; server method/body/size validation and rate limiting.

**Unit tests (35):**

INR formatting (lakh/crore, negatives); budget reconciliation with exact demo figures; guest-count and quote recalculation; sunk advances and refunds; vendors in categories with no allocation; scenario ordering, ceiling fitting, uncapped premium, overrides; rescheduling (completed, pinned and compressed tasks); venue-blocked → unblocked on booking; cycle detection; run-of-show curfew, setup, overlap and dependency; operation validation and immutability; guest summary, CSV round-trip, formula-injection neutralising, malformed rows; backup round-trip and rejection; current-value exports; intake → plan generation; co-pilot parsing (shifts, amounts, dates) and all ten example requests plus guest count, contingency and ceiling; refusal of impossible moves; model op conversion; server endpoint without a key.

## Issues found during testing and fixed

| Found by | Issue | Fix |
|---|---|---|
| Unit test | Premium scenario could exceed the budget ceiling | Staged ceiling-fitting cascade; tier labels reflect where each line actually lands |
| e2e G | "Active" vendor filter hid cancelled vendors | Filter now hides only rejected vendors |
| e2e K | Phone layout widened by an off-screen screen-reader label in tables, and by long badges | Scroll wrappers are now containing blocks; badges wrap |
| axe scan | Muted text below 4.5:1 contrast; scrollable lists not keyboard-focusable; `aria-label` on a role-less span | Darker muted token; focusable labelled regions; `role="img"` |
| Visual review | Hamburger visible on desktop; card lists lost padding; per-guest inputs truncated; Run of Show note overlapped; brand macron misplaced by the display font | CSS fixes; macron drawn in CSS |
| Output review | 15% budget-cut proposal listed the venue as "not changed" while also switching its quote | Switched categories removed from the locked list |
| Profiling review | Every timeline row recomputed the full plan analysis (quadratic work) | Insights cached per immutable plan version |
| Bundle review | Single 767 kB bundle | Route-level code-splitting |

## Not verified / limitations

- **Successful live Claude responses**: not observed, because no valid API key was available. Verified instead: the server request path up to authentication (invalid key → 401), the client's handling of mocked valid, invalid and failed responses, and identical validation for model and rule-based proposals.
- **Real-time collaboration**: not implemented (local workspace only, stated in the UI).
- **PDF files**: print views render current data; the browser's "Save as PDF" output itself was not inspected.
- **Browsers**: Edge (Chromium) only; Firefox and Safari were not tested. Mobile was checked with Chromium emulation, not physical devices.
- **Assistive technology**: automated axe checks only; no manual screen-reader session.
- **Performance**: no Lighthouse or large-data load testing.
