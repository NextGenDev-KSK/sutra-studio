import { computeBudget, quoteTotal } from '../domain/budget';
import { summarizeGuests } from '../domain/guests';
import { computeInsights } from '../domain/insights';
import { makeProposal, validateOps, type PlanOp } from '../domain/ops';
import type { EventPlan, ISODate } from '../domain/types';
import { respond } from './engine';
import { fromFlatOp, ModelResponseSchema } from './modelSchema';
import type { CopilotMessage, CopilotReply } from './types';

export interface CopilotStatus {
  available: boolean;
  model?: string;
  checked: boolean;
}

export async function fetchCopilotStatus(timeoutMs = 2500): Promise<CopilotStatus> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch('./api/copilot/status', { signal: ctrl.signal, headers: { accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return { available: false, checked: true };
    const data = (await res.json()) as { available?: boolean; model?: string };
    return { available: !!data.available, model: data.model, checked: true };
  } catch {
    return { available: false, checked: true };
  }
}

/**
 * Compact, privacy-preserving plan context for the model: no guest names or
 * contact details — only aggregate guest figures.
 */
export function buildModelContext(plan: EventPlan, today: ISODate) {
  const b = computeBudget(plan, today);
  const ins = computeInsights(plan, today);
  const g = summarizeGuests(plan.guests);
  const t = ins.timeline;
  return {
    today,
    event: {
      name: plan.brief.name,
      type: plan.brief.type,
      city: plan.brief.city,
      country: plan.brief.country,
      date: plan.brief.eventDate,
      durationDays: plan.brief.durationDays,
      guestCount: plan.brief.guestCount,
      venueStatus: plan.brief.venueStatus,
      style: plan.brief.style,
      setting: plan.brief.setting,
      culturalPreferences: plan.brief.culturalPreferences || '(none provided — do not assume any)',
      dietary: plan.brief.dietarySpecified ? plan.brief.dietary : '(not specified)',
      accessibility: plan.brief.accessibility,
      protectedCategories: plan.brief.protectedCategories,
      knownRisks: plan.brief.knownRisks,
    },
    sessions: plan.brief.sessions.map((s) => ({
      id: s.id,
      name: s.name,
      day: s.dayIndex + 1,
      start: s.start,
      end: s.end,
      setting: s.setting,
      area: s.area,
    })),
    budget: {
      currency: b.currency,
      ceiling: b.ceiling,
      contingencyPct: b.contingencyPct,
      plannedTotal: Math.round(b.plannedTotal),
      forecastTotal: Math.round(b.forecastTotal),
      remaining: Math.round(b.remaining),
      marginalGuestCost: Math.round(b.marginalGuestCost),
      categories: b.lines.map((l) => ({
        key: l.key,
        label: l.label,
        basis: l.basis,
        planned: l.planned,
        units: l.units,
        plannedTotal: Math.round(l.plannedTotal),
        forecast: Math.round(l.forecast),
        source: l.source,
        committed: Math.round(l.committed),
      })),
      upcomingPayments: b.upcomingPayments
        .slice(0, 10)
        .map((p) => ({ label: p.label, vendor: p.vendorName, amount: p.amount, due: p.dueDate })),
    },
    vendors: plan.vendors.map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      status: v.status,
      preferred: v.preferred,
      quoteTotal: v.quote ? Math.round(quoteTotal(v.quote, plan.brief.guestCount)) : null,
      deliverables: v.quote?.deliverables ?? '',
      pros: v.pros,
      cons: v.cons,
      verification: v.verification.level,
    })),
    tasks: t.ordered
      .filter((x) => x.status !== 'done')
      .slice(0, 60)
      .map((x) => ({
        id: x.id,
        title: x.title,
        due: x.dueDate,
        status: x.status,
        workstream: x.workstream,
        dependsOn: x.dependsOn,
        flags: t.insights.get(x.id)?.flags ?? [],
      })),
    completedTasks: t.done,
    runOfShow: plan.runOfShow.map((r) => ({
      id: r.id,
      day: r.dayIndex + 1,
      start: r.start,
      end: r.end,
      title: r.title,
      location: r.location,
      vendorIds: r.vendorIds,
    })),
    risks: ins.risks.slice(0, 10).map((r) => `${r.severity}: ${r.title} — ${r.detail}`),
    guests: { invited: g.invited, confirmed: g.confirmed, pending: g.pending, declined: g.declined, projected: g.projected },
  };
}

function convertModelReply(raw: unknown, plan: EventPlan, today: ISODate): { reply?: CopilotReply; problem?: string } {
  const parsed = ModelResponseSchema.safeParse(raw);
  if (!parsed.success) return { problem: 'the response did not match the expected structure' };
  const data = parsed.data;
  const base: CopilotReply = {
    text: data.reply,
    blocks: data.insights.length ? [{ kind: 'list', items: data.insights }] : [],
    followUps: [],
    source: 'model',
  };
  if (!data.proposal || !data.proposal.ops.length) return { reply: base };
  const ops: PlanOp[] = [];
  const problems: string[] = [];
  for (const f of data.proposal.ops) {
    const { op, error } = fromFlatOp(f);
    if (op) ops.push(op);
    else problems.push(error ?? 'invalid change');
  }
  problems.push(...validateOps(plan, ops, today));
  if (problems.length) return { problem: `its proposed changes failed validation (${problems.slice(0, 2).join('; ')})` };
  return {
    reply: {
      ...base,
      proposal: makeProposal({
        title: data.proposal.title,
        summary: data.proposal.summary,
        reason: data.proposal.reason,
        ops,
        tradeoffs: data.proposal.tradeoffs,
        assumptions: data.proposal.assumptions,
      }),
    },
  };
}

export async function askCopilot(
  request: string,
  plan: EventPlan,
  today: ISODate,
  history: CopilotMessage[],
  status: CopilotStatus,
): Promise<CopilotReply> {
  if (!status.available) return respond(request, plan, today);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    const res = await fetch('./api/copilot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        request,
        context: buildModelContext(plan, today),
        history: history.slice(-6).map((m) => ({ role: m.role, text: m.text.slice(0, 1500) })),
      }),
    });
    clearTimeout(timer);
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok || !data) throw new Error(data?.error ?? `HTTP ${res.status}`);
    const { reply, problem } = convertModelReply(data, plan, today);
    if (reply) return reply;
    const fallback = respond(request, plan, today);
    return {
      ...fallback,
      notice: `Claude replied, but ${problem}. Nothing was applied — this answer comes from the built-in planning assistant instead.`,
    };
  } catch (e) {
    const reason =
      e instanceof DOMException && e.name === 'AbortError' ? 'the request timed out' : (e as Error).message || 'the request failed';
    const fallback = respond(request, plan, today);
    return { ...fallback, notice: `Couldn't reach Claude (${reason}). This answer comes from the built-in planning assistant.` };
  }
}
