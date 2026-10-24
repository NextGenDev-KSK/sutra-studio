import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Lock } from 'lucide-react';
import { VENDOR_STATUS_ORDER, VENDOR_STATUS_LABEL } from '../domain/catalog';
import { computeImpact } from '../domain/impact';
import { applyOps, describeOp, validateOps, type PlanOp } from '../domain/ops';
import type { EventPlan } from '../domain/types';
import { formatDate, formatMoneyCompact, plural } from '../domain/util';
import { useToday } from './common';

function Delta({
  before,
  after,
  currency,
  invert,
}: {
  before: number;
  after: number;
  currency: EventPlan['brief']['currency'];
  invert?: boolean;
}) {
  const d = after - before;
  if (Math.round(d) === 0) return <span className="d muted">no change</span>;
  const good = invert ? d > 0 : d < 0;
  return (
    <span className={`d ${good ? 'delta-down' : 'delta-up'}`}>
      {d > 0 ? '+' : '−'}
      {formatMoneyCompact(Math.abs(d), currency)}
    </span>
  );
}

export function OpEditor({ op, onChange }: { op: PlanOp; onChange: (op: PlanOp) => void }) {
  const num = (v: string) => Number(v.replace(/[,\s]/g, ''));
  switch (op.op) {
    case 'setCategoryPlanned':
      return (
        <input
          className="input input-sm input-num edit-num"
          aria-label="New amount"
          defaultValue={op.planned}
          onBlur={(e) => Number.isFinite(num(e.target.value)) && onChange({ ...op, planned: Math.max(0, num(e.target.value)) })}
        />
      );
    case 'setContingencyPct':
      return (
        <input
          className="input input-sm input-num edit-num"
          aria-label="Contingency percent"
          defaultValue={op.pct}
          onBlur={(e) => onChange({ ...op, pct: num(e.target.value) })}
        />
      );
    case 'setGuestCount':
      return (
        <input
          className="input input-sm input-num edit-num"
          aria-label="Guest count"
          defaultValue={op.count}
          onBlur={(e) => onChange({ ...op, count: Math.round(num(e.target.value)) })}
        />
      );
    case 'setTotalBudget':
      return (
        <input
          className="input input-sm input-num edit-num"
          aria-label="Budget ceiling"
          defaultValue={op.amount}
          onBlur={(e) => onChange({ ...op, amount: num(e.target.value) })}
        />
      );
    case 'setEventDate':
      return (
        <input
          type="date"
          className="input input-sm"
          aria-label="New event date"
          defaultValue={op.date}
          onChange={(e) => e.target.value && onChange({ ...op, date: e.target.value })}
          style={{ width: 170 }}
        />
      );
    case 'addTask':
      return (
        <input
          className="input input-sm"
          aria-label="Task title"
          defaultValue={op.title}
          onBlur={(e) => onChange({ ...op, title: e.target.value })}
        />
      );
    case 'updateTask':
      return op.dueDate ? (
        <input
          type="date"
          className="input input-sm"
          aria-label="New due date"
          defaultValue={op.dueDate}
          onChange={(e) => e.target.value && onChange({ ...op, dueDate: e.target.value })}
          style={{ width: 170 }}
        />
      ) : null;
    case 'setVendorStatus':
      return (
        <select
          className="select input-sm"
          aria-label="Vendor status"
          value={op.status}
          onChange={(e) => onChange({ ...op, status: e.target.value as typeof op.status })}
          style={{ width: 170 }}
        >
          {VENDOR_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {VENDOR_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      );
    case 'setDietary':
      return (
        <input
          className="input input-sm input-num edit-num"
          aria-label="Vegetarian percent"
          defaultValue={op.vegetarianPct}
          onBlur={(e) => onChange({ ...op, vegetarianPct: num(e.target.value) })}
        />
      );
    case 'updateBrief':
      return (
        <input
          className="input input-sm"
          aria-label="New value"
          defaultValue={op.value}
          onBlur={(e) => onChange({ ...op, value: e.target.value })}
        />
      );
    case 'addRisk':
      return (
        <input
          className="input input-sm"
          aria-label="Risk"
          defaultValue={op.text}
          onBlur={(e) => onChange({ ...op, text: e.target.value })}
        />
      );
    case 'addNote':
      return (
        <input
          className="input input-sm"
          aria-label="Note title"
          defaultValue={op.title}
          onBlur={(e) => onChange({ ...op, title: e.target.value })}
        />
      );
    default:
      return null;
  }
}

export interface PreviewProps {
  plan: EventPlan;
  ops: PlanOp[];
  enabled?: boolean[];
  editing?: boolean;
  onToggle?: (i: number) => void;
  onEdit?: (i: number, op: PlanOp) => void;
  compact?: boolean;
}

/** Validates and previews a set of changes against the live plan. */
export function usePreview(plan: EventPlan, ops: PlanOp[]) {
  const today = useToday();
  return useMemo(() => {
    const errors = validateOps(plan, ops, today);
    if (errors.length) return { errors, impact: null };
    const { plan: after } = applyOps(plan, ops, today);
    return { errors, impact: computeImpact(plan, after, today), after };
  }, [plan, ops, today]);
}

export function ProposalPreview({ plan, ops, enabled, editing, onToggle, onEdit, compact }: PreviewProps) {
  const active = useMemo(() => ops.filter((_, i) => enabled?.[i] ?? true), [ops, enabled]);
  const { errors, impact } = usePreview(plan, active);
  const cur = plan.brief.currency;
  const m = (n: number) => formatMoneyCompact(n, cur);

  return (
    <div className="proposal-preview">
      <div className="mini-h">Proposed changes</div>
      <div>
        {ops.map((op, i) => (
          <div className="op-row" key={i}>
            {editing ? (
              <input
                type="checkbox"
                checked={enabled?.[i] ?? true}
                onChange={() => onToggle?.(i)}
                aria-label={`Include change ${i + 1}`}
                style={{ marginTop: 3, accentColor: 'var(--forest)' }}
              />
            ) : (
              <ArrowRight style={{ width: 14, height: 14, marginTop: 3, color: 'var(--gold-strong)' }} />
            )}
            <div style={{ opacity: enabled?.[i] === false ? 0.45 : 1 }}>
              <div>{describeOp(plan, op)}</div>
              {editing && enabled?.[i] !== false && onEdit && (
                <div style={{ marginTop: 4 }}>
                  <OpEditor op={op} onChange={(next) => onEdit(i, next)} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="notice notice-danger" style={{ marginTop: 10 }} role="alert">
          <AlertTriangle />
          <div>
            <strong>Can’t apply yet:</strong>
            <ul className="bullets" style={{ marginTop: 4 }}>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {impact && (
        <>
          <div className="mini-h">Current → proposed</div>
          <div className="impact-grid">
            <div className="impact-cell">
              <div className="k">Forecast total</div>
              <div className="v">{m(impact.budget.forecastAfter)}</div>
              <Delta before={impact.budget.forecastBefore} after={impact.budget.forecastAfter} currency={cur} />
            </div>
            <div className="impact-cell">
              <div className="k">Remaining</div>
              <div className="v">
                {impact.budget.remainingAfter < 0 ? '−' : ''}
                {m(Math.abs(impact.budget.remainingAfter))}
              </div>
              <Delta before={impact.budget.remainingBefore} after={impact.budget.remainingAfter} currency={cur} invert />
            </div>
            <div className="impact-cell">
              <div className="k">Cost per guest</div>
              <div className="v">{m(impact.budget.perGuestAfter)}</div>
              <Delta before={impact.budget.perGuestBefore} after={impact.budget.perGuestAfter} currency={cur} />
            </div>
          </div>

          {impact.budget.categories.length > 0 && !compact && (
            <>
              <div className="mini-h">Budget impact by category</div>
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
                <table className="table" style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="r">Planned</th>
                      <th className="r">Forecast</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact.budget.categories.map((c) => (
                      <tr key={c.key}>
                        <td>{c.label}</td>
                        <td className="r">
                          {m(c.plannedBefore)} → {m(c.plannedAfter)}
                        </td>
                        <td className="r">
                          {m(c.forecastBefore)} → {m(c.forecastAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {(impact.timeline.schedule ||
            impact.timeline.added.length > 0 ||
            impact.timeline.statusChanges.length > 0 ||
            impact.timeline.newlyBlocked.length > 0 ||
            impact.timeline.unblocked.length > 0 ||
            impact.timeline.newlyAtRisk.length > 0) && (
            <>
              <div className="mini-h">Timeline & dependencies</div>
              <ul className="bullets small">
                {impact.timeline.schedule && (
                  <>
                    <li>
                      <CalendarClock style={{ display: 'inline', width: 13, height: 13, verticalAlign: '-2px' }} /> Event date{' '}
                      {formatDate(impact.timeline.schedule.oldDate)} → <strong>{formatDate(impact.timeline.schedule.newDate)}</strong> (
                      {impact.timeline.schedule.deltaDays > 0 ? '+' : ''}
                      {impact.timeline.schedule.deltaDays} days)
                    </li>
                    <li>
                      {plural(impact.timeline.schedule.moved.length, 'task')} move with the event;{' '}
                      {plural(impact.timeline.schedule.preserved.length, 'completed task')} stay as they are
                      {impact.timeline.schedule.pinned.length
                        ? `; ${plural(impact.timeline.schedule.pinned.length, 'pinned task')} keep their dates`
                        : ''}
                      .
                    </li>
                    {impact.timeline.schedule.compressed.length > 0 && (
                      <li className="delta-up">
                        {plural(impact.timeline.schedule.compressed.length, 'task')} would fall in the past and are set to today:{' '}
                        {impact.timeline.schedule.compressed
                          .slice(0, 4)
                          .map((t) => t.title)
                          .join('; ')}
                        {impact.timeline.schedule.compressed.length > 4 ? '…' : ''}
                      </li>
                    )}
                    {impact.timeline.schedule.conflicts
                      .filter((c) => !c.includes('would fall in the past'))
                      .map((c) => (
                        <li key={c} className="delta-up">
                          {c}
                        </li>
                      ))}
                    {impact.timeline.schedule.paymentsAfterEvent.map((p) => (
                      <li key={p.id}>
                        Payment “{p.label}” ({formatDate(p.dueDate)}) now falls after the event.
                      </li>
                    ))}
                  </>
                )}
                {impact.timeline.added.map((t) => (
                  <li key={t.title}>
                    New task: {t.title} · due {formatDate(t.due)}
                  </li>
                ))}
                {impact.timeline.statusChanges.map((s) => (
                  <li key={s.title}>
                    {s.title}: {s.from} → {s.to}
                  </li>
                ))}
                {impact.timeline.newlyBlocked.length > 0 && (
                  <li className="delta-up">Newly blocked: {impact.timeline.newlyBlocked.join('; ')}</li>
                )}
                {impact.timeline.unblocked.length > 0 && <li className="delta-down">Unblocked: {impact.timeline.unblocked.join('; ')}</li>}
                {impact.timeline.newlyAtRisk.length > 0 && (
                  <li className="delta-up">Newly at risk of missing deadlines: {impact.timeline.newlyAtRisk.join('; ')}</li>
                )}
              </ul>
            </>
          )}

          {(impact.vendors.length > 0 || impact.sessions.length > 0 || impact.runOfShow.changed.length > 0 || impact.brief.length > 0) && (
            <>
              <div className="mini-h">Other effects</div>
              <ul className="bullets small">
                {impact.vendors.map((v) => (
                  <li key={v.name + v.to}>
                    {v.name}: {v.from} → {v.to}
                  </li>
                ))}
                {impact.sessions.map((s) => (
                  <li key={s.name + s.change}>
                    {s.name}: {s.change}
                  </li>
                ))}
                {impact.runOfShow.changed.length > 0 && (
                  <li>
                    Run of show updated: {impact.runOfShow.changed.join('; ')} (issues {impact.runOfShow.issuesBefore} →{' '}
                    {impact.runOfShow.issuesAfter})
                  </li>
                )}
                {impact.brief
                  .filter((b) => !['Event date', 'Guest count', 'Budget ceiling'].includes(b.field))
                  .map((b) => (
                    <li key={b.field}>
                      {b.field}: {b.from || '—'} → {b.to || '—'}
                    </li>
                  ))}
              </ul>
            </>
          )}
          {impact.isEmpty && (
            <div className="notice" style={{ marginTop: 8 }}>
              <Lock /> These changes would not alter the plan.
            </div>
          )}
          {!impact.isEmpty && !errors.length && (
            <div className="small muted" style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
              <CheckCircle2 style={{ width: 13, height: 13 }} /> Validated against the live plan. Nothing changes until you apply.
            </div>
          )}
        </>
      )}
    </div>
  );
}
