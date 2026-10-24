import { useMemo, useState } from 'react';
import { Bookmark, BookmarkCheck, CheckCircle2, GitCompare, RefreshCw, Wand2 } from 'lucide-react';
import { lineTotal } from '../domain/budget';
import { categoryMeta } from '../domain/catalog';
import { makeProposal, type PlanOp } from '../domain/ops';
import { personalisationInputs } from '../domain/themes';
import type { EventPlan, ThemeConcept } from '../domain/types';
import { diffDays, formatMoneyCompact, roundTo } from '../domain/util';
import { useWorkspace } from '../store/workspace';
import { Dots } from '../ui/charts';
import { Drawer, Modal, Notice, toast } from '../ui/kit';
import { useInsights, useToday } from './common';
import { ProposalPreview } from './ProposalPreview';

function costImpact(plan: EventPlan, t: ThemeConcept) {
  let delta = 0;
  const parts: { label: string; delta: number }[] = [];
  for (const [key, factor] of Object.entries(t.costFactors)) {
    const c = plan.budget.categories.find((x) => x.key === key);
    if (!c || factor === undefined) continue;
    const d = lineTotal(c, plan.brief.guestCount) * (factor - 1);
    delta += d;
    parts.push({ label: c.label, delta: d });
  }
  return { delta: delta * (1 + plan.budget.contingencyPct / 100), parts };
}

export function themeOps(plan: EventPlan, t: ThemeConcept): PlanOp[] {
  const ops: PlanOp[] = [];
  for (const [key, factor] of Object.entries(t.costFactors)) {
    const c = plan.budget.categories.find((x) => x.key === key);
    if (!c || factor === undefined || factor === 1) continue;
    const step = c.basis === 'perGuest' ? (plan.brief.currency === 'INR' ? 10 : 1) : plan.brief.currency === 'INR' ? 1000 : 10;
    ops.push({ op: 'setCategoryPlanned', key, planned: roundTo(c.planned * factor, step) });
  }
  ops.push({ op: 'setColors', colors: t.palette.map((p) => p.hex.toUpperCase()) });
  ops.push({ op: 'updateBrief', field: 'themeName', value: t.name });
  for (const p of t.procurement) {
    if (!plan.tasks.some((x) => x.title === p.title))
      ops.push({
        op: 'addTask',
        title: p.title,
        workstream: p.workstream,
        offsetDays: p.offsetDays,
        durationDays: 3,
        priority: 'medium',
        notes: `Procurement for the “${t.name}” concept.`,
      });
  }
  ops.push({ op: 'setAppliedTheme', themeId: t.id });
  return ops;
}

export function ThemeStudio({ plan }: { plan: EventPlan }) {
  const today = useToday();
  const ins = useInsights(plan);
  const [detail, setDetail] = useState<ThemeConcept | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [applying, setApplying] = useState<ThemeConcept | null>(null);
  const regenerate = useWorkspace((s) => s.regenerateThemes);
  const toggleSave = useWorkspace((s) => s.toggleSaveTheme);
  const inputs = personalisationInputs(plan.brief, today);
  const daysLeft = diffDays(today, plan.brief.eventDate);
  const cur = plan.brief.currency;
  const sorted = [...plan.themes].sort(
    (a, b) => Number(b.id === plan.appliedThemeId) - Number(a.id === plan.appliedThemeId) || Number(b.saved) - Number(a.saved),
  );

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 26 }}>Theme Studio</h2>
          <p>
            Creative concepts personalised to this event. Applying a concept updates the palette, adjusts affected budget lines and adds
            procurement tasks — with a preview first.
          </p>
        </div>
        <div className="row-wrap">
          <button className="btn" disabled={compare.length !== 2} onClick={() => setComparing(true)}>
            <GitCompare /> Compare {compare.length ? `(${compare.length}/2)` : ''}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              regenerate();
              toast('New concepts generated. Saved and applied concepts were kept.');
            }}
          >
            <RefreshCw /> Generate alternatives
          </button>
        </div>
      </div>
      <div className="card card-pad">
        <div className="mini-h" style={{ marginTop: 0 }}>
          Personalised using
        </div>
        <div className="row-wrap">
          {inputs.map((i) => (
            <span className="badge badge-outline" key={i}>
              {i}
            </span>
          ))}
        </div>
        <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Regional craft references come from the event’s location as design vocabulary only — they never imply anything about the hosts’
          culture or traditions. Ceremonies are planned only from what the client has stated.
        </p>
      </div>

      <div className="theme-grid">
        {sorted.map((t) => {
          const impact = costImpact(plan, t);
          const applied = plan.appliedThemeId === t.id;
          return (
            <article key={t.id} className="card theme-card" aria-labelledby={`th-${t.id}`}>
              <div className="palette" aria-label={`Palette: ${t.palette.map((p) => p.name).join(', ')}`} role="img">
                {t.palette.map((p) => (
                  <span key={p.hex} style={{ background: p.hex }} title={`${p.name} ${p.hex}`} />
                ))}
              </div>
              <div className="card-body" style={{ flex: 1 }}>
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <h3 id={`th-${t.id}`}>{t.name}</h3>
                  {applied && (
                    <span className="badge badge-ok">
                      <CheckCircle2 /> Applied
                    </span>
                  )}
                </div>
                <p className="small ink-2" style={{ marginTop: 6 }}>
                  {t.rationale}
                </p>
                <div className="palette-names" style={{ marginBottom: 10 }}>
                  {t.palette.map((p) => (
                    <span key={p.hex}>
                      <i style={{ background: p.hex }} />
                      {p.name}
                    </span>
                  ))}
                </div>
                <dl className="detail-grid" style={{ gridTemplateColumns: '110px minmax(0,1fr)', fontSize: 12.5 }}>
                  <dt>Cost impact</dt>
                  <dd className={impact.delta > 0 ? 'delta-up' : impact.delta < 0 ? 'delta-down' : ''}>
                    {Math.round(impact.delta) === 0
                      ? 'Neutral'
                      : `${impact.delta > 0 ? '+' : '−'}${formatMoneyCompact(Math.abs(impact.delta), cur)}`}{' '}
                    <span className="muted">(illustrative)</span>
                  </dd>
                  <dt>Practicality</dt>
                  <dd>
                    <Dots value={t.practicality} label="Practicality" />
                  </dd>
                  <dt>Lead time</dt>
                  <dd>
                    {t.leadTimeDays} days {t.leadTimeDays > daysLeft && <span className="badge badge-warn">Tight</span>}
                  </dd>
                </dl>
              </div>
              <div className="card-foot row-wrap">
                <button className="btn btn-sm" onClick={() => setDetail(t)}>
                  Details
                </button>
                <button className="btn btn-sm btn-ghost" aria-pressed={t.saved} onClick={() => toggleSave(t.id)}>
                  {t.saved ? <BookmarkCheck /> : <Bookmark />} {t.saved ? 'Saved' : 'Save'}
                </button>
                <label className="check small">
                  <input
                    type="checkbox"
                    checked={compare.includes(t.id)}
                    onChange={() =>
                      setCompare((c) => (c.includes(t.id) ? c.filter((x) => x !== t.id) : c.length >= 2 ? [c[1], t.id] : [...c, t.id]))
                    }
                  />{' '}
                  Compare
                </label>
                <span className="spacer" />
                <button className="btn btn-sm btn-primary" onClick={() => setApplying(t)} disabled={applied}>
                  <Wand2 /> {applied ? 'Applied' : 'Apply'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="tiny muted">
        Budget context: décor & florals forecast {formatMoneyCompact(ins.budget.lines.find((l) => l.key === 'decor')?.forecast ?? 0, cur)}.
        Booked décor contracts keep forecasting the contract value even if a concept changes the allocation.
      </p>

      {detail && (
        <Drawer
          open
          onClose={() => setDetail(null)}
          title={detail.name}
          subtitle={detail.rationale}
          footer={
            <>
              <button className="btn" onClick={() => setDetail(null)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setApplying(detail);
                  setDetail(null);
                }}
                disabled={plan.appliedThemeId === detail.id}
              >
                <Wand2 /> Apply concept
              </button>
            </>
          }
        >
          <ConceptDetail plan={plan} t={detail} />
        </Drawer>
      )}
      {comparing && compare.length === 2 && (
        <Modal
          open
          wide
          onClose={() => setComparing(false)}
          title="Compare concepts"
          footer={
            <button className="btn" onClick={() => setComparing(false)}>
              Close
            </button>
          }
        >
          <CompareConcepts
            plan={plan}
            a={plan.themes.find((t) => t.id === compare[0])!}
            b={plan.themes.find((t) => t.id === compare[1])!}
          />
        </Modal>
      )}
      {applying && <ApplyModal plan={plan} t={applying} onClose={() => setApplying(null)} />}
    </div>
  );
}

const FIELDS: [keyof ThemeConcept, string][] = [
  ['decor', 'Décor direction'],
  ['lighting', 'Lighting & ambience'],
  ['florals', 'Florals & materials'],
  ['attire', 'Attire / dress code'],
  ['food', 'Food'],
  ['guestExperience', 'Guest experience'],
  ['photography', 'Photography'],
];

function ConceptDetail({ plan, t }: { plan: EventPlan; t: ThemeConcept }) {
  const impact = costImpact(plan, t);
  const cur = plan.brief.currency;
  return (
    <div className="stack-lg">
      <div className="palette palette-sm" style={{ height: 40 }}>
        {t.palette.map((p) => (
          <span key={p.hex} style={{ background: p.hex }} />
        ))}
      </div>
      <div className="palette-names">
        {t.palette.map((p) => (
          <span key={p.hex}>
            <i style={{ background: p.hex }} />
            {p.name} {p.hex}
          </span>
        ))}
      </div>
      <dl className="detail-grid">
        {FIELDS.map(([k, label]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{label}</dt>
            <dd>{String(t[k])}</dd>
          </div>
        ))}
      </dl>
      <div>
        <div className="mini-h">Indicative cost impact (illustrative)</div>
        <ul className="bullets small">
          {impact.parts.map((p) => (
            <li key={p.label}>
              {p.label}: {p.delta >= 0 ? '+' : '−'}
              {formatMoneyCompact(Math.abs(p.delta), cur)}
            </li>
          ))}
          <li>
            <strong>
              Total incl. contingency: {impact.delta >= 0 ? '+' : '−'}
              {formatMoneyCompact(Math.abs(impact.delta), cur)}
            </strong>
          </li>
        </ul>
      </div>
      <div>
        <div className="mini-h">Practicality & logistics</div>
        <ul className="bullets small">
          {t.logistics.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mini-h">Weather & venue constraints</div>
        <ul className="bullets small">
          {t.weather.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mini-h">Procurement timeline</div>
        <ul className="bullets small">
          {t.procurement.map((p) => (
            <li key={p.title}>
              {p.title} — {-p.offsetDays} days before the event
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CompareConcepts({ plan, a, b }: { plan: EventPlan; a: ThemeConcept; b: ThemeConcept }) {
  const cur = plan.brief.currency;
  const rows: [string, (t: ThemeConcept) => React.ReactNode][] = [
    [
      'Palette',
      (t) => (
        <div className="palette palette-sm">
          {t.palette.map((p) => (
            <span key={p.hex} style={{ background: p.hex }} />
          ))}
        </div>
      ),
    ],
    ['Why', (t) => t.rationale],
    ...FIELDS.map(([k, label]) => [label, (t: ThemeConcept) => String(t[k])] as [string, (t: ThemeConcept) => React.ReactNode]),
    [
      'Cost impact',
      (t) => {
        const d = costImpact(plan, t).delta;
        return `${d >= 0 ? '+' : '−'}${formatMoneyCompact(Math.abs(d), cur)} (illustrative)`;
      },
    ],
    ['Practicality', (t) => <Dots value={t.practicality} label="Practicality" />],
    ['Lead time', (t) => `${t.leadTimeDays} days`],
    ['Weather', (t) => t.weather.join(' ')],
  ];
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
      <table className="table compare-table">
        <thead>
          <tr>
            <th />
            <th>{a.name}</th>
            <th>{b.name}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, r]) => (
            <tr key={label}>
              <td className="strong small">{label}</td>
              <td className="small">{r(a)}</td>
              <td className="small">{r(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplyModal({ plan, t, onClose }: { plan: EventPlan; t: ThemeConcept; onClose: () => void }) {
  const today = useToday();
  const applyProposal = useWorkspace((s) => s.applyProposal);
  const undoLast = useWorkspace((s) => s.undoLast);
  const ops = useMemo(() => themeOps(plan, t), [plan, t]);
  const daysLeft = diffDays(today, plan.brief.eventDate);
  const bookedDecor = plan.vendors.some((v) => v.category === 'decor' && (v.status === 'booked' || v.status === 'completed'));
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Apply “${t.name}”?`}
      subtitle="Updates the palette and theme, adjusts affected allocations and adds procurement tasks."
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              applyProposal(
                makeProposal({
                  title: `Applied theme “${t.name}”`,
                  summary: '',
                  reason: 'Planner applied a theme concept.',
                  ops,
                  tradeoffs: [],
                  assumptions: [],
                }),
                ops,
                'planner',
                'themes',
              );
              toast(`“${t.name}” applied to the plan.`, 'success', { label: 'Undo', onClick: () => undoLast() });
              onClose();
            }}
          >
            <Wand2 /> Apply concept
          </button>
        </>
      }
    >
      <div className="stack">
        {t.leadTimeDays > daysLeft && (
          <Notice tone="warn">
            This concept usually needs ~{t.leadTimeDays} days of procurement; {daysLeft} remain. Some tasks will be due immediately.
          </Notice>
        )}
        {bookedDecor && (
          <Notice tone="info">
            Décor is already booked — the allocation change is a target for renegotiation; the forecast keeps the contract value until a
            revised quote is entered.
          </Notice>
        )}
        <ProposalPreview plan={plan} ops={ops} />
        <p className="tiny muted">{categoryMeta('decor')?.description}</p>
      </div>
    </Modal>
  );
}
