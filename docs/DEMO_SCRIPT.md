# Judge demo script (about 6 minutes)

**Setup:** `npm install && npm run dev`, then open http://localhost:5173 in a fresh browser profile (or use *Reset demo data* in the event switcher). No API key is needed. The co-pilot shows "Built-in planning assistant · rule-based". With `ANTHROPIC_API_KEY` set it shows "Claude · claude-opus-5" instead, and the steps are the same.

The demo wedding is always dated 120 days from today, so the countdown and statuses stay sensible whenever you run it.

---

### 1. The first minute — value at a glance (0:00–1:00)
- Land on **Overview**: *Aanya & Kabir · Jaipur Wedding*, 180 guests, **120 days to go**, venue *shortlisted, not contracted*.
- Point at **Next three actions**: *Sign venue contract* (unblocks 7 tasks, due in 3 days), *Consolidate guest lists* (4 days overdue), *Rebalance catering overspend*.
- Point at **Risks**: unsigned venue, 2 run-of-show conflicts, catering ₹1.08 L over allocation.
- Say: *"Nothing on this page is typed in — it's all computed from the plan."*

### 2. Change one input, watch everything move (1:00–1:45)
- In **Change an input**, set guests **180 → 200** and press Enter.
- Forecast becomes **₹80.25 L**, remaining **−₹25,260**, cost per guest **₹40,126**. The meter turns red and a new top action appears: *Bring the forecast back within budget*.
- Say: *"The booked caterer charges per plate, so the contract re-prices; transport, print and gifts scale too; fixed costs don't."*
- Click **Undo** in the top bar (back to ₹2.26 L remaining).

### 3. Budget Lab scenarios (1:45–2:45)
- Open **Budget Lab** and show the reconciliation badge and the variance column (catering is a booked contract; the venue is a preferred quote).
- Open the **Scenarios** tab and switch **Lean / Balanced / Premium**. Photo & film and catering stay higher because they're protected. Premium is fitted under the ₹80 L ceiling ("Trimmed … to respect your ceiling").
- Edit one Lean amount: it gets an *Edited* badge and the totals still reconcile.
- Optional: **Adopt as working plan** shows the full impact preview before anything changes.

### 4. The co-pilot changes real data (2:45–4:30)
- Click **Co-pilot**, then the chip **Decorator cancelled**.
- Walk through the proposal:
  - **Current → proposed**: forecast **+₹3.52 L**, remaining **−₹1.26 L**. The ₹4.72 L advance already paid is counted as spent until a refund is recorded, and the shortlisted backup (Jaal & Bloom) becomes the forecast.
  - **Timeline**: *Book décor studio* re-opens with a 7-day deadline; layout, floral order and install schedule become **blocked**.
  - **Run of show**: three décor items marked at risk.
  - **Assumptions**: refund not assumed; backup availability unconfirmed.
- Click **Reject**: "no changes made". Ask again and click **Apply**, then show Vendor Hub (*Cancelled* badge) and Timeline (blocked tasks).
- Bonus: *"Reduce the total budget by 15% without cutting photography quality."* The proposal notes that about half of the forecast is already under contract. It trims only flexible, estimate-based lines (never accessibility or permits), suggests the cheaper venue quote with its watch-outs, and states the ₹2.24 L shortfall honestly ("a renegotiation or about 18 fewer guests").

### 5. Schedule integrity (4:30–5:15)
- Go to **Timeline**, then **Change event date**, and pick a date two weeks later.
- The preview shows *N tasks move with the event; 10 completed tasks stay as they are*. Apply.
- The **What changed** banner lists moved, preserved and pinned tasks and any conflicts.
- Show the **Calendar** and **Chronology** views.

### 6. Trust and outputs (5:15–6:00)
- **Vendor Hub**: every demo vendor shows *Illustrative · not verified* and has no phone or website. *Add vendor*, then choose *Verified*: it refuses without a source URL and a check date.
- **Run of Show** day 1: amplified sound past the 22:00 cut-off is flagged. Day 2: the reception needs 180 minutes of setup but only has 60.
- **Exports & Reports**: download *Budget CSV* (current numbers) and open the **client-ready brief**, which has no guest names. Then **Print / Save as PDF**.
- Close with: *"Local workspace, stated honestly; the AI never changes the plan without a preview; every number is computed."*

---

**If something goes wrong:** use *Reset demo data* (event switcher, or Exports & Reports → Workspace). It restores only the demo; your own events are untouched.
