# Build narrative

## The problem we chose to solve

Event planners rarely struggle to *make* a plan. They struggle to keep it true as things change. The caterer charges per plate and the families add twenty guests. The decorator cancels four months out after taking an advance. The client moves the date by two weeks. Each of these ripples across the budget, the deadlines, the vendor pipeline and the event-day schedule, usually across separate spreadsheets.

Sutrā Studio's promise is **"turn a brief into a coordinated, change-aware event plan."** So the product isn't built around a chat window. It's built around one plan record and a set of engines that recompute everything from it.

## What we built (completed)

- **A single typed plan model** (`EventPlan`) and pure engines for budget, scenarios, timeline, run of show, guests, themes, insights and brief generation. No figure in the UI is typed in; all of it is derived.
- **A budget engine planners would recognise.** The forecast follows booked contracts, then preferred quotes, then estimates. Contingency is a reserve, so nothing is double-counted. Per-plate contracts re-price with headcount, and money paid to a cancelled vendor stays counted until a refund is recorded. Lean, Balanced and Premium scenarios protect client priorities and are fitted under the ceiling in stages.
- **A dependency-aware timeline.** It computes slack and critical work, blocks venue- and vendor-dependent tasks, and when the event date moves it shifts relative deadlines, preserves completed and pinned work and reports every conflict.
- **A change pipeline shared by people and AI.** Every consequential change is a list of 18 validated operation types, previewed against the live plan (budget, timeline, dependency, vendor and run-of-show impact) before the planner applies, edits, rejects or undoes it.
- **A co-pilot with two honest modes.** The built-in assistant handles all ten example requests from the brief deterministically. With a key, Claude (`claude-opus-5`, structured output, adaptive thinking, server-side refusal fallbacks) returns operations that go through exactly the same validation. Outages and invalid outputs fall back with a visible notice. Guest names never leave the browser.
- **Trust by construction.** Fictional demo vendors carry no contact details and are labelled as illustrative. "Verified" requires a source URL and a check date. Cultural or ceremonial preferences are only what the client stated. The workspace says plainly that it is local-only.
- **Ten working views**, plus intake, print reports, CSV/JSON/ICS exports, templates, an activity history and undo.
- **Verification.** 52 Vitest tests (unit, React component and integration, with coverage gates at ≈93% of logic lines) and 21 Playwright tests in a real browser: the brief's acceptance tests A–J, responsive checks at five widths and an axe accessibility scan with zero serious or critical issues — all run in CI against the production build with its Content-Security-Policy.

## Interesting engineering moments

- **The scenario test that caught a real bug.** The first version let Premium exceed the client's ceiling when protected categories couldn't be trimmed. A unit test failed, and the fix became a staged trimming cascade (unprotected first, then protected, floored at lean), with labels that show where each line actually lands.
- **The decorator cancellation is honest about money.** Applying it makes the forecast go *up*, because the ₹4.72 L advance is gone unless refunded and the backup decorator still has to be paid. That's the number a planner needs to see, not a reassuring one.
- **Flat schemas for the model.** The model returns flat operations (every field present, unused ones null), which hold up better under constrained decoding. They are converted and re-validated client-side by the same code that validates the rule engine's proposals.
- **Testing in a real browser found what unit tests couldn't.** An off-screen screen-reader label stretched the phone layout, long badges overflowed at 360 px, the "active" vendor filter hid cancelled vendors, and the muted text colour missed AA contrast. All were fixed and are now guarded by tests.

## Not built yet (future plans)

- Cloud persistence and real-time collaboration (the store already writes whole plan documents through one funnel, so it maps cleanly onto a document database with per-event access control).
- Verified vendor research through permitted live sources, with citations stored alongside each record.
- Observed, evaluated model-backed sessions (an eval set for the ten core requests), streaming responses and multi-turn refinement of a proposal.
- Client portal with approvals, payment reminders and calendar sync beyond .ics export.
- Offline/PWA support.

---

## LinkedIn post (draft)

> We just finished a hackathon build: **Sutrā Studio**, a planning studio for professional event planners. ✨
>
> Making the first plan is rarely the hard part of a wedding or festival. Keeping it true is. A per-plate caterer plus twenty late guests. A decorator who cancels after taking an advance. A date that moves by two weeks.
>
> So instead of a chatbot, we built one live plan with engines that recompute everything:
> • A budget that knows contracts beat quotes beat estimates, holds contingency as a reserve and re-prices per-plate deals when headcount changes
> • A dependency-aware timeline that moves with the event date but never touches completed or pinned work, and tells you what it changed
> • Lean / Balanced / Premium scenarios that protect what the client cares about and stay under their ceiling
> • A co-pilot whose answers are *proposals*: current vs proposed, budget and timeline impact, trade-offs and assumptions, then you apply, edit, reject or undo
>
> Ask it "our decorator cancelled" and it reopens the booking, blocks dependent work, flags the affected run-of-show items, and tells you the honest number: the forecast goes up, because the advance is gone unless refunded.
>
> Trust mattered as much as features. Demo vendors are clearly fictional, "verified" needs a source and a date, nothing about culture or religion is inferred from names or places, and guest names never leave the browser.
>
> Built with React, TypeScript and Claude (structured output, with a deterministic fallback so it works without a key). Verified with 52 unit/component/integration tests, 21 browser tests for every core workflow, an accessibility scan and a strict Content-Security-Policy — all in CI.
>
> Try it: https://nextgendev-ksk.github.io/sutra-studio/
> Code: https://github.com/NextGenDev-KSK/sutra-studio
>
> Still to come: cloud collaboration and verified vendor research.
>
> #EventPlanning #GenAI #ProductDesign #BuildInPublic #Claude
