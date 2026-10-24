import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, Cloud, Copy, Pencil, Send, Sparkles, Undo2, X, XCircle, AlertTriangle } from 'lucide-react';
import { SUGGESTED_PROMPTS } from '../copilot/engine';
import { askCopilot } from '../copilot/provider';
import type { CopilotMessage, InsightBlock } from '../copilot/types';
import type { PlanOp } from '../domain/ops';
import { validateOps } from '../domain/ops';
import type { EventPlan } from '../domain/types';
import { uid } from '../domain/util';
import { copyText } from '../lib/download';
import { useWorkspace } from '../store/workspace';
import { toast } from '../ui/kit';
import { useToday, useUI } from './common';
import { ProposalPreview } from './ProposalPreview';

const EMPTY: CopilotMessage[] = [];

export function CopilotPanel({ plan }: { plan: EventPlan }) {
  const open = useUI((s) => s.copilotOpen);
  const close = useUI((s) => s.closeCopilot);
  const draft = useUI((s) => s.copilotDraft);
  const setDraft = useUI((s) => s.setDraft);
  const status = useUI((s) => s.copilotStatus);
  const messages = useWorkspace((s) => s.copilot[plan.id] ?? EMPTY);
  const append = useWorkspace((s) => s.appendCopilot);
  const today = useToday();
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.overlay') && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft('');
    append(plan.id, { id: uid('msg'), role: 'user', at: new Date().toISOString(), text: t });
    setBusy(true);
    try {
      const live = useWorkspace.getState().events[plan.id] ?? plan;
      const reply = await askCopilot(t, live, today, useWorkspace.getState().copilot[plan.id] ?? [], status);
      append(plan.id, {
        id: uid('msg'),
        role: 'assistant',
        at: new Date().toISOString(),
        text: reply.text,
        reply,
        proposalState: reply.proposal ? 'pending' : undefined,
      });
    } catch (e) {
      append(plan.id, {
        id: uid('msg'),
        role: 'assistant',
        at: new Date().toISOString(),
        text: `Something went wrong: ${(e as Error).message}. No changes were made.`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="copilot" role="dialog" aria-modal="false" aria-label="Event co-pilot">
      <div className="copilot-head">
        <Sparkles style={{ width: 20, height: 20, color: 'var(--gold-strong)', marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 18 }}>Event co-pilot</h2>
          <div className="small muted">Works on the live plan. Changes are proposals you preview, edit, apply or reject.</div>
          <div style={{ marginTop: 6 }}>
            {status.available ? (
              <span className="badge badge-ok">
                <Cloud /> Claude · {status.model}
              </span>
            ) : (
              <span
                className="badge badge-outline"
                title="No model API key is configured on the server, so answers come from Sutrā's deterministic planning rules. Nothing is sent to an AI provider."
              >
                <Bot /> Built-in planning assistant · rule-based
              </span>
            )}
          </div>
        </div>
        <button className="icon-btn" aria-label="Close co-pilot" onClick={close}>
          <X />
        </button>
      </div>

      <div className="copilot-body" ref={bodyRef} aria-live="polite">
        {!messages.length && (
          <div className="stack">
            <p className="small ink-2">Ask about this plan in plain language. Try one of these:</p>
            <div className="suggestions">
              {SUGGESTED_PROMPTS.map((p) => (
                <button key={p.label} className="chip" onClick={() => send(p.request)}>
                  {p.label}
                </button>
              ))}
            </div>
            {!status.available && (
              <p className="tiny muted">
                Demo mode: the assistant uses built-in planning rules over your live data. Configure <code>ANTHROPIC_API_KEY</code> on the
                server to enable Claude; proposals are validated the same way either way.
              </p>
            )}
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div className="msg-user" key={m.id}>
              {m.text}
            </div>
          ) : (
            <AssistantMessage key={m.id} plan={plan} msg={m} onAsk={send} />
          ),
        )}
        {busy && (
          <div className="msg-bot">
            <div className="bubble small muted">Working on it…</div>
          </div>
        )}
      </div>

      <form
        className="copilot-foot"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <div className="copilot-input">
          <label className="sr-only" htmlFor="copilot-input">
            Ask the co-pilot
          </label>
          <textarea
            id="copilot-input"
            ref={inputRef}
            className="textarea"
            rows={2}
            placeholder="e.g. Our decorator cancelled. What does this affect?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            disabled={busy}
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !draft.trim()} aria-label="Send">
            <Send />
          </button>
        </div>
        {messages.length > 0 && (
          <div className="suggestions" style={{ marginTop: 8 }}>
            {SUGGESTED_PROMPTS.slice(0, 5).map((p) => (
              <button
                type="button"
                key={p.label}
                className="chip"
                style={{ fontSize: 11.5, padding: '2px 8px' }}
                onClick={() => send(p.request)}
                disabled={busy}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </form>
    </aside>
  );
}

function Blocks({ blocks }: { blocks: InsightBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'list')
          return (
            <div key={i}>
              {b.title && <div className="mini-h">{b.title}</div>}
              <ul className="bullets small">
                {b.items.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            </div>
          );
        if (b.kind === 'table')
          return (
            <div key={i}>
              {b.title && <div className="mini-h">{b.title}</div>}
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
                <table className="table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      {b.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k} style={{ minWidth: k === 0 ? 120 : 80 }}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        return (
          <div key={i}>
            <div className="row-between">
              {b.title && <div className="mini-h">{b.title}</div>}
              {b.copyable && (
                <button
                  className="btn btn-xs"
                  onClick={async () => toast((await copyText(b.body)) ? 'Copied to clipboard.' : 'Copy failed.', 'info')}
                >
                  <Copy /> Copy
                </button>
              )}
            </div>
            <pre
              className="small"
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--sans)',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: 10,
                margin: 0,
              }}
            >
              {b.body}
            </pre>
          </div>
        );
      })}
    </>
  );
}

function AssistantMessage({ plan, msg, onAsk }: { plan: EventPlan; msg: CopilotMessage; onAsk: (t: string) => void }) {
  const r = msg.reply;
  return (
    <div className="msg-bot">
      <div className="bubble">
        {r?.notice && (
          <div className="notice notice-warn" style={{ marginBottom: 8 }}>
            <AlertTriangle />
            <div>{r.notice}</div>
          </div>
        )}
        <div>{msg.text}</div>
        {r && <Blocks blocks={r.blocks} />}
        {r?.proposal && <ProposalCard plan={plan} msg={msg} />}
        {r && r.followUps.length > 0 && (
          <div className="suggestions" style={{ marginTop: 10 }}>
            {r.followUps.map((f) => (
              <button key={f.label} className="chip" onClick={() => onAsk(f.request)}>
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="msg-source">
        {r?.source === 'model' ? (
          <>
            <Cloud style={{ width: 12, height: 12 }} /> Claude
          </>
        ) : (
          <>
            <Bot style={{ width: 12, height: 12 }} /> Built-in planning assistant
          </>
        )}
      </div>
    </div>
  );
}

function ProposalCard({ plan, msg }: { plan: EventPlan; msg: CopilotMessage }) {
  const proposal = msg.reply!.proposal!;
  const today = useToday();
  const [editing, setEditing] = useState(false);
  const [ops, setOps] = useState<PlanOp[]>(proposal.ops);
  const [enabled, setEnabled] = useState<boolean[]>(() => proposal.ops.map(() => true));
  const applyProposal = useWorkspace((s) => s.applyProposal);
  const setState = useWorkspace((s) => s.setProposalState);
  const undo = useWorkspace((s) => s.undo);
  const undoLast = useWorkspace((s) => s.undoLast);
  const active = useMemo(() => ops.filter((_, i) => enabled[i]), [ops, enabled]);
  const errors = useMemo(() => validateOps(plan, active, today), [plan, active, today]);
  const state = msg.proposalState ?? 'pending';
  const canUndo = state === 'applied' && undo[0]?.label === proposal.title && undo[0]?.eventId === plan.id;

  return (
    <div className="proposal" aria-label={`Proposal: ${proposal.title}`}>
      <div className="proposal-head">
        <div className="eyebrow" style={{ color: 'var(--gold-strong)' }}>
          Proposed change
        </div>
        <div className="strong" style={{ marginTop: 2 }}>
          {proposal.title}
        </div>
        {proposal.summary && <div className="small ink-2">{proposal.summary}</div>}
      </div>
      <div className="proposal-body">
        <div className="mini-h" style={{ marginTop: 0 }}>
          Why
        </div>
        <div className="small">{proposal.reason}</div>
        {state === 'pending' ? (
          <ProposalPreview
            plan={plan}
            ops={ops}
            enabled={enabled}
            editing={editing}
            onToggle={(i) => setEnabled((e) => e.map((x, j) => (j === i ? !x : x)))}
            onEdit={(i, op) => setOps((o) => o.map((x, j) => (j === i ? op : x)))}
          />
        ) : null}
        {proposal.tradeoffs.length > 0 && (
          <>
            <div className="mini-h">Trade-offs</div>
            <ul className="bullets small">
              {proposal.tradeoffs.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
        {proposal.assumptions.length > 0 && (
          <>
            <div className="mini-h">Assumptions & unresolved questions</div>
            <ul className="bullets small">
              {proposal.assumptions.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="proposal-foot">
        {state === 'pending' && (
          <>
            <button
              className="btn btn-sm btn-primary"
              disabled={!active.length || errors.length > 0}
              onClick={() => {
                const log = applyProposal(proposal, active, 'copilot', 'overview');
                setState(plan.id, msg.id, 'applied');
                toast(`Applied: ${proposal.title}${log.length ? ` · ${log.length} follow-on updates` : ''}.`, 'success');
              }}
            >
              <Check /> Apply{active.length !== ops.length ? ` ${active.length} of ${ops.length}` : ''}
            </button>
            <button className="btn btn-sm" onClick={() => setEditing((e) => !e)}>
              <Pencil /> {editing ? 'Done editing' : 'Edit'}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setState(plan.id, msg.id, 'rejected');
                toast('Proposal rejected — nothing changed.', 'info');
              }}
            >
              <XCircle /> Reject
            </button>
          </>
        )}
        {state === 'applied' && (
          <>
            <span className="badge badge-ok">
              <Check /> Applied to the plan
            </span>
            {canUndo && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  undoLast();
                  setState(plan.id, msg.id, 'pending');
                  toast('Change undone.', 'info');
                }}
              >
                <Undo2 /> Undo
              </button>
            )}
          </>
        )}
        {state === 'rejected' && (
          <span className="badge">
            <XCircle /> Rejected — no changes made
          </span>
        )}
      </div>
    </div>
  );
}
