import { useMemo, useState } from 'react';
import { CheckCircle2, Plus, RotateCcw, Trash2, Wand2, AlertTriangle, Sparkles } from 'lucide-react';
import { BOOKED_STATUSES, budgetContext, computeScenarios, quoteTotal, unitsFor, type Scenario } from '../domain/budget';
import { SCENARIO_BLURB, SCENARIO_LABEL, categoryMeta } from '../domain/catalog';
import { makeProposal, type PlanOp } from '../domain/ops';
import type { EventPlan, Payment, PaymentStatus, ScenarioKey } from '../domain/types';
import { formatDate, formatMoney, formatMoneyCompact, isValidISODate, uid } from '../domain/util';
import { useWorkspace } from '../store/workspace';
import { BulletChart, ScenarioBars } from '../ui/charts';
import { CommitNumber, Field, Modal, Notice, Stat, Tabs, confirmDialog, toast } from '../ui/kit';
import { IllustrativeTag, Money, useInsights, useToday, useUI } from './common';
import { ProposalPreview } from './ProposalPreview';

type Tab = 'plan' | 'scenarios' | 'payments';

export function BudgetLab({ plan }: { plan: EventPlan }) {
  const [tab, setTab] = useState<Tab>('plan');
  const ins = useInsights(plan);
  const b = ins.budget;
  const cur = plan.brief.currency;
  const openCopilot = useUI((s) => s.openCopilot);
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 26 }}>Budget Lab</h2>
          <p>
            Every figure is computed from categories, vendor quotations, bookings and payments. Forecast = booked contracts, else the
            preferred quotation, else the planning estimate — plus a {b.contingencyPct}% contingency reserve.
          </p>
        </div>
        <button className="btn btn-gold" onClick={() => openCopilot('Find the biggest financial risks in this plan.')}>
          <Sparkles /> Ask about financial risks
        </button>
      </div>

      <section className="kpis" aria-label="Budget summary">
        <Stat label="Budget ceiling" value={<Money value={b.ceiling} currency={cur} />} sub={`${plan.brief.guestCount} guests`} />
        <Stat
          label="Forecast total"
          value={<Money value={b.forecastTotal} currency={cur} />}
          sub={`${b.utilisationPct.toFixed(1)}% of ceiling`}
          tone={b.forecastTotal > b.ceiling ? 'danger' : undefined}
        />
        <Stat
          label="Remaining"
          value={<Money value={b.remaining} currency={cur} />}
          sub={b.remaining < 0 ? 'over budget' : 'headroom after contingency'}
          tone={b.remaining < 0 ? 'danger' : 'ok'}
        />
        <Stat
          label="Cost per guest"
          value={<Money value={b.costPerGuest} currency={cur} />}
          sub={`+${formatMoneyCompact(b.marginalGuestCost, cur)} per extra guest`}
        />
        <Stat label="Committed" value={<Money value={b.committedTotal} currency={cur} />} sub="booked contracts" />
        <Stat
          label="Paid / outstanding"
          value={<Money value={b.paidTotal} currency={cur} />}
          sub={`${formatMoneyCompact(b.outstandingTotal, cur)} still owed`}
        />
      </section>

      <Tabs<Tab>
        label="Budget sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'plan', label: 'Plan & forecast' },
          { value: 'scenarios', label: 'Scenarios' },
          { value: 'payments', label: `Payments (${b.upcomingPayments.length} scheduled)` },
        ]}
      />
      {tab === 'plan' && <PlanTab plan={plan} />}
      {tab === 'scenarios' && <ScenariosTab plan={plan} />}
      {tab === 'payments' && <PaymentsTab plan={plan} />}
    </div>
  );
}

function PlanTab({ plan }: { plan: EventPlan }) {
  const ins = useInsights(plan);
  const b = ins.budget;
  const cur = plan.brief.currency;
  const updateCategory = useWorkspace((s) => s.updateCategory);
  const addCategory = useWorkspace((s) => s.addCategory);
  const removeCategory = useWorkspace((s) => s.removeCategory);
  const edit = useWorkspace((s) => s.edit);
  const [newLabel, setNewLabel] = useState('');
  const [newBasis, setNewBasis] = useState<'fixed' | 'perGuest'>('fixed');
  const ctx = budgetContext(plan.brief);
  const unitMismatches = plan.budget.categories.filter((c) => {
    const meta = categoryMeta(c.key);
    return meta && meta.basis === 'perGuest' && meta.basis === c.basis && meta.units !== 'one' && unitsFor(meta.units, ctx) !== c.units;
  });
  const m = (n: number) => formatMoneyCompact(n, cur);
  const sourceBadge = (s: string) =>
    s === 'committed' ? (
      <span className="badge badge-ok">Contract</span>
    ) : s === 'quote' ? (
      <span className="badge badge-gold">Preferred quote</span>
    ) : (
      <span className="badge badge-outline">Estimate</span>
    );

  return (
    <div className="stack-lg">
      <Notice tone="gold">
        <strong>Illustrative estimates.</strong> Planning amounts are benchmarks to start the conversation, not market prices. Quotations
        and contracts come from the Vendor Hub and replace estimates in the forecast automatically.
      </Notice>
      {b.warnings.filter((w) => w.severity !== 'info').length > 0 && (
        <div className="stack">
          {b.warnings
            .filter((w) => w.severity !== 'info')
            .map((w) => (
              <Notice key={w.id} tone={w.severity === 'danger' ? 'danger' : 'warn'}>
                {w.message}
              </Notice>
            ))}
        </div>
      )}
      {unitMismatches.map((c) => {
        const meta = categoryMeta(c.key)!;
        const want = unitsFor(meta.units, ctx);
        return (
          <Notice key={c.key} tone="info">
            {c.label} is planned for {c.units} {c.unitLabel || 'unit'}
            {c.units === 1 ? '' : 's'} per guest, but the brief now has {want} {meta.units === 'mealSessions' ? 'meal services' : 'nights'}.{' '}
            <button
              className="link-btn"
              onClick={() =>
                edit(
                  `Synced ${c.label} units to ${want}`,
                  'budget',
                  (p) => {
                    const x = p.budget.categories.find((y) => y.key === c.key);
                    if (x) x.units = want;
                  },
                  { undo: 'unit sync' },
                )
              }
            >
              Update to {want}
            </button>
          </Notice>
        );
      })}

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Categories</h3>
            <div className="sub">Edit planned amounts directly. Per-guest lines scale with the guest count ({plan.brief.guestCount}).</div>
          </div>
          {b.reconciles && (
            <span className="badge badge-ok">
              <CheckCircle2 /> Categories + contingency reconcile to the total
            </span>
          )}
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="table" aria-label="Budget categories">
            <thead>
              <tr>
                <th>Category</th>
                <th>Planned</th>
                <th className="r">Planned total</th>
                <th className="r hide-sm">Best quote</th>
                <th className="r hide-md">Committed</th>
                <th className="r hide-md">Paid</th>
                <th className="r">Forecast</th>
                <th className="r">Variance</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {b.lines.map((l) => {
                const cat = plan.budget.categories.find((c) => c.key === l.key);
                const flagged = l.variance > 0 && l.variancePct >= 3 && l.plannedTotal > 0;
                return (
                  <tr key={l.key} className={flagged ? (l.variancePct >= 10 ? 'is-danger' : 'is-flagged') : ''}>
                    <td>
                      <div className="cell-main">
                        {l.label}
                        {plan.brief.protectedCategories.includes(l.key) && (
                          <span className="badge badge-rose" style={{ marginLeft: 6 }}>
                            Protected
                          </span>
                        )}
                      </div>
                      <div className="cell-sub">
                        {l.basis === 'perGuest'
                          ? `Per guest × ${l.units}${l.unitLabel ? ` ${l.unitLabel}${l.units === 1 ? '' : 's'}` : ''}`
                          : 'Fixed'}
                        {l.vendorCount ? ` · ${l.vendorCount} vendor${l.vendorCount > 1 ? 's' : ''}` : ''}
                        {l.synthetic ? ' · auto-added' : ''}
                      </div>
                    </td>
                    <td style={{ minWidth: 130 }}>
                      {cat ? (
                        <div className="input-affix">
                          <CommitNumber
                            value={cat.planned}
                            min={0}
                            ariaLabel={`${l.label} planned ${l.basis === 'perGuest' ? 'rate per guest' : 'amount'}`}
                            className="input-sm"
                            onCommit={(v) => {
                              updateCategory(l.key, { planned: v });
                              toast(`${l.label} updated — forecast recalculated.`);
                            }}
                          />
                          {l.basis === 'perGuest' && <span className="affix">/guest</span>}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="r">{m(l.plannedTotal)}</td>
                    <td className="r hide-sm">{l.bestQuote === null ? <span className="muted">—</span> : m(l.bestQuote)}</td>
                    <td className="r hide-md">{l.committed ? m(l.committed) : <span className="muted">—</span>}</td>
                    <td className="r hide-md">{l.paid ? m(l.paid) : <span className="muted">—</span>}</td>
                    <td className="r">
                      <div>{m(l.forecast)}</div>
                      <div style={{ marginTop: 2 }}>{sourceBadge(l.source)}</div>
                    </td>
                    <td className="r" style={{ color: l.variance > 0 ? 'var(--danger)' : l.variance < 0 ? 'var(--ok)' : undefined }}>
                      {Math.round(l.variance) === 0 ? '—' : `${l.variance > 0 ? '+' : '−'}${m(Math.abs(l.variance))}`}
                    </td>
                    <td>
                      {cat && l.vendorCount === 0 && (
                        <button
                          className="icon-btn"
                          aria-label={`Remove ${l.label}`}
                          onClick={async () => {
                            if (
                              await confirmDialog({
                                title: `Remove ${l.label}?`,
                                body: 'The allocation is removed from the plan and scenarios. You can undo this.',
                                confirmLabel: 'Remove',
                                danger: true,
                              })
                            )
                              removeCategory(l.key);
                          }}
                        >
                          <Trash2 />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Subtotal</td>
                <td className="r">{m(b.plannedSubtotal)}</td>
                <td className="hide-sm" />
                <td className="r hide-md">{m(b.committedTotal)}</td>
                <td className="r hide-md">{m(b.paidTotal)}</td>
                <td className="r">{m(b.forecastSubtotal)}</td>
                <td colSpan={2} />
              </tr>
              <tr>
                <td>Contingency reserve</td>
                <td style={{ width: 130 }}>
                  <div className="input-affix">
                    <CommitNumber
                      value={plan.budget.contingencyPct}
                      min={0}
                      max={30}
                      className="input-sm"
                      ariaLabel="Contingency percent"
                      onCommit={(v) =>
                        edit(
                          `Set contingency to ${v}%`,
                          'budget',
                          (p) => {
                            p.budget.contingencyPct = v;
                          },
                          { undo: 'contingency change' },
                        )
                      }
                    />
                    <span className="affix">%</span>
                  </div>
                </td>
                <td className="r">{m(b.plannedContingency)}</td>
                <td className="hide-sm" />
                <td className="hide-md" />
                <td className="hide-md" />
                <td className="r">{m(b.contingency)}</td>
                <td colSpan={2} />
              </tr>
              <tr className="row-total">
                <td colSpan={2}>Total</td>
                <td className="r">{m(b.plannedTotal)}</td>
                <td className="hide-sm" />
                <td className="hide-md" />
                <td className="hide-md" />
                <td className="r">{m(b.forecastTotal)}</td>
                <td className="r" style={{ color: b.forecastTotal - b.plannedTotal > 0 ? 'var(--danger)' : 'var(--ok)' }}>
                  {Math.round(b.forecastTotal - b.plannedTotal) === 0
                    ? '—'
                    : `${b.forecastTotal > b.plannedTotal ? '+' : '−'}${m(Math.abs(b.forecastTotal - b.plannedTotal))}`}
                </td>
                <td />
              </tr>
              <tr>
                <td colSpan={2}>Ceiling · remaining</td>
                <td className="r">
                  {m(b.ceiling)} · {b.unallocated < 0 ? '−' : ''}
                  {m(Math.abs(b.unallocated))}
                </td>
                <td className="hide-sm" />
                <td className="hide-md" />
                <td className="hide-md" />
                <td className="r" style={{ color: b.remaining < 0 ? 'var(--danger)' : 'var(--ok)' }}>
                  {b.remaining < 0 ? '−' : ''}
                  {m(Math.abs(b.remaining))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="card-foot">
          <form
            className="row-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              if (newLabel.trim().length < 2) return toast('Name the category first.', 'error');
              addCategory(newLabel.trim(), newBasis);
              setNewLabel('');
              toast('Category added — set its planned amount.');
            }}
          >
            <label className="sr-only" htmlFor="new-cat">
              New category name
            </label>
            <input
              id="new-cat"
              className="input input-sm"
              placeholder="Add a category, e.g. Fireworks permit"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            <label className="sr-only" htmlFor="new-basis">
              Cost basis
            </label>
            <select
              id="new-basis"
              className="select input-sm"
              value={newBasis}
              onChange={(e) => setNewBasis(e.target.value as 'fixed' | 'perGuest')}
              style={{ width: 140 }}
            >
              <option value="fixed">Fixed amount</option>
              <option value="perGuest">Per guest</option>
            </select>
            <button className="btn btn-sm" type="submit">
              <Plus /> Add category
            </button>
          </form>
        </div>
      </section>

      <section className="card card-pad">
        <h3 style={{ marginBottom: 4 }}>Forecast against plan</h3>
        <p className="small muted">
          Bars show the forecast; the dark marker shows the planned allocation. Values are also in the table above.
        </p>
        <BulletChart
          ariaLabel="Forecast against planned allocation by category"
          legend={{ bar: 'Forecast', marker: 'Planned' }}
          rows={b.lines.map((l) => ({
            key: l.key,
            label: l.label,
            value: l.forecast,
            marker: l.plannedTotal,
            tone: l.variance > 0 && l.variancePct >= 10 ? 'danger' : l.variance > 0 && l.variancePct >= 3 ? 'warn' : undefined,
            display: m(l.forecast),
            tooltip: [
              ['Forecast', m(l.forecast)],
              ['Planned', m(l.plannedTotal)],
              ['Variance', `${l.variance >= 0 ? '+' : '−'}${m(Math.abs(l.variance))}`],
            ],
          }))}
        />
      </section>
    </div>
  );
}

function ScenariosTab({ plan }: { plan: EventPlan }) {
  const today = useToday();
  const [key, setKey] = useState<ScenarioKey>('balanced');
  const [adopting, setAdopting] = useState(false);
  const scenarios = useMemo(() => computeScenarios(plan, today), [plan, today]);
  const ins = useInsights(plan);
  const cur = plan.brief.currency;
  const m = (n: number) => formatMoneyCompact(n, cur);
  const setOverride = useWorkspace((s) => s.setScenarioOverride);
  const resetScenario = useWorkspace((s) => s.resetScenario);
  const edit = useWorkspace((s) => s.edit);
  const s = scenarios[key];
  const keys: ScenarioKey[] = ['lean', 'balanced', 'premium'];

  return (
    <div className="stack-lg">
      <div className="scenario-cards" role="group" aria-label="Choose a scenario">
        {keys.map((k) => {
          const x = scenarios[k];
          return (
            <button key={k} className="scenario-card" aria-pressed={k === key} onClick={() => setKey(k)}>
              <div className="row-between">
                <span className="eyebrow">{SCENARIO_LABEL[k]}</span>
                {x.withinCeiling ? (
                  <span className="badge badge-ok">Within ceiling</span>
                ) : (
                  <span className="badge badge-danger">Over ceiling</span>
                )}
              </div>
              <div className="total num">{m(x.total)}</div>
              <div className="small ink-2">
                {m(x.perGuest)} per guest · {x.deltaVsPlan >= 0 ? '+' : '−'}
                {m(Math.abs(x.deltaVsPlan))} vs current plan
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                {SCENARIO_BLURB[k]}
              </div>
            </button>
          );
        })}
      </div>

      <section className="card card-pad">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div>
            <h3>Totals against the ceiling</h3>
            <div className="small muted">Current plan (planned allocations incl. contingency) shown for reference.</div>
          </div>
          <label className="check small">
            <input
              type="checkbox"
              checked={plan.budget.allowPremiumOverCeiling}
              onChange={(e) =>
                edit(
                  e.target.checked ? 'Enabled over-ceiling premium comparison' : 'Capped premium scenario to the ceiling',
                  'budget',
                  (p) => {
                    p.budget.allowPremiumOverCeiling = e.target.checked;
                  },
                )
              }
            />
            Show premium uncapped (over-budget comparison)
          </label>
        </div>
        <ScenarioBars
          ceiling={plan.brief.totalBudget}
          format={m}
          rows={[
            { key: 'current', label: 'Current', total: ins.budget.plannedTotal, active: false },
            ...keys.map((k) => ({ key: k, label: SCENARIO_LABEL[k], total: scenarios[k].total, active: k === key })),
          ]}
        />
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h3>{SCENARIO_LABEL[key]} scenario</h3>
            <div className="sub">{SCENARIO_BLURB[key]} Edit any amount — totals reconcile automatically.</div>
          </div>
          <div className="row-wrap">
            <IllustrativeTag>Benchmarks — illustrative</IllustrativeTag>
            {Object.keys(plan.budget.scenarioOverrides[key]).length > 0 && (
              <button className="btn btn-sm" onClick={() => resetScenario(key)}>
                <RotateCcw /> Reset edits
              </button>
            )}
            <button className="btn btn-sm btn-primary" onClick={() => setAdopting(true)}>
              <Wand2 /> Adopt as working plan
            </button>
          </div>
        </div>
        {s.notes.length > 0 && (
          <div className="card-body" style={{ paddingBottom: 0 }}>
            {s.notes.map((n) => (
              <Notice key={n} tone={s.withinCeiling ? 'info' : 'warn'}>
                {n}
              </Notice>
            ))}
          </div>
        )}
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="table" aria-label={`${SCENARIO_LABEL[key]} scenario allocations`}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Level</th>
                <th>Amount</th>
                <th className="r">Total</th>
                <th className="r">vs plan</th>
                <th className="hide-md">Trade-off</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.key}>
                  <td>
                    <div className="cell-main">{l.label}</div>
                    {l.protected && <span className="badge badge-rose">Protected</span>}
                  </td>
                  <td className="nowrap">
                    <span className={`badge ${l.tier === 'premium' ? 'badge-gold' : l.tier === 'lean' ? 'badge-outline' : 'badge-info'}`}>
                      {SCENARIO_LABEL[l.tier]}
                    </span>
                    {l.adjusted && (
                      <span className="badge badge-warn" style={{ marginLeft: 4 }}>
                        Trimmed
                      </span>
                    )}
                    {l.overridden && (
                      <span className="badge" style={{ marginLeft: 4 }}>
                        Edited
                      </span>
                    )}
                  </td>
                  <td style={{ minWidth: 140 }}>
                    <div className="input-affix">
                      <CommitNumber
                        value={l.rate}
                        min={0}
                        className="input-sm"
                        ariaLabel={`${l.label} amount in ${SCENARIO_LABEL[key]} scenario`}
                        onCommit={(v) => setOverride(key, l.key, v)}
                      />
                      {l.basis === 'perGuest' && <span className="affix">/guest</span>}
                    </div>
                  </td>
                  <td className="r">{m(l.total)}</td>
                  <td className="r" style={{ color: l.delta > 0 ? 'var(--danger)' : l.delta < 0 ? 'var(--ok)' : undefined }}>
                    {Math.round(l.delta) === 0 ? '—' : `${l.delta > 0 ? '+' : '−'}${m(Math.abs(l.delta))}`}
                  </td>
                  <td className="hide-md small ink-2" style={{ maxWidth: 360 }}>
                    {l.note}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Subtotal</td>
                <td className="r">{m(s.subtotal)}</td>
                <td colSpan={2} />
              </tr>
              <tr>
                <td colSpan={3}>Contingency ({plan.budget.contingencyPct}%)</td>
                <td className="r">{m(s.contingency)}</td>
                <td colSpan={2} />
              </tr>
              <tr className="row-total">
                <td colSpan={3}>
                  Scenario total{' '}
                  {s.reconciles && (
                    <span className="badge badge-ok" style={{ marginLeft: 6 }}>
                      <CheckCircle2 /> reconciles
                    </span>
                  )}
                </td>
                <td className="r">{m(s.total)}</td>
                <td className="r" style={{ color: s.deltaVsPlan > 0 ? 'var(--danger)' : 'var(--ok)' }}>
                  {s.deltaVsPlan >= 0 ? '+' : '−'}
                  {m(Math.abs(s.deltaVsPlan))}
                </td>
                <td className="hide-md small muted">
                  {m(s.perGuest)} per guest ·{' '}
                  {s.withinCeiling ? `${m(s.ceiling - s.total)} under ceiling` : `${m(s.total - s.ceiling)} over ceiling`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="card-body">
          <div className="mini-h" style={{ marginTop: 0 }}>
            Major trade-offs
          </div>
          <ul className="bullets small">
            {s.tradeoffs.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>
      {adopting && <AdoptModal plan={plan} scenario={s} onClose={() => setAdopting(false)} />}
    </div>
  );
}

function AdoptModal({ plan, scenario, onClose }: { plan: EventPlan; scenario: Scenario; onClose: () => void }) {
  const applyProposal = useWorkspace((s) => s.applyProposal);
  const undoLast = useWorkspace((s) => s.undoLast);
  const ops: PlanOp[] = useMemo(
    () =>
      scenario.lines
        .filter((l) => plan.budget.categories.find((c) => c.key === l.key)?.planned !== l.rate)
        .map((l) => ({ op: 'setCategoryPlanned' as const, key: l.key, planned: l.rate })),
    [scenario, plan],
  );
  const booked = plan.vendors.filter((v) => BOOKED_STATUSES.has(v.status));
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`Adopt the ${scenario.label} scenario?`}
      subtitle="Planned allocations are replaced by the scenario amounts. Booked contracts and quotations keep driving the forecast."
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ops.length}
            onClick={() => {
              applyProposal(
                makeProposal({
                  title: `Adopted ${scenario.label} scenario`,
                  summary: '',
                  reason: 'Planner adopted a scenario.',
                  ops,
                  tradeoffs: scenario.tradeoffs,
                  assumptions: [],
                }),
                ops,
                'planner',
                'budget',
              );
              toast(`${scenario.label} scenario adopted as the working plan.`, 'success', { label: 'Undo', onClick: () => undoLast() });
              onClose();
            }}
          >
            Adopt scenario
          </button>
        </>
      }
    >
      {booked.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <Notice tone="warn" icon={<AlertTriangle />}>
            {booked.length} booked contract{booked.length > 1 ? 's' : ''} ({booked.map((v) => v.name).join(', ')}) will not change. Their
            categories keep forecasting the contract value:{' '}
            {booked
              .map(
                (v) => `${v.name.replace(/ \(demo\)/, '')} ${formatMoney(quoteTotal(v.quote, plan.brief.guestCount), plan.brief.currency)}`,
              )
              .join('; ')}
            .
          </Notice>
        </div>
      )}
      {ops.length ? <ProposalPreview plan={plan} ops={ops} /> : <Notice>The working plan already matches this scenario.</Notice>}
    </Modal>
  );
}

const PAY_STATUS_LABEL: Record<PaymentStatus, string> = {
  scheduled: 'Scheduled',
  paid: 'Paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

function PaymentsTab({ plan }: { plan: EventPlan }) {
  const ins = useInsights(plan);
  const today = useToday();
  const b = ins.budget;
  const cur = plan.brief.currency;
  const upsert = useWorkspace((s) => s.upsertPayment);
  const remove = useWorkspace((s) => s.removePayment);
  const [editing, setEditing] = useState<Payment | null>(null);
  const m = (n: number) => formatMoneyCompact(n, cur);
  const blank = (): Payment => ({
    id: uid('p'),
    vendorId: plan.vendors.find((v) => BOOKED_STATUSES.has(v.status))?.id ?? plan.vendors[0]?.id ?? '',
    label: 'Advance',
    amount: 0,
    dueDate: today,
    status: 'scheduled',
  });

  return (
    <div className="stack-lg">
      {b.scheduleGaps.map((g) => (
        <Notice key={g.vendorId} tone="warn">
          Payment schedule for <strong>{g.vendorName}</strong> totals {m(g.scheduled)} against a {m(g.contract)} contract (
          {g.contract > g.scheduled ? `${m(g.contract - g.scheduled)} unscheduled` : `${m(g.scheduled - g.contract)} over`}). Per-guest
          contracts change when the guest count changes.
        </Notice>
      ))}
      <section className="card">
        <div className="card-head">
          <div>
            <h3>Payment schedule</h3>
            <div className="sub">
              {m(b.paidTotal)} paid · {m(b.outstandingTotal)} outstanding on booked contracts
              {b.sunkTotal ? ` · ${m(b.sunkTotal)} paid to cancelled vendors` : ''}
            </div>
          </div>
          <button className="btn btn-sm btn-primary" disabled={!plan.vendors.length} onClick={() => setEditing(blank())}>
            <Plus /> Add payment
          </button>
        </div>
        {b.payments.length ? (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
            <table className="table">
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Vendor</th>
                  <th className="r">Amount</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {b.payments.map((p) => (
                  <tr key={p.id} className={p.overdue ? 'is-danger' : ''}>
                    <td className="cell-main">{p.label}</td>
                    <td>{p.vendorName}</td>
                    <td className="r">{formatMoney(p.amount, cur)}</td>
                    <td className="nowrap">
                      {formatDate(p.dueDate)}
                      <div className="cell-sub">
                        {p.status === 'scheduled'
                          ? p.overdue
                            ? `${-p.daysUntil} days overdue`
                            : `in ${p.daysUntil} days`
                          : p.paidOn
                            ? `paid ${formatDate(p.paidOn)}`
                            : ''}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${p.status === 'paid' ? 'badge-ok' : p.status === 'scheduled' ? (p.overdue ? 'badge-danger' : 'badge-info') : ''}`}
                      >
                        {PAY_STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="nowrap">
                      {p.status === 'scheduled' && (
                        <button
                          className="btn btn-xs"
                          onClick={() => {
                            upsert({ ...stripView(p), status: 'paid', paidOn: today });
                            toast(`${p.label} marked as paid.`);
                          }}
                        >
                          Mark paid
                        </button>
                      )}{' '}
                      <button className="btn btn-xs btn-ghost" onClick={() => setEditing(stripView(p))}>
                        Edit
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`Delete ${p.label}`}
                        onClick={async () => {
                          if (await confirmDialog({ title: 'Delete this payment?', confirmLabel: 'Delete', danger: true })) remove(p.id);
                        }}
                      >
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card-body muted">No payments recorded yet. Add payments once vendors are booked.</div>
        )}
      </section>
      {editing && (
        <PaymentModal
          plan={plan}
          payment={editing}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            upsert(p);
            toast('Payment saved — paid and outstanding totals updated.');
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function stripView(p: Payment): Payment {
  return { id: p.id, vendorId: p.vendorId, label: p.label, amount: p.amount, dueDate: p.dueDate, status: p.status, paidOn: p.paidOn };
}

function PaymentModal({
  plan,
  payment,
  onClose,
  onSave,
}: {
  plan: EventPlan;
  payment: Payment;
  onClose: () => void;
  onSave: (p: Payment) => void;
}) {
  const [p, setP] = useState(payment);
  const [err, setErr] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={plan.budget.payments.some((x) => x.id === p.id) ? 'Edit payment' : 'Add payment'}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!p.vendorId) return setErr('Choose a vendor.');
              if (!p.label.trim()) return setErr('Name the payment.');
              if (!(p.amount > 0)) return setErr('Amount must be greater than zero.');
              if (!isValidISODate(p.dueDate)) return setErr('Enter a valid due date.');
              onSave({ ...p, paidOn: p.status === 'paid' ? (p.paidOn ?? p.dueDate) : undefined });
            }}
          >
            Save payment
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Vendor" htmlFor="pay-v" className="span-2">
          <select id="pay-v" className="select" value={p.vendorId} onChange={(e) => setP({ ...p, vendorId: e.target.value })}>
            {plan.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.status})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Label" htmlFor="pay-l">
          <input id="pay-l" className="input" value={p.label} onChange={(e) => setP({ ...p, label: e.target.value })} />
        </Field>
        <Field label={`Amount (${plan.brief.currency})`} htmlFor="pay-a">
          <input
            id="pay-a"
            className="input input-num"
            type="number"
            min={0}
            value={p.amount}
            onChange={(e) => setP({ ...p, amount: Number(e.target.value) })}
          />
        </Field>
        <Field label="Due date" htmlFor="pay-d">
          <input id="pay-d" type="date" className="input" value={p.dueDate} onChange={(e) => setP({ ...p, dueDate: e.target.value })} />
        </Field>
        <Field label="Status" htmlFor="pay-s">
          <select id="pay-s" className="select" value={p.status} onChange={(e) => setP({ ...p, status: e.target.value as PaymentStatus })}>
            {Object.entries(PAY_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {err && (
        <div className="field-error" style={{ marginTop: 10 }} role="alert">
          {err}
        </div>
      )}
    </Modal>
  );
}
