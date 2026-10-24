import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Pencil, Plus, Printer, Trash2, Volume2 } from 'lucide-react';
import { BOOKED_STATUSES } from '../domain/budget';
import { analyzeRunOfShow, sortRunItems, timed } from '../domain/runOfShow';
import type { EventPlan, RunItem, RunStatus, TimingStatus } from '../domain/types';
import { addDays, formatDate, isValidTime, minutesToTime, timeToMinutes, uid } from '../domain/util';
import { hrefFor } from '../lib/router';
import { useWorkspace } from '../store/workspace';
import { Drawer, Field, Notice, confirmDialog, toast } from '../ui/kit';

const RUN_STATUS_LABEL: Record<RunStatus, string> = { planned: 'Planned', ready: 'Ready', at_risk: 'At risk' };

export function RunOfShowView({ plan }: { plan: EventPlan }) {
  const days = Math.max(plan.brief.durationDays, ...plan.runOfShow.map((r) => r.dayIndex + 1), 1);
  const [day, setDay] = useState(0);
  const [editing, setEditing] = useState<RunItem | null>(null);
  const issues = useMemo(() => analyzeRunOfShow(plan), [plan]);
  const setCutoff = useWorkspace((s) => s.setSoundCutoff);
  const team = new Map(plan.team.map((m) => [m.id, m.name]));
  const vendors = new Map(plan.vendors.map((v) => [v.id, v]));
  const items = sortRunItems(plan.runOfShow.filter((r) => r.dayIndex === day));
  const dayIssues = issues.filter((i) => i.dayIndex === day);
  const cutoff = plan.daySettings.find((d) => d.dayIndex === day)?.soundCutoff ?? '';
  const sessions = plan.brief.sessions.filter((s) => s.dayIndex === day);

  const blank = (): RunItem => {
    const last = items[items.length - 1];
    const start = last && isValidTime(last.end) ? last.end : '10:00';
    return {
      id: uid('r'),
      dayIndex: day,
      start,
      end: minutesToTime(timeToMinutes(start) + 60),
      title: '',
      location: last?.location ?? '',
      leadId: plan.team[0]?.id,
      vendorIds: [],
      setupMinutes: 0,
      setupNotes: '',
      dependsOn: [],
      bufferMinutes: 15,
      timing: 'suggested',
      status: 'planned',
      contingency: '',
      amplifiedSound: false,
    };
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 26 }}>Run of Show</h2>
          <p>
            The event-day production schedule. Overlaps, missing setup windows, dependency breaks and sound cut-offs are checked as you
            edit. Suggested timings are marked until confirmed.
          </p>
        </div>
        <div className="row-wrap">
          <a className="btn" href={hrefFor({ name: 'report', eventId: plan.id, kind: 'runofshow' })}>
            <Printer /> Print schedule
          </a>
          <button className="btn btn-primary" onClick={() => setEditing(blank())}>
            <Plus /> Add item
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Event days">
        {Array.from({ length: days }, (_, i) => {
          const n = issues.filter((x) => x.dayIndex === i && x.severity !== 'info').length;
          return (
            <button key={i} role="tab" aria-selected={day === i} onClick={() => setDay(i)}>
              Day {i + 1} · {formatDate(addDays(plan.brief.eventDate, i), { weekday: true, year: false })}
              {n > 0 && (
                <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="row-between">
        <div className="row-wrap small ink-2">
          {sessions.length ? (
            <>
              Sessions:{' '}
              {sessions.map((s) => (
                <span key={s.id} className="badge badge-outline">
                  {s.name} · {s.start}–{s.end}
                </span>
              ))}
            </>
          ) : (
            'No sessions on this day.'
          )}
        </div>
        <div className="row">
          <Volume2 style={{ width: 16, height: 16, color: 'var(--muted)' }} />
          <label className="small" htmlFor="cutoff">
            Amplified sound cut-off
          </label>
          <input
            id="cutoff"
            type="time"
            className="input input-sm"
            value={cutoff}
            onChange={(e) => setCutoff(day, e.target.value)}
            style={{ width: 120 }}
          />
          {cutoff && (
            <button className="btn btn-xs btn-ghost" onClick={() => setCutoff(day, '')}>
              Clear
            </button>
          )}
        </div>
      </div>
      <p className="tiny muted">
        The sound cut-off is set by you — check local noise rules and venue policy; Sutrā does not look these up.
      </p>

      {dayIssues.length > 0 ? (
        <section className="card card-pad" aria-labelledby="iss-h">
          <h3 id="iss-h" style={{ marginBottom: 8 }}>
            <AlertTriangle style={{ display: 'inline', width: 17, height: 17, verticalAlign: '-3px', color: 'var(--warn)' }} />{' '}
            {dayIssues.length} scheduling issue{dayIssues.length > 1 ? 's' : ''} on Day {day + 1}
          </h3>
          <ul className="bullets small">
            {dayIssues.map((i) => (
              <li key={i.id}>
                <span
                  className={`badge ${i.severity === 'error' ? 'badge-danger' : i.severity === 'warning' ? 'badge-warn' : 'badge-info'}`}
                >
                  {i.kind.replace('_', ' ')}
                </span>{' '}
                {i.message}
              </li>
            ))}
          </ul>
        </section>
      ) : items.length > 0 ? (
        <Notice tone="ok" icon={<CheckCircle2 />}>
          No conflicts detected on Day {day + 1} with the information available.
        </Notice>
      ) : null}

      <section className="card">
        {items.map((r) => {
          const t = timed(r);
          const mine = dayIssues.filter((i) => i.itemId === r.id);
          const err = mine.some((i) => i.severity === 'error');
          const warn = mine.some((i) => i.severity === 'warning');
          const cancelled = r.vendorIds
            .map((id) => vendors.get(id))
            .filter((v) => v && (v.status === 'cancelled' || v.status === 'rejected'));
          return (
            <div key={r.id} className={`ros-item${err ? ' has-error' : warn ? ' has-warning' : ''}`}>
              <div className="ros-time">
                {r.start}
                <span className="end">
                  to {r.end}
                  {t?.crossesMidnight ? ' (+1 day)' : ''}
                </span>
                {r.setupMinutes > 0 && (
                  <span className="end tiny">setup from {minutesToTime(timeToMinutes(r.start) - r.setupMinutes)}</span>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="row-wrap">
                  <strong>{r.title}</strong>
                  <span className={`badge ${r.timing === 'confirmed' ? 'badge-ok' : 'badge-outline'}`}>
                    {r.timing === 'confirmed' ? 'Confirmed timing' : 'Suggested timing'}
                  </span>
                  {r.status !== 'planned' && (
                    <span className={`badge ${r.status === 'ready' ? 'badge-ok' : 'badge-danger'}`}>{RUN_STATUS_LABEL[r.status]}</span>
                  )}
                  {r.amplifiedSound && (
                    <span className="badge badge-info">
                      <Volume2 /> Amplified
                    </span>
                  )}
                </div>
                <div className="small ink-2" style={{ marginTop: 3 }}>
                  {r.location || 'No location'} · Lead: {r.leadId ? (team.get(r.leadId) ?? 'Unassigned') : 'Unassigned'}
                  {r.bufferMinutes ? ` · ${r.bufferMinutes} min buffer` : ''}
                </div>
                {r.vendorIds.length > 0 && (
                  <div className="row-wrap" style={{ marginTop: 5 }}>
                    {r.vendorIds.map((id) => {
                      const v = vendors.get(id);
                      if (!v) return null;
                      return (
                        <span
                          key={id}
                          className={`badge ${v.status === 'cancelled' ? 'badge-danger' : BOOKED_STATUSES.has(v.status) ? 'badge-ok' : 'badge-outline'}`}
                        >
                          {v.name}
                          {BOOKED_STATUSES.has(v.status) ? '' : ` · ${v.status}`}
                        </span>
                      );
                    })}
                  </div>
                )}
                {(r.setupMinutes > 0 || r.setupNotes) && (
                  <div className="ros-setup">
                    <Clock style={{ display: 'inline', width: 12, height: 12, verticalAlign: '-1px' }} /> Setup {r.setupMinutes} min
                    {r.setupNotes ? ` — ${r.setupNotes}` : ''}
                  </div>
                )}
                {r.dependsOn.length > 0 && (
                  <div className="ros-setup">
                    After:{' '}
                    {r.dependsOn
                      .map((d) => plan.runOfShow.find((x) => x.id === d)?.title)
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                )}
                {r.contingency && (
                  <div className="ros-setup">
                    <span className="muted">Contingency:</span> {r.contingency}
                  </div>
                )}
                {cancelled.length > 0 && (
                  <div className="field-error" style={{ marginTop: 4 }}>
                    Assigned vendor cancelled: {cancelled.map((v) => v!.name).join(', ')}
                  </div>
                )}
                {mine.map((i) => (
                  <div
                    key={i.id}
                    className="small"
                    style={{ color: i.severity === 'error' ? 'var(--danger)' : 'var(--warn)', marginTop: 3 }}
                  >
                    ⚠ {i.message}
                  </div>
                ))}
              </div>
              <div>
                <button className="icon-btn" aria-label={`Edit ${r.title}`} onClick={() => setEditing(r)}>
                  <Pencil />
                </button>
              </div>
            </div>
          );
        })}
        {!items.length && (
          <div className="card-body muted" style={{ textAlign: 'center' }}>
            No items on this day yet.{' '}
            <button className="link-btn" onClick={() => setEditing(blank())}>
              Add the first item
            </button>
          </div>
        )}
      </section>

      {editing && <RunEditor plan={plan} item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RunEditor({ plan, item, onClose }: { plan: EventPlan; item: RunItem; onClose: () => void }) {
  const isNew = !plan.runOfShow.some((r) => r.id === item.id);
  const [d, setD] = useState<RunItem>(item);
  const [err, setErr] = useState('');
  const upsert = useWorkspace((s) => s.upsertRunItem);
  const remove = useWorkspace((s) => s.removeRunItem);
  const set = <K extends keyof RunItem>(k: K, v: RunItem[K]) => setD((x) => ({ ...x, [k]: v }));
  const locations = [...new Set([...plan.runOfShow.map((r) => r.location), ...plan.brief.sessions.map((s) => s.area)].filter(Boolean))];
  const days = Math.max(plan.brief.durationDays, 1);
  const save = () => {
    if (!d.title.trim()) return setErr('Give the item a title.');
    if (!isValidTime(d.start) || !isValidTime(d.end)) return setErr('Enter valid start and end times.');
    if (d.start === d.end) return setErr('Start and end can’t be the same time.');
    upsert({ ...d, title: d.title.trim() });
    toast('Run-of-show item saved — conflicts re-checked.');
    onClose();
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'Add run-of-show item' : 'Edit run-of-show item'}
      subtitle="End times earlier than the start are treated as running past midnight."
      footer={
        <>
          {!isNew && (
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (await confirmDialog({ title: 'Delete this item?', confirmLabel: 'Delete', danger: true })) {
                  remove(d.id);
                  onClose();
                }
              }}
            >
              <Trash2 /> Delete
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save item
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Activity or ceremony" htmlFor="r-t" className="span-2">
          <input id="r-t" className="input" value={d.title} onChange={(e) => set('title', e.target.value)} data-autofocus />
        </Field>
        <Field label="Day" htmlFor="r-d">
          <select id="r-d" className="select" value={d.dayIndex} onChange={(e) => set('dayIndex', Number(e.target.value))}>
            {Array.from({ length: days }, (_, i) => (
              <option key={i} value={i}>
                Day {i + 1} · {formatDate(addDays(plan.brief.eventDate, i), { year: false })}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location / area" htmlFor="r-l">
          <input id="r-l" className="input" list="ros-locations" value={d.location} onChange={(e) => set('location', e.target.value)} />
          <datalist id="ros-locations">
            {locations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field label="Start" htmlFor="r-s">
          <input id="r-s" type="time" className="input" value={d.start} onChange={(e) => set('start', e.target.value)} />
        </Field>
        <Field label="End" htmlFor="r-e">
          <input id="r-e" type="time" className="input" value={d.end} onChange={(e) => set('end', e.target.value)} />
        </Field>
        <Field label="Lead" htmlFor="r-lead">
          <select id="r-lead" className="select" value={d.leadId ?? ''} onChange={(e) => set('leadId', e.target.value || undefined)}>
            <option value="">Unassigned</option>
            {plan.team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Timing" htmlFor="r-tm">
          <select id="r-tm" className="select" value={d.timing} onChange={(e) => set('timing', e.target.value as TimingStatus)}>
            <option value="suggested">Suggested (not yet confirmed)</option>
            <option value="confirmed">Confirmed with venue & vendors</option>
          </select>
        </Field>
        <Field label="Setup needed before start (min)" htmlFor="r-su">
          <input
            id="r-su"
            type="number"
            min={0}
            className="input input-num"
            value={d.setupMinutes}
            onChange={(e) => set('setupMinutes', Math.max(0, Math.round(Number(e.target.value))))}
          />
        </Field>
        <Field label="Buffer target (min)" htmlFor="r-b">
          <input
            id="r-b"
            type="number"
            min={0}
            className="input input-num"
            value={d.bufferMinutes}
            onChange={(e) => set('bufferMinutes', Math.max(0, Math.round(Number(e.target.value))))}
          />
        </Field>
        <Field label="Setup requirements" htmlFor="r-sn" className="span-2">
          <input id="r-sn" className="input" value={d.setupNotes} onChange={(e) => set('setupNotes', e.target.value)} />
        </Field>
        <Field label="Status" htmlFor="r-st">
          <select id="r-st" className="select" value={d.status} onChange={(e) => set('status', e.target.value as RunStatus)}>
            {Object.entries(RUN_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}>
          <input type="checkbox" checked={d.amplifiedSound} onChange={(e) => set('amplifiedSound', e.target.checked)} /> Uses amplified
          sound
        </label>
        <div className="field span-2">
          <span className="field-label">Required vendors</span>
          <div className="card" style={{ maxHeight: 170, overflowY: 'auto', padding: '6px 10px' }}>
            {plan.vendors
              .filter((v) => v.status !== 'rejected')
              .map((v) => (
                <label key={v.id} className="check" style={{ display: 'flex', padding: '2px 0' }}>
                  <input
                    type="checkbox"
                    checked={d.vendorIds.includes(v.id)}
                    onChange={(e) => set('vendorIds', e.target.checked ? [...d.vendorIds, v.id] : d.vendorIds.filter((x) => x !== v.id))}
                  />
                  <span className="small">
                    {v.name} <span className="muted">· {v.status}</span>
                  </span>
                </label>
              ))}
            {!plan.vendors.length && <span className="small muted">No vendors yet.</span>}
          </div>
        </div>
        <div className="field span-2">
          <span className="field-label">Starts after</span>
          <div className="card" style={{ maxHeight: 150, overflowY: 'auto', padding: '6px 10px' }}>
            {sortRunItems(plan.runOfShow.filter((r) => r.id !== d.id)).map((r) => (
              <label key={r.id} className="check" style={{ display: 'flex', padding: '2px 0' }}>
                <input
                  type="checkbox"
                  checked={d.dependsOn.includes(r.id)}
                  onChange={(e) => set('dependsOn', e.target.checked ? [...d.dependsOn, r.id] : d.dependsOn.filter((x) => x !== r.id))}
                />
                <span className="small">
                  Day {r.dayIndex + 1} {r.start} · {r.title}
                </span>
              </label>
            ))}
          </div>
        </div>
        <Field label="Contingency notes" htmlFor="r-c" className="span-2">
          <textarea id="r-c" className="textarea" value={d.contingency} onChange={(e) => set('contingency', e.target.value)} />
        </Field>
      </div>
      {err && (
        <div className="field-error" role="alert" style={{ marginTop: 10 }}>
          {err}
        </div>
      )}
    </Drawer>
  );
}
