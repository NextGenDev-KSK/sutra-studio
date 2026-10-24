import { useState } from 'react';
import { Bot, Cog, Pencil, Plus, Trash2, User } from 'lucide-react';
import { TASK_STATUS_LABEL, VIEW_LABELS } from '../domain/catalog';
import type { Actor, EventPlan, Note, TaskStatus, TeamMember } from '../domain/types';
import { formatDate, formatDateTime, uid } from '../domain/util';
import { useWorkspace } from '../store/workspace';
import { Field, Modal, Notice, confirmDialog, initials, toast } from '../ui/kit';
import { useInsights } from './common';

export function TeamTasks({ plan }: { plan: EventPlan }) {
  const ins = useInsights(plan);
  const [owner, setOwner] = useState('all');
  const [member, setMember] = useState<TeamMember | null>(null);
  const [actor, setActor] = useState<Actor | 'all'>('all');
  const [note, setNote] = useState<Omit<Note, 'id' | 'at'>>({ kind: 'decision', title: '', body: '', authorId: plan.team[0]?.id });
  const setTaskStatus = useWorkspace((s) => s.setTaskStatus);
  const removeMember = useWorkspace((s) => s.removeMember);
  const addNote = useWorkspace((s) => s.addNote);
  const removeNote = useWorkspace((s) => s.removeNote);
  const team = new Map(plan.team.map((m) => [m.id, m.name]));
  const tasks = ins.timeline.ordered.filter((t) => owner === 'all' || (t.ownerId ?? 'none') === owner);
  const cols: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];
  const activity = plan.activity.filter((a) => actor === 'all' || a.actor === actor);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 26 }}>Team & Tasks</h2>
          <p>Who owns what, the decision log, and a full history of changes — including every co-pilot proposal you applied.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setMember({ id: uid('m'), name: '', role: '', responsibilities: '', email: '' })}
        >
          <Plus /> Add team member
        </button>
      </div>
      <Notice tone="info">
        Local workspace: team members are records in this plan, not user accounts. There is no multi-user sync in this build — share
        progress with exports or the client update.
      </Notice>

      <section className="card" aria-labelledby="team-h">
        <div className="card-head">
          <h3 id="team-h">Team</h3>
          <span className="small muted">{plan.team.length} people</span>
        </div>
        {plan.team.map((m) => {
          const mine = plan.tasks.filter((t) => t.ownerId === m.id && t.status !== 'done');
          const overdue = mine.filter((t) => ins.timeline.insights.get(t.id)?.overdue).length;
          const next = [...mine].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
          return (
            <div className="member-card" key={m.id}>
              <div className="avatar" aria-hidden="true">
                {initials(m.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="strong">{m.name}</div>
                <div className="small ink-2">
                  {m.role}
                  {m.responsibilities ? ` · ${m.responsibilities}` : ''}
                </div>
                <div className="row-wrap" style={{ marginTop: 6 }}>
                  <span className="badge badge-outline">{mine.length} open tasks</span>
                  {overdue > 0 && <span className="badge badge-danger">{overdue} overdue</span>}
                  {next && (
                    <span className="badge badge-outline">
                      Next: {next.title} · {formatDate(next.dueDate, { year: false })}
                    </span>
                  )}
                </div>
              </div>
              <div className="row">
                <button className="icon-btn" aria-label={`Edit ${m.name}`} onClick={() => setMember(m)}>
                  <Pencil />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Remove ${m.name}`}
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: `Remove ${m.name}?`,
                        body: 'Their tasks and run-of-show items become unassigned. You can undo this.',
                        confirmLabel: 'Remove',
                        danger: true,
                      })
                    )
                      removeMember(m.id);
                  }}
                >
                  <Trash2 />
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="board-h">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <h3 id="board-h">Task board</h3>
          <select
            className="select input-sm"
            aria-label="Filter by owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            style={{ width: 200 }}
          >
            <option value="all">Everyone</option>
            {plan.team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="none">Unassigned</option>
          </select>
        </div>
        <div className="kanban">
          {cols.map((c) => {
            const list = tasks.filter((t) => t.status === c);
            return (
              <div className="kanban-col" key={c}>
                <h4>
                  <span>{TASK_STATUS_LABEL[c]}</span>
                  <span className="muted num">{list.length}</span>
                </h4>
                {list.slice(0, c === 'done' ? 8 : 40).map((t) => {
                  const i = ins.timeline.insights.get(t.id)!;
                  return (
                    <div className="kanban-card" key={t.id}>
                      <div className="strong">{t.title}</div>
                      <div className="tiny muted" style={{ margin: '3px 0 6px' }}>
                        {t.ownerId ? team.get(t.ownerId) : 'Unassigned'} · due {formatDate(t.dueDate, { year: false })}
                        {i.overdue ? <span className="delta-up"> · overdue</span> : ''}
                      </div>
                      <select
                        className="select input-sm"
                        aria-label={`Status of ${t.title}`}
                        value={t.status}
                        onChange={(e) => setTaskStatus(t.id, e.target.value as TaskStatus)}
                        style={{ minHeight: 26, fontSize: 12 }}
                      >
                        {cols.map((s) => (
                          <option key={s} value={s}>
                            {TASK_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                {c === 'done' && list.length > 8 && <div className="tiny muted">+{list.length - 8} more completed</div>}
                {!list.length && <div className="tiny muted">Nothing here.</div>}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid-2">
        <section className="card" aria-labelledby="notes-h">
          <div className="card-head">
            <h3 id="notes-h">Notes & decisions</h3>
          </div>
          <form
            className="card-body stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.title.trim()) return toast('Give the note a title.', 'error');
              addNote({ ...note, title: note.title.trim() });
              setNote({ ...note, title: '', body: '' });
              toast(note.kind === 'decision' ? 'Decision logged.' : 'Note added.');
            }}
          >
            <div className="row-wrap">
              <select
                className="select input-sm"
                aria-label="Note type"
                value={note.kind}
                onChange={(e) => setNote({ ...note, kind: e.target.value as Note['kind'] })}
                style={{ width: 130 }}
              >
                <option value="decision">Decision</option>
                <option value="note">Note</option>
              </select>
              <select
                className="select input-sm"
                aria-label="Author"
                value={note.authorId ?? ''}
                onChange={(e) => setNote({ ...note, authorId: e.target.value || undefined })}
                style={{ width: 180 }}
              >
                {plan.team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <input
              className="input"
              placeholder="Title, e.g. Reception moves indoors if rain is forecast"
              aria-label="Note title"
              value={note.title}
              onChange={(e) => setNote({ ...note, title: e.target.value })}
            />
            <textarea
              className="textarea"
              placeholder="Context, who agreed, what changes"
              aria-label="Note details"
              value={note.body}
              onChange={(e) => setNote({ ...note, body: e.target.value })}
              rows={3}
            />
            <div>
              <button className="btn btn-sm btn-primary" type="submit">
                <Plus /> Add
              </button>
            </div>
          </form>
          <ul className="list card-body" style={{ paddingTop: 0 }}>
            {plan.notes.map((n) => (
              <li key={n.id}>
                <div className="row-between">
                  <div className="row-wrap">
                    <span className={`badge ${n.kind === 'decision' ? 'badge-gold' : 'badge-outline'}`}>{n.kind}</span>
                    <strong className="small">{n.title}</strong>
                  </div>
                  <button className="icon-btn" aria-label={`Delete ${n.title}`} onClick={() => removeNote(n.id)}>
                    <Trash2 />
                  </button>
                </div>
                {n.body && (
                  <div className="small ink-2" style={{ marginTop: 4 }}>
                    {n.body}
                  </div>
                )}
                <div className="tiny muted" style={{ marginTop: 3 }}>
                  {n.authorId ? (team.get(n.authorId) ?? 'Team') : 'Team'} · {formatDateTime(n.at)}
                </div>
              </li>
            ))}
            {!plan.notes.length && <li className="muted small">No notes yet.</li>}
          </ul>
        </section>

        <section className="card" aria-labelledby="act-h">
          <div className="card-head">
            <h3 id="act-h">Activity history</h3>
            <select
              className="select input-sm"
              aria-label="Filter activity"
              value={actor}
              onChange={(e) => setActor(e.target.value as Actor | 'all')}
              style={{ width: 150 }}
            >
              <option value="all">All activity</option>
              <option value="planner">Planner</option>
              <option value="copilot">Co-pilot</option>
              <option value="system">System</option>
            </select>
          </div>
          <ul className="activity card-body" tabIndex={0} aria-label="Activity history" style={{ maxHeight: 560, overflowY: 'auto' }}>
            {activity.slice(0, 120).map((a) => (
              <li key={a.id}>
                <span
                  className={`actor actor-${a.actor}`}
                  role="img"
                  aria-label={a.actor === 'copilot' ? 'Co-pilot' : a.actor === 'system' ? 'System' : 'Planner'}
                >
                  {a.actor === 'copilot' ? <Bot /> : a.actor === 'system' ? <Cog /> : <User />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="small">
                    <strong>{a.summary}</strong>
                  </div>
                  <div className="tiny muted">
                    {formatDateTime(a.at)} · {VIEW_LABELS[a.module as keyof typeof VIEW_LABELS] ?? a.module}
                  </div>
                  {a.details && a.details.length > 0 && (
                    <details className="tiny" style={{ marginTop: 3 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--ink-2)' }}>
                        {a.details.length} detail{a.details.length > 1 ? 's' : ''}
                      </summary>
                      <ul className="bullets">
                        {a.details.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </li>
            ))}
            {!activity.length && <li className="muted small">No activity yet.</li>}
          </ul>
        </section>
      </div>
      {member && <MemberModal plan={plan} member={member} onClose={() => setMember(null)} />}
    </div>
  );
}

function MemberModal({ plan, member, onClose }: { plan: EventPlan; member: TeamMember; onClose: () => void }) {
  const [m, setM] = useState(member);
  const [err, setErr] = useState('');
  const upsert = useWorkspace((s) => s.upsertMember);
  const isNew = !plan.team.some((x) => x.id === m.id);
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add team member' : `Edit ${member.name}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!m.name.trim()) return setErr('Name is required.');
              if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) return setErr('Email looks invalid.');
              upsert({ ...m, name: m.name.trim(), role: m.role.trim() || 'Team member' });
              toast('Team member saved.');
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name" htmlFor="m-n">
          <input id="m-n" className="input" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} data-autofocus />
        </Field>
        <Field label="Role" htmlFor="m-r">
          <input
            id="m-r"
            className="input"
            value={m.role}
            onChange={(e) => setM({ ...m, role: e.target.value })}
            placeholder="e.g. Vendor manager"
          />
        </Field>
        <Field label="Responsibilities" htmlFor="m-resp" className="span-2">
          <input
            id="m-resp"
            className="input"
            value={m.responsibilities}
            onChange={(e) => setM({ ...m, responsibilities: e.target.value })}
          />
        </Field>
        <Field label="Email (optional)" htmlFor="m-e" className="span-2">
          <input id="m-e" type="email" className="input" value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} />
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
