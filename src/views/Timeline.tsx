import { useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GanttChartSquare,
  List,
  Plus,
  Trash2,
  Layers,
  Pin,
  Diamond,
} from 'lucide-react';
import { CATEGORY_META, PRIORITY_LABEL, TASK_STATUS_LABEL, WORKSTREAMS, workstreamLabel, categoryMeta } from '../domain/catalog';
import { wouldCreateCycle } from '../domain/timeline';
import type { EventPlan, Priority, Task, TaskStatus, Workstream } from '../domain/types';
import { addDays, diffDays, formatDate, formatMonthYear, isValidISODate, plural, relativeDays, uid, weekdayIndex } from '../domain/util';
import { useWorkspace } from '../store/workspace';
import { Drawer, Field, Meter, Notice, Segmented, confirmDialog, toast } from '../ui/kit';
import { useInsights, useToday } from './common';
import { DateChangeDialog } from './Brief';

type Mode = 'list' | 'calendar' | 'gantt' | 'workstreams';

export function TimelineView({ plan }: { plan: EventPlan }) {
  const ins = useInsights(plan);
  const t = ins.timeline;
  const today = useToday();
  const [mode, setMode] = useState<Mode>('list');
  const [status, setStatus] = useState<'open' | 'all' | 'done'>('open');
  const [ws, setWs] = useState<Workstream | 'all'>('all');
  const [owner, setOwner] = useState<string>('all');
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const setTaskStatus = useWorkspace((s) => s.setTaskStatus);
  const dismissReport = useWorkspace((s) => s.dismissScheduleReport);
  const team = new Map(plan.team.map((m) => [m.id, m.name]));

  const filtered = t.ordered.filter((task) => {
    const i = t.insights.get(task.id)!;
    if (status === 'open' && task.status === 'done') return false;
    if (status === 'done' && task.status !== 'done') return false;
    if (ws !== 'all' && task.workstream !== ws) return false;
    if (owner !== 'all' && (task.ownerId ?? 'none') !== owner) return false;
    if (onlyRisk && !(i.overdue || i.critical || i.atRisk || i.venueBlocked || i.vendorBlocked)) return false;
    return true;
  });

  const newTask = (): Task => ({
    id: uid('t'),
    title: '',
    workstream: 'planning',
    ownerId: plan.team[0]?.id,
    status: 'todo',
    priority: 'medium',
    dueDate: addDays(today, 7) < plan.brief.eventDate ? addDays(today, 7) : plan.brief.eventDate,
    durationDays: 2,
    dependsOn: [],
    schedule: 'relative',
    offsetDays: diffDays(plan.brief.eventDate, addDays(today, 7)),
    milestone: false,
    requiresVenue: false,
    notes: '',
    source: 'planner',
  });

  const report = plan.lastScheduleChange;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 26 }}>Timeline</h2>
          <p>
            {t.daysToEvent > 0
              ? `${t.daysToEvent} days to ${formatDate(plan.brief.eventDate, { weekday: true })}.`
              : 'Event day has arrived.'}{' '}
            Deadlines are calculated from the event date and task dependencies; tasks can’t be finalised while what they depend on is open.
          </p>
        </div>
        <div className="row-wrap">
          <button className="btn" onClick={() => setDateOpen(true)}>
            <CalendarClock /> Change event date
          </button>
          <button className="btn btn-primary" onClick={() => setEditing(newTask())}>
            <Plus /> Add task
          </button>
        </div>
      </div>

      {report && (
        <section className="card" aria-labelledby="chg-h" style={{ borderColor: '#d9c590' }}>
          <div className="card-head" style={{ background: '#fbf3df' }}>
            <div>
              <h3 id="chg-h">
                What changed: event moved {formatDate(report.oldDate)} → {formatDate(report.newDate)}
              </h3>
              <div className="sub">
                {report.deltaDays > 0 ? '+' : ''}
                {report.deltaDays} days · applied {formatDate(report.at.slice(0, 10))}
              </div>
            </div>
            <button className="btn btn-sm" onClick={dismissReport}>
              Mark as reviewed
            </button>
          </div>
          <div className="card-body grid-2">
            <div>
              <div className="mini-h" style={{ marginTop: 0 }}>
                Why
              </div>
              <p className="small ink-2">
                Relative deadlines follow the event date. Completed work and pinned dates were left exactly as they were.
              </p>
              <ul className="bullets small">
                <li>{plural(report.moved.length, 'task')} rescheduled</li>
                <li>{plural(report.preserved.length, 'completed task')} preserved</li>
                {report.pinned.length > 0 && <li>{plural(report.pinned.length, 'pinned task')} kept their dates</li>}
                {report.compressed.length > 0 && (
                  <li className="delta-up">{plural(report.compressed.length, 'task')} would have fallen in the past — set to today</li>
                )}
              </ul>
            </div>
            <div>
              <div className="mini-h" style={{ marginTop: 0 }}>
                Needs attention
              </div>
              {report.conflicts.length || report.paymentsAfterEvent.length ? (
                <ul className="bullets small">
                  {report.conflicts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                  {report.compressed.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      “{c.title}” wanted {formatDate(c.wanted)}
                    </li>
                  ))}
                  {report.paymentsAfterEvent.map((p) => (
                    <li key={p.id}>
                      Payment “{p.label}” ({formatDate(p.dueDate)}) is now after the event
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small ok">No conflicts detected.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {t.venueBlocked.length > 0 && (
        <Notice tone="warn">
          <strong>{plural(t.venueBlocked.length, 'task')} can’t be finalised until the venue is confirmed:</strong>{' '}
          {t.venueBlocked.map((x) => x.title).join('; ')}.
        </Notice>
      )}
      {t.vendorBlocked.length > 0 && (
        <Notice tone="warn">
          <strong>{plural(t.vendorBlocked.length, 'task')} need a booked vendor first:</strong>{' '}
          {t.vendorBlocked.map((x) => `${x.title} (${categoryMeta(x.vendorCategory!)?.label ?? x.vendorCategory})`).join('; ')}.
        </Notice>
      )}

      <section className="kpis">
        <div className="stat">
          <div className="stat-label">Progress</div>
          <div className="stat-value">{t.pct}%</div>
          <div style={{ marginTop: 6 }}>
            <Meter value={t.done} max={t.total} label="Tasks complete" small />
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Overdue</div>
          <div className={`stat-value${t.overdue.length ? ' danger' : ''}`}>{t.overdue.length}</div>
          <div className="stat-sub">open tasks past due</div>
        </div>
        <div className="stat">
          <div className="stat-label">Critical</div>
          <div className="stat-value">{t.critical.length}</div>
          <div className="stat-sub">≤ 2 days of slack</div>
        </div>
        <div className="stat">
          <div className="stat-label">Due this week</div>
          <div className="stat-value">{t.dueThisWeek.length}</div>
          <div className="stat-sub">next 7 days</div>
        </div>
        <div className="stat">
          <div className="stat-label">Blocked</div>
          <div className="stat-value">{t.venueBlocked.length + t.vendorBlocked.length}</div>
          <div className="stat-sub">venue or vendor dependency</div>
        </div>
      </section>

      <div className="row-between">
        <Segmented<Mode>
          label="Timeline view"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'list', label: 'List', icon: <List /> },
            { value: 'calendar', label: 'Calendar', icon: <CalendarDays /> },
            { value: 'gantt', label: 'Chronology', icon: <GanttChartSquare /> },
            { value: 'workstreams', label: 'Workstreams', icon: <Layers /> },
          ]}
        />
        <div className="row-wrap">
          <label className="sr-only" htmlFor="f-status">
            Status
          </label>
          <select
            id="f-status"
            className="select input-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            style={{ width: 130 }}
          >
            <option value="open">Open tasks</option>
            <option value="all">All tasks</option>
            <option value="done">Completed</option>
          </select>
          <label className="sr-only" htmlFor="f-ws">
            Workstream
          </label>
          <select
            id="f-ws"
            className="select input-sm"
            value={ws}
            onChange={(e) => setWs(e.target.value as Workstream | 'all')}
            style={{ width: 170 }}
          >
            <option value="all">All workstreams</option>
            {WORKSTREAMS.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="f-owner">
            Owner
          </label>
          <select id="f-owner" className="select input-sm" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ width: 160 }}>
            <option value="all">Everyone</option>
            {plan.team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="none">Unassigned</option>
          </select>
          <label className="check small">
            <input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} /> Needs attention only
          </label>
        </div>
      </div>

      {mode === 'list' && (
        <TaskList
          plan={plan}
          tasks={filtered}
          onOpen={setEditing}
          onToggle={(task) => {
            setTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done');
          }}
          team={team}
        />
      )}
      {mode === 'calendar' && <CalendarView plan={plan} tasks={filtered} onOpen={setEditing} />}
      {mode === 'gantt' && <Chronology plan={plan} tasks={filtered} onOpen={setEditing} />}
      {mode === 'workstreams' && (
        <section className="card card-pad">
          <div className="stack">
            {t.byWorkstream.map((w) => (
              <div key={w.workstream}>
                <div className="row-between small" style={{ marginBottom: 5 }}>
                  <button
                    className="link-btn"
                    onClick={() => {
                      setWs(w.workstream);
                      setMode('list');
                    }}
                  >
                    {w.label}
                  </button>
                  <span className="num">
                    {w.done}/{w.total} done{w.overdue ? <span className="delta-up"> · {w.overdue} overdue</span> : null}
                  </span>
                </div>
                <Meter value={w.done} max={w.total} tone={w.overdue ? 'warn' : undefined} label={`${w.label} progress`} />
              </div>
            ))}
          </div>
        </section>
      )}

      {editing && <TaskEditor plan={plan} task={editing} onClose={() => setEditing(null)} />}
      {dateOpen && <DateChangeDialog plan={plan} open onClose={() => setDateOpen(false)} />}
    </div>
  );
}

function TaskFlags({ plan, task }: { plan: EventPlan; task: Task }) {
  const ins = useInsights(plan);
  const i = ins.timeline.insights.get(task.id);
  if (!i) return null;
  return (
    <div className="task-flags">
      {task.milestone && (
        <span className="badge badge-gold">
          <Diamond /> Milestone
        </span>
      )}
      {i.overdue && <span className="badge badge-danger">{-i.daysUntilDue} days overdue</span>}
      {!i.overdue && i.atRisk && <span className="badge badge-danger">At risk · short {-i.slackDays}d</span>}
      {!i.overdue && !i.atRisk && i.critical && <span className="badge badge-warn">Critical path</span>}
      {i.venueBlocked && <span className="badge badge-warn">Needs venue</span>}
      {i.vendorBlocked && (
        <span className="badge badge-warn">Needs booked {categoryMeta(task.vendorCategory!)?.label.toLowerCase() ?? 'vendor'}</span>
      )}
      {i.blockedBy.length > 0 && (
        <span className="badge badge-outline" title={i.blockedBy.map((d) => d.title).join(', ')}>
          Waits on {i.blockedBy.length}
        </span>
      )}
      {i.dependencyConflicts.length > 0 && <span className="badge badge-danger">Due before dependency</span>}
      {task.schedule === 'pinned' && (
        <span className="badge badge-outline">
          <Pin /> Pinned date
        </span>
      )}
      {task.status === 'blocked' && <span className="badge badge-danger">Blocked</span>}
      {task.status === 'in_progress' && <span className="badge badge-info">In progress</span>}
      {task.source === 'copilot' && <span className="badge badge-gold">From co-pilot</span>}
    </div>
  );
}

function TaskList({
  plan,
  tasks,
  onOpen,
  onToggle,
  team,
}: {
  plan: EventPlan;
  tasks: Task[];
  onOpen: (t: Task) => void;
  onToggle: (t: Task) => void;
  team: Map<string, string>;
}) {
  const ins = useInsights(plan);
  const groups = useMemo(() => {
    const g = new Map<string, Task[]>();
    for (const t of tasks) {
      const k = t.dueDate.slice(0, 7);
      g.set(k, [...(g.get(k) ?? []), t]);
    }
    return [...g.entries()];
  }, [tasks]);
  if (!tasks.length) return <div className="card card-pad muted">No tasks match these filters.</div>;
  return (
    <div>
      {groups.map(([month, list]) => (
        <div className="month-group" key={month}>
          <div className="month-title">
            {formatMonthYear(`${month}-01`)} <span className="small muted">{plural(list.length, 'task')}</span>
          </div>
          <div className="task-list">
            {list.map((task) => {
              const i = ins.timeline.insights.get(task.id)!;
              return (
                <div
                  key={task.id}
                  className={`task-row${task.status === 'done' ? ' is-done' : ''}${i.overdue ? ' is-overdue' : i.critical || i.atRisk ? ' is-critical' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    onChange={() => onToggle(task)}
                    aria-label={`Mark “${task.title}” ${task.status === 'done' ? 'not done' : 'done'}`}
                    style={{ width: 17, height: 17, accentColor: 'var(--forest)' }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <button className="task-title" onClick={() => onOpen(task)}>
                      {task.title}
                    </button>
                    <div className="small muted">{workstreamLabel(task.workstream)}</div>
                    <TaskFlags plan={plan} task={task} />
                  </div>
                  <div className="task-owner small ink-2">{task.ownerId ? (team.get(task.ownerId) ?? 'Unassigned') : 'Unassigned'}</div>
                  <div className="task-due">
                    <div>{formatDate(task.dueDate, { year: false })}</div>
                    <div className={`tiny ${i.overdue ? 'delta-up' : 'muted'}`}>
                      {task.status === 'done'
                        ? `done ${task.completedOn ? formatDate(task.completedOn, { year: false }) : ''}`
                        : relativeDays(i.daysUntilDue)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarView({ plan, tasks, onOpen }: { plan: EventPlan; tasks: Task[]; onOpen: (t: Task) => void }) {
  const today = useToday();
  const ins = useInsights(plan);
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = `${month}-01`;
  const lead = (weekdayIndex(first) + 6) % 7;
  const start = addDays(first, -lead);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) byDate.set(t.dueDate, [...(byDate.get(t.dueDate) ?? []), t]);
  const eventDays = new Set(Array.from({ length: plan.brief.durationDays }, (_, i) => addDays(plan.brief.eventDate, i)));
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  return (
    <section className="card card-pad">
      <div className="row-between" style={{ marginBottom: 12 }}>
        <h3>{formatMonthYear(first)}</h3>
        <div className="row">
          <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft />
          </button>
          <button className="btn btn-sm" onClick={() => setMonth(today.slice(0, 7))}>
            Today
          </button>
          <button className="btn btn-sm" onClick={() => setMonth(plan.brief.eventDate.slice(0, 7))}>
            Event month
          </button>
          <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className="cal" role="grid" aria-label={`Tasks in ${formatMonthYear(first)}`}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="cal-dow" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const list = byDate.get(d) ?? [];
          return (
            <div
              key={d}
              role="gridcell"
              className={`cal-cell${d.slice(0, 7) !== month ? ' other' : ''}${d === today ? ' today' : ''}${eventDays.has(d) ? ' event' : ''}`}
            >
              <span className="cal-day">{Number(d.slice(8))}</span>
              {eventDays.has(d) && (
                <div className="tiny strong" style={{ color: 'var(--gold-strong)' }}>
                  Event day
                </div>
              )}
              {list.slice(0, 3).map((t) => {
                const i = ins.timeline.insights.get(t.id)!;
                return (
                  <button
                    key={t.id}
                    className={`cal-item${t.status === 'done' ? ' done' : i.overdue ? ' overdue' : t.milestone ? ' milestone' : ''}`}
                    onClick={() => onOpen(t)}
                    title={t.title}
                  >
                    {t.title}
                  </button>
                );
              })}
              {list.length > 3 && <div className="tiny muted">+{list.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Chronology({ plan, tasks, onOpen }: { plan: EventPlan; tasks: Task[]; onOpen: (t: Task) => void }) {
  const today = useToday();
  const ins = useInsights(plan);
  const open = tasks.filter((t) => t.status !== 'done' || diffDays(t.dueDate, today) <= 14);
  const starts = open.map((t) => addDays(t.dueDate, -t.durationDays));
  const minD = [today, ...starts].sort()[0];
  const maxD = [addDays(plan.brief.eventDate, 8), ...open.map((t) => t.dueDate)].sort().slice(-1)[0];
  const span = Math.max(1, diffDays(minD, maxD));
  const pos = (d: string) => (diffDays(minD, d) / span) * 100;
  return (
    <section className="card card-pad">
      <div className="row-between small muted" style={{ marginBottom: 8 }}>
        <span>{formatDate(minD)}</span>
        <span className="viz-key">
          <span className="viz-tick" style={{ background: 'var(--gold)' }} /> Today
        </span>
        <span>{formatDate(maxD)}</span>
      </div>
      <div className="viz-legend">
        <span className="viz-key">
          <span className="viz-swatch" style={{ background: 'var(--viz-1)' }} />
          Planned work
        </span>
        <span className="viz-key">
          <span className="viz-swatch" style={{ background: '#b7791f' }} />
          Critical / at risk
        </span>
        <span className="viz-key">
          <span className="viz-swatch" style={{ background: '#b2453a' }} />
          Overdue
        </span>
        <span className="viz-key">
          <span className="viz-swatch" style={{ background: '#b9c4bb' }} />
          Done
        </span>
      </div>
      <div className="gantt">
        {open.map((t) => {
          const i = ins.timeline.insights.get(t.id)!;
          const s = addDays(t.dueDate, -t.durationDays);
          const cls = t.status === 'done' ? 'done' : i.overdue ? 'overdue' : i.critical || i.atRisk ? 'critical' : '';
          return (
            <div className="gantt-row" key={t.id}>
              <button
                className="link-btn"
                style={{
                  textAlign: 'left',
                  color: 'var(--ink)',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => onOpen(t)}
                title={t.title}
              >
                {t.title}
              </button>
              <div className="gantt-track" title={`${formatDate(s)} → ${formatDate(t.dueDate)}`}>
                <span
                  className={`gantt-bar ${cls}`}
                  style={{ left: `${Math.max(0, pos(s))}%`, width: `${Math.max(0.6, pos(t.dueDate) - Math.max(0, pos(s)))}%` }}
                />
                <span className="gantt-now" style={{ left: `${pos(today)}%` }} />
              </div>
            </div>
          );
        })}
        {!open.length && <div className="muted">No tasks to chart.</div>}
      </div>
    </section>
  );
}

function TaskEditor({ plan, task, onClose }: { plan: EventPlan; task: Task; onClose: () => void }) {
  const isNew = !plan.tasks.some((t) => t.id === task.id);
  const [d, setD] = useState<Task>(task);
  const [moves, setMoves] = useState(task.schedule === 'relative');
  const [error, setError] = useState('');
  const upsert = useWorkspace((s) => s.upsertTask);
  const remove = useWorkspace((s) => s.removeTask);
  const ins = useInsights(plan);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setD((x) => ({ ...x, [k]: v }));
  const others = plan.tasks.filter((t) => t.id !== d.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const save = () => {
    if (d.title.trim().length < 3) return setError('Give the task a title (3+ characters).');
    if (!isValidISODate(d.dueDate)) return setError('Enter a valid due date.');
    const next: Task = {
      ...d,
      title: d.title.trim(),
      schedule: moves ? 'relative' : 'pinned',
      offsetDays: diffDays(plan.brief.eventDate, d.dueDate),
      completedOn: d.status === 'done' ? (d.completedOn ?? new Date().toISOString().slice(0, 10)) : undefined,
    };
    upsert(next);
    toast(isNew ? 'Task added — dependencies and deadlines recalculated.' : 'Task saved.');
    onClose();
  };
  const i = ins.timeline.insights.get(d.id);
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'New task' : 'Edit task'}
      subtitle={i ? i.flags.join(' · ') || 'On track' : 'Tasks move with the event date unless pinned.'}
      footer={
        <>
          {!isNew && (
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: 'Delete this task?',
                    body: 'Other tasks that depend on it will lose that dependency. You can undo this.',
                    confirmLabel: 'Delete',
                    danger: true,
                  })
                ) {
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
            Save task
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Title" htmlFor="t-title" className="span-2">
          <input id="t-title" className="input" value={d.title} onChange={(e) => set('title', e.target.value)} data-autofocus />
        </Field>
        <Field label="Workstream" htmlFor="t-ws">
          <select id="t-ws" className="select" value={d.workstream} onChange={(e) => set('workstream', e.target.value as Workstream)}>
            {WORKSTREAMS.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner" htmlFor="t-owner">
          <select id="t-owner" className="select" value={d.ownerId ?? ''} onChange={(e) => set('ownerId', e.target.value || undefined)}>
            <option value="">Unassigned</option>
            {plan.team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.role}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" htmlFor="t-status">
          <select id="t-status" className="select" value={d.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
            {Object.entries(TASK_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority" htmlFor="t-pri">
          <select id="t-pri" className="select" value={d.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Due date"
          htmlFor="t-due"
          hint={`${Math.abs(diffDays(plan.brief.eventDate, d.dueDate))} days ${diffDays(plan.brief.eventDate, d.dueDate) <= 0 ? 'before' : 'after'} the event`}
        >
          <input id="t-due" type="date" className="input" value={d.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
        <Field label="Duration (days of work)" htmlFor="t-dur">
          <input
            id="t-dur"
            type="number"
            min={0}
            max={120}
            className="input input-num"
            value={d.durationDays}
            onChange={(e) => set('durationDays', Math.max(0, Math.round(Number(e.target.value))))}
          />
        </Field>
        <label className="check span-2">
          <input type="checkbox" checked={moves} onChange={(e) => setMoves(e.target.checked)} /> Moves with the event date (untick to pin
          this date, e.g. a vendor’s fixed deadline)
        </label>
        <label className="check">
          <input type="checkbox" checked={d.milestone} onChange={(e) => set('milestone', e.target.checked)} /> Milestone
        </label>
        <label className="check">
          <input type="checkbox" checked={d.requiresVenue} onChange={(e) => set('requiresVenue', e.target.checked)} /> Can’t finalise
          without a confirmed venue
        </label>
        <Field label="Vendor link" htmlFor="t-vcat">
          <select
            id="t-vcat"
            className="select"
            value={d.vendorCategory ?? ''}
            onChange={(e) => set('vendorCategory', e.target.value || undefined)}
          >
            <option value="">None</option>
            {CATEGORY_META.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        {d.vendorCategory && (
          <Field label="Relationship" htmlFor="t-vrole">
            <select
              id="t-vrole"
              className="select"
              value={d.vendorRole ?? 'requires'}
              onChange={(e) => set('vendorRole', e.target.value as 'book' | 'requires')}
            >
              <option value="book">Completing this books the vendor</option>
              <option value="requires">Needs a booked vendor first</option>
            </select>
          </Field>
        )}
        <div className="field span-2">
          <span className="field-label">Depends on</span>
          <div className="card" style={{ maxHeight: 220, overflowY: 'auto', padding: '6px 10px' }}>
            {others.map((o) => {
              const checked = d.dependsOn.includes(o.id);
              const cycle =
                !checked && wouldCreateCycle(plan.tasks.map((t) => (t.id === d.id ? d : t)).concat(isNew ? [d] : []), d.id, o.id);
              return (
                <label
                  key={o.id}
                  className="check"
                  style={{ display: 'flex', padding: '3px 0', opacity: cycle ? 0.45 : 1 }}
                  title={cycle ? 'Would create a circular dependency' : undefined}
                >
                  <input
                    type="checkbox"
                    disabled={cycle}
                    checked={checked}
                    onChange={(e) => set('dependsOn', e.target.checked ? [...d.dependsOn, o.id] : d.dependsOn.filter((x) => x !== o.id))}
                  />
                  <span className="small">
                    {o.title} <span className="muted">· {formatDate(o.dueDate, { year: false })}</span>
                    {cycle && <span className="muted"> · would create a loop</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <Field label="Notes" htmlFor="t-notes" className="span-2">
          <textarea id="t-notes" className="textarea" value={d.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      {error && (
        <div className="field-error" role="alert" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
    </Drawer>
  );
}
