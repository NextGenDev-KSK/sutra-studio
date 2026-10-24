import { ArrowRight, CalendarDays, MapPin, Minus, Plus, Sparkles, Users, X, Building2, Layers } from 'lucide-react';
import { BOOKED_STATUSES } from '../domain/budget';
import { VENDOR_STATUS_LABEL, VENUE_STATUS_LABEL, categoryMeta, eventTypeLabel } from '../domain/catalog';
import { summarizeGuests } from '../domain/guests';
import type { EventPlan, VendorStatus } from '../domain/types';
import { formatDate, formatMoneyCompact, plural, relativeDays } from '../domain/util';
import { hrefFor } from '../lib/router';
import { useWorkspace } from '../store/workspace';
import { BulletChart } from '../ui/charts';
import { CommitNumber, Meter, Notice, Stat, toast } from '../ui/kit';
import { JaaliPattern, Money, useInsights, useToday, useUI } from './common';

export function Overview({ plan }: { plan: EventPlan }) {
  const ins = useInsights(plan);
  const today = useToday();
  const { budget: b, timeline: t } = ins;
  const cur = plan.brief.currency;
  const updateBrief = useWorkspace((s) => s.updateBrief);
  const undoLast = useWorkspace((s) => s.undoLast);
  const welcomeDismissed = useWorkspace((s) => s.welcomeDismissed);
  const dismissWelcome = useWorkspace((s) => s.dismissWelcome);
  const openCopilot = useUI((s) => s.openCopilot);
  const guests = summarizeGuests(plan.guests);
  const setGuests = (n: number) => {
    updateBrief({ guestCount: n }, `Changed guest count to ${n}`);
    toast(`Guest count set to ${n}. Every per-guest line and contract was re-priced.`, 'success', {
      label: 'Undo',
      onClick: () => undoLast(),
    });
  };

  const tone = b.forecastTotal > b.ceiling ? 'danger' : b.utilisationPct > 97 ? 'warn' : undefined;
  const bookedCats = new Set(plan.vendors.filter((v) => BOOKED_STATUSES.has(v.status)).map((v) => v.category));
  const vendorCats = plan.budget.categories.filter(
    (c) => (categoryMeta(c.key)?.essential ?? c.essential) || plan.vendors.some((v) => v.category === c.key),
  );
  const statusCounts = (['identified', 'contacted', 'quoted', 'shortlisted', 'booked'] as VendorStatus[]).map((s) => ({
    s,
    n: plan.vendors.filter((v) => v.status === s).length,
  }));
  const topLines = [...b.lines].sort((a, c) => c.forecast - a.forecast).slice(0, 8);
  const days = t.daysToEvent;

  return (
    <div className="stack-lg">
      {plan.isDemo && !welcomeDismissed && (
        <div className="card card-pad" style={{ borderColor: '#e2cf9f', background: '#fffaf0' }}>
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div className="eyebrow" style={{ color: 'var(--gold-strong)' }}>
                Illustrative demo workspace
              </div>
              <h2 style={{ marginTop: 4 }}>A live plan for a 180-guest Jaipur wedding</h2>
              <p className="ink-2" style={{ marginTop: 6 }}>
                Every vendor, guest and figure here is fictional. Try three things in the next minute:
              </p>
              <ol className="bullets" style={{ paddingLeft: 20 }}>
                <li>Change the guest count below and watch the budget, cost per guest and warnings recalculate.</li>
                <li>
                  Ask the co-pilot{' '}
                  <button className="link-btn" onClick={() => openCopilot('Our decorator cancelled. What does this affect?')}>
                    “Our decorator cancelled”
                  </button>{' '}
                  — it proposes a recovery plan you can preview, apply or reject.
                </li>
                <li>
                  Compare <a href={hrefFor({ name: 'view', eventId: plan.id, view: 'budget' })}>Lean, Balanced and Premium</a> scenarios in
                  the Budget Lab.
                </li>
              </ol>
            </div>
            <div className="row-wrap">
              <a className="btn btn-primary" href="#/new">
                <Plus /> Create your own event
              </a>
              <button className="icon-btn" aria-label="Dismiss the demo guide" onClick={dismissWelcome}>
                <X />
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="hero" aria-label="Event summary">
        <JaaliPattern className="hero-pattern" />
        <div>
          <div className="eyebrow">
            {eventTypeLabel(plan.brief.type, plan.brief.customTypeLabel)}
            {plan.brief.city ? ` · ${plan.brief.city}` : ''}
            {plan.isDemo ? ' · Demo' : ''}
          </div>
          <h1 style={{ marginTop: 6 }}>{plan.brief.name}</h1>
          <div className="hero-meta">
            <span>
              <CalendarDays /> {formatDate(plan.brief.eventDate, { weekday: true })}
              {plan.brief.durationDays > 1 ? ` · ${plan.brief.durationDays} days` : ''}
            </span>
            <span>
              <Layers /> {plural(plan.brief.sessions.length, 'session')}
            </span>
            <span>
              <Users /> {plan.brief.guestCount} guests
            </span>
            <span>
              <Building2 /> {plan.brief.venueName || 'Venue'} — {VENUE_STATUS_LABEL[plan.brief.venueStatus].split(' —')[0]}
            </span>
            {plan.brief.city && (
              <span>
                <MapPin /> {plan.brief.city}
                {plan.brief.country && plan.brief.country !== 'India' ? `, ${plan.brief.country}` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="hero-count">
          <div className="hero-figure">{Math.max(0, days)}</div>
          <div className="small">{days > 0 ? 'days to go' : days === 0 ? 'event day' : 'days since the event'}</div>
        </div>
      </section>

      <section className="card" aria-labelledby="whatif-h">
        <div className="card-head">
          <div>
            <h2 id="whatif-h">Change an input</h2>
            <div className="sub">Edits apply to the plan immediately — every figure on this page recalculates. Undo is available.</div>
          </div>
        </div>
        <div className="card-body whatif">
          <div className="field">
            <label className="field-label" htmlFor="wi-guests">
              Guest count
            </label>
            <div className="stepper">
              <button type="button" aria-label="Ten fewer guests" onClick={() => setGuests(Math.max(1, plan.brief.guestCount - 10))}>
                <Minus />
              </button>
              <CommitNumber id="wi-guests" value={plan.brief.guestCount} integer min={1} max={100000} onCommit={setGuests} />
              <button type="button" aria-label="Ten more guests" onClick={() => setGuests(plan.brief.guestCount + 10)}>
                <Plus />
              </button>
            </div>
            <span className="field-hint">
              Each extra guest ≈ {formatMoneyCompact(b.marginalGuestCost, cur)}
              {plan.guests.length ? ` · RSVPs project ~${guests.projected}` : ''}
            </span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="wi-budget">
              Budget ceiling ({cur})
            </label>
            <CommitNumber
              id="wi-budget"
              value={plan.brief.totalBudget}
              min={1}
              onCommit={(n) => {
                updateBrief({ totalBudget: n }, `Changed budget ceiling to ${n}`);
                toast('Budget ceiling updated.', 'success', { label: 'Undo', onClick: () => undoLast() });
              }}
            />
            <span className="field-hint">= {formatMoneyCompact(plan.brief.totalBudget, cur)}</span>
          </div>
          <div>
            <div className="row-between small" style={{ marginBottom: 6 }}>
              <span className="ink-2">
                Forecast{' '}
                <strong className="num" style={{ color: 'var(--ink)' }}>
                  {formatMoneyCompact(b.forecastTotal, cur)}
                </strong>{' '}
                of {formatMoneyCompact(b.ceiling, cur)}
              </span>
              <span className={b.remaining < 0 ? 'strong' : 'ink-2'} style={{ color: b.remaining < 0 ? 'var(--danger)' : undefined }}>
                {b.remaining < 0 ? `${formatMoneyCompact(-b.remaining, cur)} over` : `${formatMoneyCompact(b.remaining, cur)} left`}
              </span>
            </div>
            <Meter value={b.forecastTotal} max={b.ceiling} tone={tone} label="Forecast as a share of the budget ceiling" />
            <div className="small muted" style={{ marginTop: 6 }}>
              {b.utilisationPct.toFixed(1)}% used · {formatMoneyCompact(b.costPerGuest, cur)} per guest · includes {b.contingencyPct}%
              contingency
            </div>
          </div>
        </div>
      </section>

      <section className="kpis" aria-label="Key figures">
        <Stat
          label="Forecast vs budget"
          value={<Money value={b.forecastTotal} currency={cur} />}
          sub={`of ${formatMoneyCompact(b.ceiling, cur)} ceiling`}
          tone={b.forecastTotal > b.ceiling ? 'danger' : undefined}
        />
        <Stat
          label="Remaining"
          value={<Money value={b.remaining} currency={cur} />}
          sub={b.remaining < 0 ? 'Over budget' : 'after contingency'}
          tone={b.remaining < 0 ? 'danger' : 'ok'}
        />
        <Stat
          label="Cost per guest"
          value={<Money value={b.costPerGuest} currency={cur} />}
          sub={`planned ${formatMoneyCompact(b.plannedPerGuest, cur)}`}
        />
        <Stat
          label="Planning progress"
          value={`${t.pct}%`}
          sub={`${t.done} of ${t.total} tasks · ${t.overdue.length} overdue`}
          tone={t.overdue.length ? 'danger' : undefined}
        />
        <Stat label="Vendors booked" value={`${bookedCats.size} of ${vendorCats.length}`} sub="key categories secured" />
        <Stat
          label="Committed / paid"
          value={<Money value={b.committedTotal} currency={cur} />}
          sub={`${formatMoneyCompact(b.paidTotal, cur)} paid · ${formatMoneyCompact(b.outstandingTotal, cur)} outstanding`}
        />
      </section>

      <div className="grid-main">
        <section className="card" aria-labelledby="actions-h">
          <div className="card-head">
            <div>
              <h2 id="actions-h">Next three actions</h2>
              <div className="sub">Ranked from deadlines, dependencies, budget and vendor status.</div>
            </div>
          </div>
          <ol className="list card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {ins.actions.map((a, i) => (
              <li key={a.id} className="action-item">
                <span className="action-num" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <div className="strong">{a.title}</div>
                  <div className="small ink-2">{a.why}</div>
                </div>
                <a className="btn btn-sm" href={hrefFor({ name: 'view', eventId: plan.id, view: a.view })}>
                  {a.cta} <ArrowRight />
                </a>
              </li>
            ))}
            {!ins.actions.length && <li className="muted">Nothing urgent — the plan is on track.</li>}
          </ol>
          <div className="card-foot row-between">
            <span className="small muted">Want a second opinion?</span>
            <button className="btn btn-sm btn-gold" onClick={() => openCopilot('Which decisions must I make this week?')}>
              <Sparkles /> Ask what to decide this week
            </button>
          </div>
        </section>

        <section className="card" aria-labelledby="risks-h">
          <div className="card-head">
            <div>
              <h2 id="risks-h">Risks to resolve</h2>
              <div className="sub">
                {plural(ins.risks.filter((r) => r.source === 'computed').length, 'computed risk')} ·{' '}
                {plural(ins.risks.filter((r) => r.source === 'planner').length, 'planner-flagged risk')}
              </div>
            </div>
          </div>
          <ul
            className="list card-body"
            tabIndex={0}
            aria-label="Risks to resolve"
            style={{ paddingTop: 4, paddingBottom: 4, maxHeight: 360, overflowY: 'auto' }}
          >
            {ins.risks.slice(0, 8).map((r) => (
              <li key={r.id} className="risk-item">
                <span className={`sev-dot sev-${r.severity}`} aria-hidden="true" />
                <div>
                  <div className="strong" style={{ fontSize: 13.5 }}>
                    {r.title} <span className="sr-only">({r.severity} severity)</span>
                  </div>
                  <div className="small ink-2">{r.detail}</div>
                </div>
                <span className={`badge ${r.severity === 'high' ? 'badge-danger' : r.severity === 'medium' ? 'badge-warn' : ''}`}>
                  {r.severity}
                </span>
              </li>
            ))}
            {!ins.risks.length && <li className="muted">No open risks.</li>}
          </ul>
        </section>
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="ms-h">
          <div className="card-head">
            <h2 id="ms-h">Upcoming milestones</h2>
            <a className="btn btn-sm btn-ghost" href={hrefFor({ name: 'view', eventId: plan.id, view: 'timeline' })}>
              Timeline <ArrowRight />
            </a>
          </div>
          <ul className="list card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {t.upcomingMilestones.slice(0, 6).map((m) => {
              const i = t.insights.get(m.id)!;
              return (
                <li key={m.id} className="row-between">
                  <div style={{ minWidth: 0 }}>
                    <div className="strong" style={{ fontSize: 13.5 }}>
                      {m.title}
                    </div>
                    <div className="task-flags">
                      {i.overdue && <span className="badge badge-danger">Overdue</span>}
                      {i.venueBlocked && <span className="badge badge-warn">Needs venue</span>}
                      {i.critical && !i.overdue && <span className="badge badge-warn">Critical</span>}
                    </div>
                  </div>
                  <div className="small num" style={{ textAlign: 'right' }}>
                    {formatDate(m.dueDate, { year: false })}
                    <div className="muted tiny">{relativeDays(i.daysUntilDue)}</div>
                  </div>
                </li>
              );
            })}
            {!t.upcomingMilestones.length && <li className="muted">All milestones complete.</li>}
          </ul>
        </section>

        <section className="card" aria-labelledby="vs-h">
          <div className="card-head">
            <div>
              <h2 id="vs-h">Vendor pipeline</h2>
              <div className="sub">
                {plan.vendors.some((v) => v.verification.level === 'illustrative')
                  ? 'Includes illustrative demo vendors — not verified.'
                  : `${plan.vendors.length} vendors tracked`}
              </div>
            </div>
            <a className="btn btn-sm btn-ghost" href={hrefFor({ name: 'view', eventId: plan.id, view: 'vendors' })}>
              Vendor Hub <ArrowRight />
            </a>
          </div>
          <div className="card-body">
            <div className="pipeline">
              {statusCounts.map(({ s, n }) => (
                <div className="pipeline-step" key={s}>
                  <div className="n num">{n}</div>
                  <div className="small muted">{VENDOR_STATUS_LABEL[s]}</div>
                </div>
              ))}
            </div>
            <div className="mini-h" style={{ marginTop: 14 }}>
              Key categories
            </div>
            <div className="row-wrap">
              {vendorCats.slice(0, 12).map((c) => (
                <span
                  key={c.key}
                  className={`badge ${bookedCats.has(c.key) ? 'badge-ok' : plan.vendors.some((v) => v.category === c.key && v.status !== 'rejected') ? 'badge-gold' : 'badge-outline'}`}
                >
                  {c.label}:{' '}
                  {bookedCats.has(c.key)
                    ? 'booked'
                    : plan.vendors.some((v) => v.category === c.key && v.status === 'cancelled')
                      ? 'cancelled'
                      : plan.vendors.some((v) => v.category === c.key && v.status !== 'rejected')
                        ? 'in progress'
                        : 'not started'}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="card" aria-labelledby="bud-h">
        <div className="card-head">
          <div>
            <h2 id="bud-h">Where the money goes</h2>
            <div className="sub">
              Forecast by category (bars) against each category’s planned allocation (marker). Top {topLines.length} by forecast.
            </div>
          </div>
          <a className="btn btn-sm btn-ghost" href={hrefFor({ name: 'view', eventId: plan.id, view: 'budget' })}>
            Budget Lab <ArrowRight />
          </a>
        </div>
        <div className="card-body">
          {b.warnings
            .filter((w) => w.severity === 'danger')
            .slice(0, 2)
            .map((w) => (
              <div key={w.id} style={{ marginBottom: 10 }}>
                <Notice tone="danger">{w.message}</Notice>
              </div>
            ))}
          <BulletChart
            ariaLabel="Forecast by budget category compared with planned allocations"
            legend={{ bar: 'Forecast', marker: 'Planned' }}
            rows={topLines.map((l) => ({
              key: l.key,
              label: l.label,
              value: l.forecast,
              marker: l.plannedTotal,
              tone: l.variance > 0 && l.variancePct >= 10 ? 'danger' : l.variance > 0 && l.variancePct >= 3 ? 'warn' : undefined,
              display: formatMoneyCompact(l.forecast, cur),
              tooltip: [
                ['Forecast', formatMoneyCompact(l.forecast, cur)],
                ['Planned', formatMoneyCompact(l.plannedTotal, cur)],
                ['Variance', `${l.variance >= 0 ? '+' : '−'}${formatMoneyCompact(Math.abs(l.variance), cur)}`],
                ['Basis', l.source === 'committed' ? 'Booked contract' : l.source === 'quote' ? 'Preferred quote' : 'Estimate'],
              ],
            }))}
          />
        </div>
      </section>
      <p className="tiny muted" style={{ textAlign: 'center' }}>
        Figures recalculate from live plan data · {today} · Estimates are illustrative planning benchmarks, not market quotations.
      </p>
    </div>
  );
}
