import { useMemo, useState } from 'react';
import { CalendarClock, Pencil, Plus, RefreshCw, Sparkles, Trash2, ArrowRight } from 'lucide-react';
import { BOOKED_STATUSES } from '../domain/budget';
import {
  ACCESSIBILITY_OPTIONS,
  CATEGORY_META,
  EVENT_TYPES,
  SETTING_LABEL,
  VENUE_STATUS_LABEL,
  categoryMeta,
  eventTypeLabel,
} from '../domain/catalog';
import { makeProposal } from '../domain/ops';
import { seasonOutlook } from '../domain/season';
import type { EventBrief, EventPlan, NarrativeField, Session, Setting, VenueStatus } from '../domain/types';
import { CURRENCIES, addDays, diffDays, formatDate, formatMoneyCompact, isValidISODate, isValidTime, plural, uid } from '../domain/util';
import { hrefFor } from '../lib/router';
import { useWorkspace } from '../store/workspace';
import { Drawer, Field, Modal, Notice, confirmDialog, toast } from '../ui/kit';
import { useInsights, useToday, useUI } from './common';
import { ProposalPreview } from './ProposalPreview';

export function DateChangeDialog({
  plan,
  open,
  onClose,
  initialDate,
}: {
  plan: EventPlan;
  open: boolean;
  onClose: () => void;
  initialDate?: string;
}) {
  const today = useToday();
  const [date, setDate] = useState(initialDate ?? plan.brief.eventDate);
  const applyProposal = useWorkspace((s) => s.applyProposal);
  const undoLast = useWorkspace((s) => s.undoLast);
  const error = !isValidISODate(date)
    ? 'Enter a valid date.'
    : date <= today
      ? 'The event date must be after today.'
      : diffDays(today, date) > 365 * 5
        ? 'More than five years out is not supported.'
        : '';
  const ops = useMemo(
    () => (date && !error && date !== plan.brief.eventDate ? [{ op: 'setEventDate' as const, date }] : []),
    [date, error, plan.brief.eventDate],
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change the event date"
      subtitle="Relative deadlines move with the event. Completed and pinned tasks are never changed — conflicts are listed for review."
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ops.length}
            onClick={() => {
              const p = makeProposal({
                title: `Event date moved to ${formatDate(date)}`,
                summary: '',
                reason: 'Planner changed the event date.',
                ops,
                tradeoffs: [],
                assumptions: [],
              });
              applyProposal(p, ops, 'planner', 'timeline');
              toast(`Event moved to ${formatDate(date)}. Review the change report on the Timeline.`, 'success', {
                label: 'Undo',
                onClick: () => undoLast(),
              });
              onClose();
            }}
          >
            <CalendarClock /> Apply new date
          </button>
        </>
      }
    >
      <div className="row-wrap" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
        <Field label="New event date" htmlFor="new-date" error={error || undefined}>
          <input
            id="new-date"
            type="date"
            className="input"
            value={date}
            min={addDays(today, 1)}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: 200 }}
            aria-invalid={!!error}
          />
        </Field>
        <div className="small muted" style={{ paddingBottom: 10 }}>
          Currently {formatDate(plan.brief.eventDate, { weekday: true })}
        </div>
      </div>
      {ops.length > 0 ? <ProposalPreview plan={plan} ops={ops} /> : !error && <Notice>Pick a different date to preview the impact.</Notice>}
    </Modal>
  );
}

function EditableText({
  value,
  onSave,
  multiline,
  label,
  asList,
}: {
  value: string | string[];
  onSave: (v: string) => void;
  multiline?: boolean;
  label: string;
  asList?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const text = Array.isArray(value) ? value.join('\n') : value;
  const [draft, setDraft] = useState(text);
  if (editing) {
    return (
      <div className="stack">
        <textarea
          className="textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={label}
          rows={multiline ? 6 : 3}
          autoFocus
        />
        {asList && <div className="field-hint">One item per line.</div>}
        <div className="row">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              onSave(draft);
              setEditing(false);
            }}
          >
            Save
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              setDraft(text);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="editable" style={{ paddingRight: 34 }}>
      {Array.isArray(value) ? (
        <ul className="bullets">
          {value.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0 }} className={multiline ? 'brief-vision' : ''}>
          {value}
        </p>
      )}
      <button
        className="icon-btn edit-btn"
        aria-label={`Edit ${label}`}
        onClick={() => {
          setDraft(text);
          setEditing(true);
        }}
      >
        <Pencil />
      </button>
    </div>
  );
}

export function BriefView({ plan }: { plan: EventPlan }) {
  const ins = useInsights(plan);
  const [editing, setEditing] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const regenerate = useWorkspace((s) => s.regenerateNarrative);
  const updateNarrative = useWorkspace((s) => s.updateNarrative);
  const openCopilot = useUI((s) => s.openCopilot);
  const { brief, narrative } = plan;
  const cur = brief.currency;
  const outlook = seasonOutlook(brief.city, brief.country, brief.eventDate);
  const save = (f: NarrativeField) => (v: string) => {
    updateNarrative(f, f === 'vision' || f === 'audience' ? v : v.split('\n'));
    toast('Brief updated. This section will be kept if the brief is regenerated.');
  };
  const topLines = [...ins.budget.lines].sort((a, b) => b.plannedTotal - a.plannedTotal);
  const booked = new Set(plan.vendors.filter((v) => BOOKED_STATUSES.has(v.status)).map((v) => v.category));
  const appliedTheme = plan.themes.find((t) => t.id === plan.appliedThemeId);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {eventTypeLabel(brief.type, brief.customTypeLabel)} · Generated {formatDate(narrative.generatedAt.slice(0, 10))}
          </div>
          <h2 style={{ fontSize: 26, marginTop: 4 }}>{brief.name}</h2>
          <p>
            A client-ready brief built from the intake. Narrative sections are editable; budget, milestones, vendors and risks below are
            live from the plan.
          </p>
        </div>
        <div className="row-wrap">
          <button className="btn" onClick={() => setEditing(true)}>
            <Pencil /> Edit brief details
          </button>
          <button
            className="btn"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Regenerate the brief narrative?',
                body: 'Vision, objectives, audience, assumptions and open questions are rebuilt from the current brief details. Sections you edited by hand are kept, and tasks, budget and vendors are not touched.',
                confirmLabel: 'Regenerate',
              });
              if (ok) {
                regenerate();
                toast('Narrative regenerated. Hand-edited sections were kept.');
              }
            }}
          >
            <RefreshCw /> Regenerate
          </button>
          <a className="btn btn-primary" href={hrefFor({ name: 'report', eventId: plan.id, kind: 'brief' })}>
            Client-ready brief
          </a>
        </div>
      </div>

      <section className="card card-pad">
        <div className="row-between" style={{ marginBottom: 8 }}>
          <div className="eyebrow">
            Creative vision{' '}
            {narrative.edited.vision && (
              <span className="badge badge-outline" style={{ marginLeft: 6 }}>
                Edited
              </span>
            )}
          </div>
        </div>
        <EditableText value={narrative.vision} onSave={save('vision')} multiline label="creative vision" />
      </section>

      <section aria-labelledby="facts-h">
        <h3 id="facts-h" style={{ marginBottom: 10 }}>
          Key facts
        </h3>
        <div className="facts">
          <Fact
            k="Date"
            v={
              <>
                {formatDate(brief.eventDate, { weekday: true })}{' '}
                <button className="link-btn small" onClick={() => setDateOpen(true)}>
                  change
                </button>
              </>
            }
          />
          <Fact k="Duration" v={`${plural(brief.durationDays, 'day')} · ${plural(brief.sessions.length, 'session')}`} />
          <Fact k="Guests" v={`${brief.guestCount} expected`} />
          <Fact k="Budget ceiling" v={`${formatMoneyCompact(brief.totalBudget, cur)} (${cur})`} />
          <Fact k="Venue" v={`${brief.venueName || 'Not chosen'} — ${VENUE_STATUS_LABEL[brief.venueStatus]}`} />
          <Fact k="City" v={[brief.city, brief.country].filter(Boolean).join(', ') || 'Not specified'} />
          <Fact k="Setting" v={SETTING_LABEL[brief.setting]} />
          <Fact k="Season" v={`${outlook.label}`} />
          <Fact k="Style" v={brief.style || '—'} />
          <Fact
            k="Palette"
            v={
              brief.colors.length ? (
                <span className="row" style={{ gap: 4 }}>
                  {brief.colors.map((c) => (
                    <span
                      key={c}
                      title={c}
                      style={{ width: 18, height: 18, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,.1)' }}
                    />
                  ))}
                </span>
              ) : (
                '—'
              )
            }
          />
          <Fact k="Planner / client" v={`${brief.plannerName || '—'} / ${brief.clientName || '—'}`} />
          <Fact k="Protected in budget" v={brief.protectedCategories.map((k) => categoryMeta(k)?.label ?? k).join(', ') || 'None set'} />
        </div>
      </section>

      <div className="grid-2">
        <section className="card card-pad stack">
          <h3>Objectives</h3>
          <EditableText value={narrative.objectives} onSave={save('objectives')} label="objectives" asList />
          <h3 style={{ marginTop: 18 }}>Audience & needs</h3>
          <EditableText value={narrative.audience} onSave={save('audience')} label="audience" />
          <div className="mini-h">Cultural or ceremonial preferences (provided by the client)</div>
          <p className="ink-2" style={{ margin: 0 }}>
            {brief.culturalPreferences || <span className="muted">None provided — nothing has been assumed.</span>}
          </p>
        </section>
        <section className="card card-pad stack">
          <h3>Assumptions</h3>
          <ul className="bullets">
            {narrative.assumptions.map((a) => (
              <li key={a.id}>
                {a.text}{' '}
                {a.field && (
                  <button className="link-btn small" onClick={() => (a.field === 'eventDate' ? setDateOpen(true) : setEditing(true))}>
                    edit
                  </button>
                )}
              </li>
            ))}
          </ul>
          <h3 style={{ marginTop: 18 }}>Open questions</h3>
          <EditableText value={narrative.openQuestions} onSave={save('openQuestions')} label="open questions" asList />
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Sessions</h3>
            <div className="sub">
              {brief.sessions.every((s) => s.start) ? 'Timings are planning suggestions until confirmed in the Run of Show.' : ''}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            <Pencil /> Edit sessions
          </button>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Day</th>
                <th>Time</th>
                <th>Setting</th>
                <th className="hide-sm">Area</th>
                <th className="hide-sm">Meal</th>
              </tr>
            </thead>
            <tbody>
              {[...brief.sessions]
                .sort((a, b) => a.dayIndex - b.dayIndex || a.start.localeCompare(b.start))
                .map((s) => (
                  <tr key={s.id}>
                    <td className="cell-main">{s.name}</td>
                    <td className="nowrap">
                      Day {s.dayIndex + 1} · {formatDate(addDays(brief.eventDate, s.dayIndex), { year: false })}
                    </td>
                    <td className="num nowrap">
                      {s.start}–{s.end}
                    </td>
                    <td>{SETTING_LABEL[s.setting]}</td>
                    <td className="hide-sm">{s.area}</td>
                    <td className="hide-sm">{s.hasMeal ? 'Yes' : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Preliminary budget allocation</h3>
              <div className="sub">Live from Budget Lab · {plan.budget.contingencyPct}% contingency</div>
            </div>
            <a className="btn btn-sm btn-ghost" href={hrefFor({ name: 'view', eventId: plan.id, view: 'budget' })}>
              Budget Lab <ArrowRight />
            </a>
          </div>
          <div className="card-body">
            {topLines.slice(0, 8).map((l) => (
              <div key={l.key} className="row-between small" style={{ padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{l.label}</span>
                <span className="num">
                  {formatMoneyCompact(l.plannedTotal, cur)}{' '}
                  <span className="muted">
                    · {ins.budget.plannedSubtotal ? Math.round((l.plannedTotal / ins.budget.plannedSubtotal) * 100) : 0}%
                  </span>
                </span>
              </div>
            ))}
            <div className="row-between small strong" style={{ paddingTop: 8 }}>
              <span>Planned total incl. contingency</span>
              <span className="num">
                {formatMoneyCompact(ins.budget.plannedTotal, cur)} of {formatMoneyCompact(ins.budget.ceiling, cur)}
              </span>
            </div>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Recommended milestones</h3>
              <div className="sub">Live from the timeline</div>
            </div>
            <a className="btn btn-sm btn-ghost" href={hrefFor({ name: 'view', eventId: plan.id, view: 'timeline' })}>
              Timeline <ArrowRight />
            </a>
          </div>
          <ul className="list card-body list-tight" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {plan.tasks
              .filter((t) => t.milestone)
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              .map((t) => (
                <li key={t.id} className="row-between small">
                  <span
                    className={t.status === 'done' ? 'muted' : ''}
                    style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}
                  >
                    {t.title}
                  </span>
                  <span className="num nowrap">{formatDate(t.dueDate, { year: false })}</span>
                </li>
              ))}
          </ul>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Vendor categories</h3>
              <div className="sub">What needs to be sourced</div>
            </div>
            <a className="btn btn-sm btn-ghost" href={hrefFor({ name: 'view', eventId: plan.id, view: 'vendors' })}>
              Vendor Hub <ArrowRight />
            </a>
          </div>
          <div className="card-body row-wrap">
            {plan.budget.categories.map((c) => {
              const n = plan.vendors.filter((v) => v.category === c.key && v.status !== 'rejected').length;
              return (
                <span key={c.key} className={`badge ${booked.has(c.key) ? 'badge-ok' : n ? 'badge-gold' : 'badge-outline'}`}>
                  {categoryMeta(c.key)?.vendorLabel ?? c.label} · {booked.has(c.key) ? 'booked' : n ? `${n} in pipeline` : 'to source'}
                </span>
              );
            })}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Theme & guest-experience ideas</h3>
              <div className="sub">{appliedTheme ? `Applied concept: ${appliedTheme.name}` : 'No concept applied yet'}</div>
            </div>
            <a className="btn btn-sm btn-ghost" href={hrefFor({ name: 'view', eventId: plan.id, view: 'themes' })}>
              Theme Studio <ArrowRight />
            </a>
          </div>
          <div className="card-body">
            <EditableText
              value={narrative.guestExperienceIdeas}
              onSave={save('guestExperienceIdeas')}
              label="guest experience ideas"
              asList
            />
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Risks & immediate actions</h3>
            <div className="sub">Computed from the live plan, plus risks you flagged</div>
          </div>
          <button className="btn btn-sm btn-gold" onClick={() => openCopilot('Find the biggest financial risks in this plan.')}>
            <Sparkles /> Ask about risks
          </button>
        </div>
        <div className="card-body grid-2">
          <div>
            <div className="mini-h" style={{ marginTop: 0 }}>
              Risks
            </div>
            <ul className="bullets small">
              {ins.risks.slice(0, 7).map((r) => (
                <li key={r.id}>
                  <strong>{r.title}</strong> — {r.detail}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mini-h" style={{ marginTop: 0 }}>
              Immediate actions
            </div>
            <ol className="bullets small">
              {ins.actions.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong> — {a.why}
                </li>
              ))}
            </ol>
            <div className="mini-h">Seasonal outlook</div>
            <ul className="bullets small">
              {outlook.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <div className="tiny muted">{outlook.disclaimer}</div>
          </div>
        </div>
      </section>

      {editing && <BriefEditor plan={plan} onClose={() => setEditing(false)} onDateChange={() => setDateOpen(true)} />}
      {dateOpen && <DateChangeDialog plan={plan} open={dateOpen} onClose={() => setDateOpen(false)} />}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="fact">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function BriefEditor({ plan, onClose, onDateChange }: { plan: EventPlan; onClose: () => void; onDateChange: () => void }) {
  const updateBrief = useWorkspace((s) => s.updateBrief);
  const edit = useWorkspace((s) => s.edit);
  const [d, setD] = useState<EventBrief>(() => structuredClone(plan.brief));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof EventBrief>(k: K, v: EventBrief[K]) => setD((x) => ({ ...x, [k]: v }));
  const setSession = (id: string, patch: Partial<Session>) =>
    setD((x) => ({ ...x, sessions: x.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const save = () => {
    const e: Record<string, string> = {};
    if (d.name.trim().length < 2) e.name = 'Name is required.';
    if (!Number.isInteger(d.guestCount) || d.guestCount < 1) e.guestCount = 'Whole number, at least 1.';
    if (!(d.totalBudget > 0)) e.totalBudget = 'Must be greater than zero.';
    if (!Number.isInteger(d.durationDays) || d.durationDays < 1 || d.durationDays > 14) e.durationDays = '1–14 days.';
    if (d.sessions.some((s) => !s.name.trim() || !isValidTime(s.start) || !isValidTime(s.end) || s.dayIndex >= d.durationDays))
      e.sessions = 'Every session needs a name, valid times and a day within the event.';
    if (!d.sessions.length) e.sessions = 'Add at least one session.';
    if (d.dietary.vegetarianPct < 0 || d.dietary.vegetarianPct > 100) e.dietary = 'Vegetarian share must be 0–100%.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const dateChanged = d.eventDate !== plan.brief.eventDate;
    const patch: Partial<EventBrief> = { ...d, eventDate: plan.brief.eventDate };
    updateBrief(patch, 'Edited event brief details');
    if (d.durationDays !== plan.brief.durationDays) {
      edit(`Event duration set to ${d.durationDays} days`, 'runofshow', (p) => {
        for (let i = 0; i < d.durationDays; i++)
          if (!p.daySettings.some((x) => x.dayIndex === i))
            p.daySettings.push({ dayIndex: i, soundCutoff: p.daySettings[0]?.soundCutoff ?? '' });
      });
    }
    toast('Brief details saved. Budget, scenarios and timeline flags recalculated.');
    onClose();
    if (dateChanged) {
      toast('Date changes need a schedule review — opening the preview.', 'info');
      onDateChange();
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      wide
      title="Edit brief details"
      subtitle="Changes recalculate the budget, scenarios and dependency flags. The narrative updates when you regenerate."
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save brief
          </button>
        </>
      }
    >
      <div className="stack-lg">
        <div className="form-grid">
          <Field label="Event name" htmlFor="b-name" error={errors.name} className="span-2">
            <input id="b-name" className="input" value={d.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Event type" htmlFor="b-type">
            <select id="b-type" className="select" value={d.type} onChange={(e) => set('type', e.target.value as EventBrief['type'])}>
              {EVENT_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          {d.type === 'custom' && (
            <Field label="Custom type" htmlFor="b-ctype">
              <input id="b-ctype" className="input" value={d.customTypeLabel} onChange={(e) => set('customTypeLabel', e.target.value)} />
            </Field>
          )}
          <Field label="City" htmlFor="b-city">
            <input id="b-city" className="input" value={d.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Country" htmlFor="b-country">
            <input id="b-country" className="input" value={d.country} onChange={(e) => set('country', e.target.value)} />
          </Field>
          <Field label="Venue name" htmlFor="b-venue">
            <input id="b-venue" className="input" value={d.venueName} onChange={(e) => set('venueName', e.target.value)} />
          </Field>
          <Field label="Venue status" htmlFor="b-vstatus">
            <select
              id="b-vstatus"
              className="select"
              value={d.venueStatus}
              onChange={(e) => set('venueStatus', e.target.value as VenueStatus)}
            >
              {Object.entries(VENUE_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Event date" htmlFor="b-date" hint="Saving a new date opens a schedule-impact preview first.">
            <input id="b-date" type="date" className="input" value={d.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
          </Field>
          <Field label="Duration (days)" htmlFor="b-days" error={errors.durationDays}>
            <input
              id="b-days"
              className="input input-num"
              type="number"
              min={1}
              max={14}
              value={d.durationDays}
              onChange={(e) => set('durationDays', Number(e.target.value))}
            />
          </Field>
          <Field label="Guest count" htmlFor="b-guests" error={errors.guestCount}>
            <input
              id="b-guests"
              className="input input-num"
              type="number"
              min={1}
              value={d.guestCount}
              onChange={(e) => set('guestCount', Number(e.target.value))}
            />
          </Field>
          <Field
            label="Budget ceiling"
            htmlFor="b-budget"
            error={errors.totalBudget}
            hint={formatMoneyCompact(d.totalBudget || 0, d.currency)}
          >
            <input
              id="b-budget"
              className="input input-num"
              type="number"
              min={1}
              value={d.totalBudget}
              onChange={(e) => set('totalBudget', Number(e.target.value))}
            />
          </Field>
          <Field label="Currency" htmlFor="b-cur">
            <select
              id="b-cur"
              className="select"
              value={d.currency}
              onChange={(e) => set('currency', e.target.value as EventBrief['currency'])}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Overall setting" htmlFor="b-setting">
            <select id="b-setting" className="select" value={d.setting} onChange={(e) => set('setting', e.target.value as Setting)}>
              {Object.entries(SETTING_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Style" htmlFor="b-style">
            <input id="b-style" className="input" value={d.style} onChange={(e) => set('style', e.target.value)} />
          </Field>
          <Field label="Atmosphere" htmlFor="b-atm" className="span-2">
            <textarea id="b-atm" className="textarea" value={d.atmosphere} onChange={(e) => set('atmosphere', e.target.value)} />
          </Field>
          <Field
            label="Cultural or ceremonial preferences"
            htmlFor="b-cult"
            className="span-2"
            hint="Only what the client has told you. Sutrā never infers this from names or location."
          >
            <textarea
              id="b-cult"
              className="textarea"
              value={d.culturalPreferences}
              onChange={(e) => set('culturalPreferences', e.target.value)}
            />
          </Field>
        </div>

        <div>
          <div className="row-between">
            <h3>Sessions</h3>
            <button
              className="btn btn-sm"
              onClick={() =>
                setD((x) => ({
                  ...x,
                  sessions: [
                    ...x.sessions,
                    {
                      id: uid('s'),
                      name: 'New session',
                      dayIndex: 0,
                      start: '18:00',
                      end: '21:00',
                      setting: 'indoor',
                      hasMeal: true,
                      area: 'Main area',
                    },
                  ],
                }))
              }
            >
              <Plus /> Add session
            </button>
          </div>
          {errors.sessions && (
            <div className="field-error" style={{ marginTop: 6 }}>
              {errors.sessions}
            </div>
          )}
          <div className="stack" style={{ marginTop: 10 }}>
            {d.sessions.map((s) => (
              <div key={s.id} className="card card-pad" style={{ padding: 12 }}>
                <div className="form-grid-3">
                  <Field label="Name" htmlFor={`s-n-${s.id}`}>
                    <input
                      id={`s-n-${s.id}`}
                      className="input input-sm"
                      value={s.name}
                      onChange={(e) => setSession(s.id, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Day" htmlFor={`s-d-${s.id}`}>
                    <select
                      id={`s-d-${s.id}`}
                      className="select input-sm"
                      value={s.dayIndex}
                      onChange={(e) => setSession(s.id, { dayIndex: Number(e.target.value) })}
                    >
                      {Array.from({ length: Math.max(1, d.durationDays) }, (_, i) => (
                        <option key={i} value={i}>
                          Day {i + 1}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Area" htmlFor={`s-a-${s.id}`}>
                    <input
                      id={`s-a-${s.id}`}
                      className="input input-sm"
                      value={s.area}
                      onChange={(e) => setSession(s.id, { area: e.target.value })}
                    />
                  </Field>
                  <Field label="Start" htmlFor={`s-s-${s.id}`}>
                    <input
                      id={`s-s-${s.id}`}
                      type="time"
                      className="input input-sm"
                      value={s.start}
                      onChange={(e) => setSession(s.id, { start: e.target.value })}
                    />
                  </Field>
                  <Field label="End" htmlFor={`s-e-${s.id}`}>
                    <input
                      id={`s-e-${s.id}`}
                      type="time"
                      className="input input-sm"
                      value={s.end}
                      onChange={(e) => setSession(s.id, { end: e.target.value })}
                    />
                  </Field>
                  <Field label="Setting" htmlFor={`s-t-${s.id}`}>
                    <select
                      id={`s-t-${s.id}`}
                      className="select input-sm"
                      value={s.setting}
                      onChange={(e) => setSession(s.id, { setting: e.target.value as Setting })}
                    >
                      {Object.entries(SETTING_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <label className="check">
                    <input type="checkbox" checked={s.hasMeal} onChange={(e) => setSession(s.id, { hasMeal: e.target.checked })} /> Includes
                    a meal service
                  </label>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => setD((x) => ({ ...x, sessions: x.sessions.filter((y) => y.id !== s.id) }))}
                  >
                    <Trash2 /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <div className="span-2">
            <h3>Dietary & accessibility</h3>
          </div>
          <label className="check span-2">
            <input type="checkbox" checked={d.dietarySpecified} onChange={(e) => set('dietarySpecified', e.target.checked)} /> The client
            has confirmed the dietary mix
          </label>
          {d.dietarySpecified && (
            <>
              <Field label="Vegetarian share (%)" htmlFor="b-veg" error={errors.dietary}>
                <input
                  id="b-veg"
                  className="input input-num"
                  type="number"
                  min={0}
                  max={100}
                  value={d.dietary.vegetarianPct}
                  onChange={(e) => set('dietary', { ...d.dietary, vegetarianPct: Number(e.target.value) })}
                />
              </Field>
              <Field label="Vegan guests" htmlFor="b-vegan">
                <input
                  id="b-vegan"
                  className="input input-num"
                  type="number"
                  min={0}
                  value={d.dietary.veganCount}
                  onChange={(e) => set('dietary', { ...d.dietary, veganCount: Number(e.target.value) })}
                />
              </Field>
              <Field label="Jain guests" htmlFor="b-jain">
                <input
                  id="b-jain"
                  className="input input-num"
                  type="number"
                  min={0}
                  value={d.dietary.jainCount}
                  onChange={(e) => set('dietary', { ...d.dietary, jainCount: Number(e.target.value) })}
                />
              </Field>
              <Field label="Allergens (comma separated)" htmlFor="b-all">
                <input
                  id="b-all"
                  className="input"
                  value={d.dietary.allergens.join(', ')}
                  onChange={(e) =>
                    set('dietary', {
                      ...d.dietary,
                      allergens: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
            </>
          )}
          <div className="span-2">
            <div className="field-label" style={{ marginBottom: 6 }}>
              Accessibility needs
            </div>
            <div className="row-wrap">
              {ACCESSIBILITY_OPTIONS.map((o) => (
                <button
                  key={o}
                  type="button"
                  className="chip"
                  aria-pressed={d.accessibility.includes(o)}
                  onClick={() =>
                    set('accessibility', d.accessibility.includes(o) ? d.accessibility.filter((x) => x !== o) : [...d.accessibility, o])
                  }
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <Field label="Weather or venue constraints" htmlFor="b-weather" className="span-2">
            <input id="b-weather" className="input" value={d.weatherConcerns} onChange={(e) => set('weatherConcerns', e.target.value)} />
          </Field>
        </div>

        <div className="form-grid">
          <div className="span-2">
            <h3>People & priorities</h3>
          </div>
          <Field label="Lead planner" htmlFor="b-planner">
            <input id="b-planner" className="input" value={d.plannerName} onChange={(e) => set('plannerName', e.target.value)} />
          </Field>
          <Field label="Client" htmlFor="b-client">
            <input id="b-client" className="input" value={d.clientName} onChange={(e) => set('clientName', e.target.value)} />
          </Field>
          <div className="span-2">
            <div className="field-label" style={{ marginBottom: 6 }}>
              Protect in budget (never cut automatically)
            </div>
            <div className="row-wrap">
              {CATEGORY_META.filter((m) => plan.budget.categories.some((c) => c.key === m.key)).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className="chip"
                  aria-pressed={d.protectedCategories.includes(m.key)}
                  onClick={() =>
                    set(
                      'protectedCategories',
                      d.protectedCategories.includes(m.key)
                        ? d.protectedCategories.filter((x) => x !== m.key)
                        : [...d.protectedCategories, m.key],
                    )
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Non-negotiables (one per line)" htmlFor="b-nn" className="span-2">
            <textarea
              id="b-nn"
              className="textarea"
              value={d.nonNegotiables.join('\n')}
              onChange={(e) =>
                set(
                  'nonNegotiables',
                  e.target.value
                    .split('\n')
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
            />
          </Field>
          <Field label="Known risks (one per line)" htmlFor="b-risks" className="span-2">
            <textarea
              id="b-risks"
              className="textarea"
              value={d.knownRisks.join('\n')}
              onChange={(e) =>
                set(
                  'knownRisks',
                  e.target.value
                    .split('\n')
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
            />
          </Field>
        </div>
      </div>
    </Drawer>
  );
}
