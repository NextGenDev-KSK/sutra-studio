import { useMemo, useRef, useState } from 'react';
import { Download, Lock, Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { DIET_LABEL, RSVP_LABEL } from '../domain/catalog';
import { PROJECTION_RULE, guestsFromCSV, guestsToCSV, summarizeGuests, type GuestImportResult } from '../domain/guests';
import { makeProposal } from '../domain/ops';
import type { Diet, EventPlan, Guest, RSVP } from '../domain/types';
import { formatMoneyCompact, slug, uid } from '../domain/util';
import { downloadFile, readFileAsText } from '../lib/download';
import { useWorkspace } from '../store/workspace';
import { BulletChart, StackBar } from '../ui/charts';
import { Empty, Field, Modal, Notice, Stat, confirmDialog, toast } from '../ui/kit';
import { useInsights } from './common';
import { ProposalPreview } from './ProposalPreview';

export function GuestOps({ plan }: { plan: EventPlan }) {
  const s = useMemo(() => summarizeGuests(plan.guests), [plan.guests]);
  const ins = useInsights(plan);
  const [q, setQ] = useState('');
  const [rsvp, setRsvp] = useState<RSVP | 'all'>('all');
  const [diet, setDiet] = useState<Diet | 'all'>('all');
  const [group, setGroup] = useState('all');
  const [needsOnly, setNeedsOnly] = useState(false);
  const [editing, setEditing] = useState<Guest | null>(null);
  const [importing, setImporting] = useState<GuestImportResult | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const upsert = useWorkspace((st) => st.upsertGuest);
  const remove = useWorkspace((st) => st.removeGuest);
  const cur = plan.brief.currency;
  const groups = [...new Set(plan.guests.map((g) => g.group.trim()).filter(Boolean))].sort();

  const list = plan.guests.filter((g) => {
    if (rsvp !== 'all' && g.rsvp !== rsvp) return false;
    if (diet !== 'all' && g.diet !== diet) return false;
    if (group !== 'all' && g.group !== group) return false;
    if (needsOnly && !(g.accessibility || g.allergies || g.assistanceNotes)) return false;
    if (q.trim() && !`${g.name} ${g.group} ${g.notes} ${g.table}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  const blank = (): Guest => ({
    id: uid('g'),
    name: '',
    group: '',
    partySize: 1,
    rsvp: 'pending',
    diet: 'unknown',
    allergies: '',
    accessibility: '',
    assistanceNotes: '',
    table: '',
    contact: '',
    notes: '',
  });
  const delta = s.projected - plan.brief.guestCount;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file, 5_000_000);
      setImporting(guestsFromCSV(text));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 26 }}>Guest Operations</h2>
          <p>
            Households, RSVPs, dietary and accessibility needs. RSVP projections can feed the budget’s guest count — always with a preview.
          </p>
        </div>
        <div className="row-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            id="guest-csv"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <label
            htmlFor="guest-csv"
            className="btn"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
          >
            <Upload /> Import CSV
          </label>
          <button
            className="btn"
            disabled={!plan.guests.length}
            onClick={() => {
              downloadFile(`${slug(plan.brief.name)}-guests.csv`, guestsToCSV(plan.guests), 'text/csv;charset=utf-8');
              toast('Guest list exported. It contains personal data — share it carefully.', 'info');
            }}
          >
            <Download /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={() => setEditing(blank())}>
            <Plus /> Add guest
          </button>
        </div>
      </div>
      <Notice tone="info" icon={<Lock />}>
        Guest details stay in this browser. Client reports and co-pilot requests use aggregate counts only — names and contact details are
        never included.{plan.isDemo ? ' All demo guests are fictional; diets are simulated RSVP answers.' : ''}
      </Notice>

      {!plan.guests.length ? (
        <div className="card">
          <Empty
            icon={<Users />}
            title="No guests yet"
            action={
              <div className="row-wrap" style={{ justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => setEditing(blank())}>
                  <Plus /> Add a household
                </button>
                <label htmlFor="guest-csv" className="btn">
                  <Upload /> Import CSV
                </label>
              </div>
            }
          >
            Add households one by one or import a CSV with a “Name” column (optional: Group, Party size, RSVP, Diet, Allergies,
            Accessibility, Assistance notes, Table, Contact, Notes).
          </Empty>
        </div>
      ) : (
        <>
          <section className="kpis">
            <Stat label="Invited" value={s.invited} sub={`${s.parties} households`} />
            <Stat
              label="Attending"
              value={s.confirmed}
              sub={`${s.invited ? Math.round((s.confirmed / s.invited) * 100) : 0}% of invited`}
            />
            <Stat label="Awaiting reply" value={s.pending} sub={`${s.tentative} tentative`} />
            <Stat label="Declined" value={s.declined} />
            <Stat
              label="Projected attendance"
              value={`~${s.projected}`}
              sub={
                <span title={PROJECTION_RULE}>
                  vs {plan.brief.guestCount} budgeted ({delta > 0 ? '+' : ''}
                  {delta})
                </span>
              }
              tone={Math.abs(delta) / Math.max(1, plan.brief.guestCount) >= 0.08 ? 'danger' : undefined}
            />
          </section>
          {delta !== 0 && (
            <Notice tone={Math.abs(delta) / Math.max(1, plan.brief.guestCount) >= 0.08 ? 'warn' : 'info'}>
              RSVPs project ~{s.projected} guests; the budget assumes {plan.brief.guestCount}. Each guest changes the forecast by about{' '}
              {formatMoneyCompact(ins.budget.marginalGuestCost, cur)}.{' '}
              <button className="link-btn" onClick={() => setSyncOpen(true)}>
                Preview planning for {s.projected} guests
              </button>
              <div className="tiny" style={{ marginTop: 4 }}>
                {PROJECTION_RULE}
              </div>
            </Notice>
          )}

          <div className="grid-2">
            <section className="card card-pad">
              <h3 style={{ marginBottom: 10 }}>RSVP status</h3>
              <StackBar
                ariaLabel="RSVP status of invited guests"
                segments={[
                  { key: 'c', label: RSVP_LABEL.confirmed, value: s.confirmed, color: 'var(--rsvp-yes)', display: String(s.confirmed) },
                  { key: 'p', label: RSVP_LABEL.pending, value: s.pending, color: 'var(--rsvp-wait)', display: String(s.pending) },
                  { key: 't', label: RSVP_LABEL.tentative, value: s.tentative, color: 'var(--rsvp-maybe)', display: String(s.tentative) },
                  { key: 'd', label: RSVP_LABEL.declined, value: s.declined, color: 'var(--rsvp-no)', display: String(s.declined) },
                ]}
              />
              <div className="mini-h">By group</div>
              <ul className="list list-tight small">
                {s.groups.map((g) => (
                  <li key={g.name} className="row-between">
                    <span>{g.name}</span>
                    <span className="num">
                      {g.confirmed} attending · {g.people} invited
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card card-pad">
              <h3 style={{ marginBottom: 4 }}>Dietary needs</h3>
              <p className="small muted">People in households not declined, by RSVP answer.</p>
              <BulletChart
                ariaLabel="Guests by dietary preference"
                rows={(Object.keys(s.diet) as Diet[])
                  .filter((d) => s.diet[d] > 0)
                  .map((d) => ({
                    key: d,
                    label: DIET_LABEL[d],
                    value: s.diet[d],
                    display: String(s.diet[d]),
                    tooltip: [['Guests', String(s.diet[d])]],
                  }))}
              />
              <div className="row-wrap" style={{ marginTop: 12 }}>
                <span className="badge badge-info">{s.accessibilityParties} households with accessibility needs</span>
                <span className="badge badge-warn">{s.allergyParties} with allergies</span>
              </div>
            </section>
          </div>

          <section className="card">
            <div className="card-head">
              <div className="row-wrap">
                <div className="input-affix" style={{ width: 230 }}>
                  <span className="affix">
                    <Search style={{ width: 14, height: 14 }} />
                  </span>
                  <input
                    className="input input-sm"
                    placeholder="Search guests"
                    aria-label="Search guests"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <select
                  className="select input-sm"
                  aria-label="Filter by RSVP"
                  value={rsvp}
                  onChange={(e) => setRsvp(e.target.value as RSVP | 'all')}
                  style={{ width: 150 }}
                >
                  <option value="all">All RSVPs</option>
                  {Object.entries(RSVP_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  className="select input-sm"
                  aria-label="Filter by diet"
                  value={diet}
                  onChange={(e) => setDiet(e.target.value as Diet | 'all')}
                  style={{ width: 150 }}
                >
                  <option value="all">All diets</option>
                  {Object.entries(DIET_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  className="select input-sm"
                  aria-label="Filter by group"
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  style={{ width: 170 }}
                >
                  <option value="all">All groups</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <label className="check small">
                  <input type="checkbox" checked={needsOnly} onChange={(e) => setNeedsOnly(e.target.checked)} /> Special needs only
                </label>
              </div>
              <span className="small muted">
                {list.length} of {plan.guests.length} households
              </span>
            </div>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Household</th>
                    <th className="hide-sm">Group</th>
                    <th className="r">Party</th>
                    <th>RSVP</th>
                    <th>Diet</th>
                    <th className="hide-md">Needs & assistance</th>
                    <th className="hide-sm">Table</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <div className="cell-main">{g.name}</div>
                        {g.notes && <div className="cell-sub">{g.notes}</div>}
                      </td>
                      <td className="hide-sm">{g.group || '—'}</td>
                      <td className="r">{g.partySize}</td>
                      <td>
                        <select
                          className="select input-sm"
                          aria-label={`RSVP for ${g.name}`}
                          value={g.rsvp}
                          onChange={(e) => upsert({ ...g, rsvp: e.target.value as RSVP })}
                          style={{ width: 140, minHeight: 28 }}
                        >
                          {Object.entries(RSVP_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="nowrap">
                        {DIET_LABEL[g.diet]}
                        {g.allergies && <div className="cell-sub">Allergy: {g.allergies}</div>}
                      </td>
                      <td className="hide-md small">
                        {g.accessibility || '—'}
                        {g.assistanceNotes && <div className="cell-sub">{g.assistanceNotes}</div>}
                      </td>
                      <td className="hide-sm">{g.table || '—'}</td>
                      <td className="nowrap">
                        <button className="icon-btn" aria-label={`Edit ${g.name}`} onClick={() => setEditing(g)}>
                          <Pencil />
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={`Remove ${g.name}`}
                          onClick={async () => {
                            if (await confirmDialog({ title: `Remove ${g.name}?`, confirmLabel: 'Remove', danger: true })) remove(g.id);
                          }}
                        >
                          <Trash2 />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!list.length && (
                    <tr>
                      <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                        No households match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {editing && (
        <GuestEditor
          guest={editing}
          isNew={!plan.guests.some((g) => g.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(g) => {
            upsert(g);
            toast('Guest saved — RSVP summary updated.');
            setEditing(null);
          }}
        />
      )}
      {importing && <ImportModal result={importing} existing={plan.guests.length} onClose={() => setImporting(null)} />}
      {syncOpen && <SyncModal plan={plan} count={s.projected} onClose={() => setSyncOpen(false)} />}
    </div>
  );
}

function SyncModal({ plan, count, onClose }: { plan: EventPlan; count: number; onClose: () => void }) {
  const applyProposal = useWorkspace((s) => s.applyProposal);
  const undoLast = useWorkspace((s) => s.undoLast);
  const ops = useMemo(() => [{ op: 'setGuestCount' as const, count: Math.max(1, count) }], [count]);
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Plan for ${count} guests?`}
      subtitle="Uses the RSVP projection as the budget’s guest count. Per-guest lines and per-guest contracts are re-priced."
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
                  title: `Guest count set from RSVP projection (${count})`,
                  summary: '',
                  reason: PROJECTION_RULE,
                  ops,
                  tradeoffs: [],
                  assumptions: [],
                }),
                ops,
                'planner',
                'guests',
              );
              toast(`Planning for ${count} guests.`, 'success', { label: 'Undo', onClick: () => undoLast() });
              onClose();
            }}
          >
            Apply
          </button>
        </>
      }
    >
      <ProposalPreview plan={plan} ops={ops} />
    </Modal>
  );
}

function ImportModal({ result, existing, onClose }: { result: GuestImportResult; existing: number; onClose: () => void }) {
  const importGuests = useWorkspace((s) => s.importGuests);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const people = result.guests.reduce((a, g) => a + g.partySize, 0);
  return (
    <Modal
      open
      onClose={onClose}
      title="Import guests"
      subtitle="Review the file before anything changes."
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!result.guests.length}
            onClick={() => {
              importGuests(result.guests, mode);
              toast(`${result.guests.length} households imported (${mode}).`);
              onClose();
            }}
          >
            Import {result.guests.length} households
          </button>
        </>
      }
    >
      <div className="stack">
        {result.guests.length ? (
          <Notice tone="ok">
            {result.guests.length} households ({people} people) ready to import{result.skipped ? `; ${result.skipped} rows skipped` : ''}.
          </Notice>
        ) : (
          <Notice tone="danger">Nothing can be imported from this file.</Notice>
        )}
        {result.errors.length > 0 && (
          <div>
            <div className="mini-h">Problems found</div>
            <ul className="bullets small" tabIndex={0} aria-label="Import problems" style={{ maxHeight: 180, overflowY: 'auto' }}>
              {result.errors.slice(0, 40).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {result.guests.length > 0 && existing > 0 && (
          <div className="row-wrap">
            <label className="check">
              <input type="radio" name="mode" checked={mode === 'append'} onChange={() => setMode('append')} /> Add to the existing{' '}
              {existing} households
            </label>
            <label className="check">
              <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace the existing list
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}

function GuestEditor({ guest, isNew, onClose, onSave }: { guest: Guest; isNew: boolean; onClose: () => void; onSave: (g: Guest) => void }) {
  const [g, setG] = useState(guest);
  const [err, setErr] = useState('');
  const set = <K extends keyof Guest>(k: K, v: Guest[K]) => setG((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add household' : 'Edit household'}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!g.name.trim()) return setErr('Name is required.');
              if (!Number.isInteger(g.partySize) || g.partySize < 1 || g.partySize > 50)
                return setErr('Party size must be a whole number from 1 to 50.');
              onSave({ ...g, name: g.name.trim() });
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name (household lead)" htmlFor="g-n" className="span-2">
          <input id="g-n" className="input" value={g.name} onChange={(e) => set('name', e.target.value)} data-autofocus />
        </Field>
        <Field label="Group / side" htmlFor="g-g">
          <input id="g-g" className="input" value={g.group} onChange={(e) => set('group', e.target.value)} />
        </Field>
        <Field label="Party size" htmlFor="g-p">
          <input
            id="g-p"
            type="number"
            min={1}
            max={50}
            className="input input-num"
            value={g.partySize}
            onChange={(e) => set('partySize', Number(e.target.value))}
          />
        </Field>
        <Field label="RSVP" htmlFor="g-r">
          <select id="g-r" className="select" value={g.rsvp} onChange={(e) => set('rsvp', e.target.value as RSVP)}>
            {Object.entries(RSVP_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Diet (as stated by the guest)" htmlFor="g-d">
          <select id="g-d" className="select" value={g.diet} onChange={(e) => set('diet', e.target.value as Diet)}>
            {Object.entries(DIET_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Allergies" htmlFor="g-a">
          <input id="g-a" className="input" value={g.allergies} onChange={(e) => set('allergies', e.target.value)} />
        </Field>
        <Field label="Accessibility" htmlFor="g-ac">
          <input id="g-ac" className="input" value={g.accessibility} onChange={(e) => set('accessibility', e.target.value)} />
        </Field>
        <Field label="Seating or assistance notes" htmlFor="g-as" className="span-2">
          <input id="g-as" className="input" value={g.assistanceNotes} onChange={(e) => set('assistanceNotes', e.target.value)} />
        </Field>
        <Field label="Table" htmlFor="g-t">
          <input id="g-t" className="input" value={g.table} onChange={(e) => set('table', e.target.value)} />
        </Field>
        <Field label="Contact (optional)" htmlFor="g-c" hint="Only collect what you need.">
          <input id="g-c" className="input" value={g.contact} onChange={(e) => set('contact', e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="g-no" className="span-2">
          <input id="g-no" className="input" value={g.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      {err && (
        <div className="field-error" role="alert" style={{ marginTop: 10 }}>
          {err}
        </div>
      )}
    </Modal>
  );
}
