import { computeBudget, type BudgetSummary, BOOKED_STATUSES } from './budget';
import { categoryMeta } from './catalog';
import { summarizeGuests } from './guests';
import { analyzeRunOfShow, type RunIssue } from './runOfShow';
import { seasonOutlook } from './season';
import { analyzeTimeline, type TimelineAnalysis } from './timeline';
import type { EventPlan, ISODate, ViewKey } from './types';
import { formatMoneyCompact, plural } from './util';

export interface Risk {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  view: ViewKey;
  source: 'computed' | 'planner';
}

export interface Recommendation {
  id: string;
  title: string;
  why: string;
  view: ViewKey;
  score: number;
  cta: string;
}

export interface PlanInsights {
  budget: BudgetSummary;
  timeline: TimelineAnalysis;
  runIssues: RunIssue[];
  risks: Risk[];
  actions: Recommendation[];
}

export function computeInsights(plan: EventPlan, today: ISODate): PlanInsights {
  const budget = computeBudget(plan, today);
  const timeline = analyzeTimeline(plan, today);
  const runIssues = analyzeRunOfShow(plan);
  const guests = summarizeGuests(plan.guests);
  const cur = plan.brief.currency;
  const m = (n: number) => formatMoneyCompact(n, cur);
  const risks: Risk[] = [];
  const actions: Recommendation[] = [];

  // Venue
  const venueOpen = plan.brief.venueStatus === 'shortlisted' || plan.brief.venueStatus === 'searching';
  if (venueOpen) {
    const n = timeline.venueBlocked.length;
    const bookTask = plan.tasks.find((t) => t.vendorCategory === 'venue' && t.vendorRole === 'book' && t.status !== 'done');
    const due = bookTask ? timeline.insights.get(bookTask.id)?.daysUntilDue : undefined;
    risks.push({
      id: 'venue',
      severity: timeline.daysToEvent < 120 || (due !== undefined && due <= 7) ? 'high' : 'medium',
      title: plan.brief.venueStatus === 'searching' ? 'No venue secured yet' : 'Venue shortlisted but not contracted',
      detail: `${plural(n, 'task')} cannot be finalised until the venue is confirmed.`,
      view: 'vendors',
      source: 'computed',
    });
    actions.push({
      id: 'act-venue',
      title: bookTask ? bookTask.title : 'Confirm the venue',
      why: `Unblocks ${plural(n, 'dependent task')}${due !== undefined ? ` · due ${due < 0 ? `${-due} days ago` : due === 0 ? 'today' : `in ${due} days`}` : ''}.`,
      view: 'vendors',
      score: 90 + n + (due !== undefined && due <= 7 ? 20 : 0),
      cta: 'Review venues',
    });
  }

  // Budget
  if (budget.forecastTotal > budget.ceiling) {
    risks.push({
      id: 'over',
      severity: 'high',
      title: 'Forecast over budget',
      detail: `${m(budget.forecastTotal - budget.ceiling)} above the ${m(budget.ceiling)} ceiling.`,
      view: 'budget',
      source: 'computed',
    });
    actions.push({
      id: 'act-over',
      title: 'Bring the forecast back within budget',
      why: `Forecast is ${m(budget.forecastTotal - budget.ceiling)} over — compare scenarios or ask the co-pilot to rebalance.`,
      view: 'budget',
      score: 95,
      cta: 'Open Budget Lab',
    });
  }
  const overLines = budget.lines
    .filter((l) => l.variance > 0 && l.variancePct >= 3 && l.plannedTotal > 0)
    .sort((a, b) => b.variance - a.variance);
  if (overLines.length) {
    const top = overLines[0];
    risks.push({
      id: 'variance',
      severity: top.variancePct >= 10 ? 'high' : 'medium',
      title: `${top.label} over allocation`,
      detail: `${m(top.variance)} (${top.variancePct.toFixed(1)}%) above plan${overLines.length > 1 ? `; ${overLines.length - 1} more categor${overLines.length > 2 ? 'ies' : 'y'} also over` : ''}.`,
      view: 'budget',
      source: 'computed',
    });
    if (budget.forecastTotal <= budget.ceiling) {
      actions.push({
        id: 'act-var',
        title: `Rebalance ${top.label.toLowerCase()} overspend`,
        why: `${m(top.variance)} above its allocation; ${m(budget.remaining)} headroom left overall.`,
        view: 'budget',
        score: 55 + Math.min(30, top.variancePct),
        cta: 'Open Budget Lab',
      });
    }
  }
  if (budget.contingencyPct < 5) {
    risks.push({
      id: 'contingency',
      severity: 'low',
      title: 'Thin contingency',
      detail: `${budget.contingencyPct}% reserve; 5–10% is typical.`,
      view: 'budget',
      source: 'computed',
    });
  }
  const overduePay = budget.upcomingPayments.filter((p) => p.overdue);
  const soonPay = budget.upcomingPayments.filter((p) => !p.overdue && p.daysUntil <= 14);
  if (overduePay.length) {
    risks.push({
      id: 'pay-overdue',
      severity: 'high',
      title: 'Overdue vendor payment',
      detail: overduePay.map((p) => `${p.label} · ${p.vendorName}`).join('; '),
      view: 'budget',
      source: 'computed',
    });
    actions.push({
      id: 'act-pay',
      title: `Settle ${overduePay[0].label.toLowerCase()} for ${overduePay[0].vendorName}`,
      why: `${m(overduePay[0].amount)} is ${-overduePay[0].daysUntil} days overdue.`,
      view: 'budget',
      score: 88,
      cta: 'Open payments',
    });
  } else if (soonPay.length) {
    actions.push({
      id: 'act-pay-soon',
      title: `Prepare ${soonPay[0].label.toLowerCase()} for ${soonPay[0].vendorName}`,
      why: `${m(soonPay[0].amount)} due in ${soonPay[0].daysUntil} days.`,
      view: 'budget',
      score: 40,
      cta: 'Open payments',
    });
  }
  if (budget.scheduleGaps.length) {
    risks.push({
      id: 'gaps',
      severity: 'medium',
      title: 'Payment schedules out of step with contracts',
      detail: `${plural(budget.scheduleGaps.length, 'booked vendor')} — usually after a guest-count or quote change.`,
      view: 'budget',
      source: 'computed',
    });
  }

  // Timeline
  if (timeline.overdue.length) {
    const worst = [...timeline.overdue].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const dependents = plan.tasks.filter((t) => t.dependsOn.includes(worst.id) && t.status !== 'done').length;
    risks.push({
      id: 'overdue',
      severity: timeline.overdue.length > 2 ? 'high' : 'medium',
      title: `${plural(timeline.overdue.length, 'overdue task')}`,
      detail: timeline.overdue
        .slice(0, 3)
        .map((t) => t.title)
        .join('; '),
      view: 'timeline',
      source: 'computed',
    });
    actions.push({
      id: `act-overdue-${worst.id}`,
      title: worst.title,
      why: `${-timeline.insights.get(worst.id)!.daysUntilDue} days overdue${dependents ? ` · ${plural(dependents, 'task')} wait on it` : ''}.`,
      view: 'timeline',
      score: 80 + dependents * 3 + (worst.priority === 'high' ? 8 : 0),
      cta: 'Open timeline',
    });
  }
  const atRisk = timeline.atRisk.filter((t) => !timeline.insights.get(t.id)!.overdue);
  if (atRisk.length) {
    risks.push({
      id: 'atrisk',
      severity: 'medium',
      title: `${plural(atRisk.length, 'task')} at risk of missing deadlines`,
      detail: 'Dependency chains leave no time to finish before the due date.',
      view: 'timeline',
      source: 'computed',
    });
  }
  const dueSoon = timeline.dueThisWeek.filter((t) => t.priority === 'high' && !timeline.insights.get(t.id)!.venueBlocked);
  for (const t of dueSoon.slice(0, 2)) {
    const d = timeline.insights.get(t.id)!.daysUntilDue;
    actions.push({
      id: `act-soon-${t.id}`,
      title: t.title,
      why: `High priority · due ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}.`,
      view: 'timeline',
      score: 60 - d,
      cta: 'Open timeline',
    });
  }
  if (timeline.vendorBlocked.length) {
    const cats = [...new Set(timeline.vendorBlocked.map((t) => t.vendorCategory!))];
    risks.push({
      id: 'vendor-blocked',
      severity: 'medium',
      title: `Waiting on ${cats.map((c) => categoryMeta(c)?.label.toLowerCase() ?? c).join(', ')} booking`,
      detail: `${plural(timeline.vendorBlocked.length, 'task')} need a booked vendor first.`,
      view: 'vendors',
      source: 'computed',
    });
  }

  // Vendors
  const cancelled = plan.vendors.filter((v) => v.status === 'cancelled');
  for (const v of cancelled) {
    const rebooked = plan.vendors.some((o) => o.category === v.category && BOOKED_STATUSES.has(o.status));
    if (!rebooked) {
      risks.push({
        id: `cancel-${v.id}`,
        severity: 'high',
        title: `${categoryMeta(v.category)?.label ?? v.category} vendor cancelled`,
        detail: `${v.name} cancelled; no replacement booked yet.`,
        view: 'vendors',
        source: 'computed',
      });
      actions.push({
        id: `act-cancel-${v.id}`,
        title: `Book a replacement ${categoryMeta(v.category)?.vendorLabel.toLowerCase().replace(/s$/, '') ?? 'vendor'}`,
        why: `${v.name} cancelled — dependent tasks are on hold.`,
        view: 'vendors',
        score: 92,
        cta: 'Open Vendor Hub',
      });
    }
  }

  // Run of show
  const runErrors = runIssues.filter((i) => i.severity !== 'info');
  if (runErrors.length) {
    risks.push({
      id: 'ros',
      severity: runIssues.some((i) => i.severity === 'error') ? 'high' : 'medium',
      title: `${plural(runErrors.length, 'run-of-show issue')}`,
      detail: runErrors
        .slice(0, 2)
        .map((i) => i.message)
        .join(' '),
      view: 'runofshow',
      source: 'computed',
    });
    actions.push({
      id: 'act-ros',
      title: 'Resolve run-of-show conflicts',
      why: runErrors[0].message,
      view: 'runofshow',
      score: 35 + runErrors.length * 4 - Math.min(30, Math.max(0, timeline.daysToEvent - 30) / 4),
      cta: 'Open Run of Show',
    });
  }

  // Guests
  if (plan.guests.length) {
    const delta = guests.projected - plan.brief.guestCount;
    if (Math.abs(delta) / Math.max(1, plan.brief.guestCount) >= 0.08) {
      risks.push({
        id: 'headcount',
        severity: 'low',
        title: delta > 0 ? 'Projected attendance above plan' : 'Projected attendance below plan',
        detail: `RSVPs project ~${guests.projected} guests vs ${plan.brief.guestCount} budgeted (${delta > 0 ? '+' : ''}${delta}).`,
        view: 'guests',
        source: 'computed',
      });
    }
    if (guests.pending > 0 && timeline.daysToEvent <= 45) {
      actions.push({
        id: 'act-rsvp',
        title: 'Chase outstanding RSVPs',
        why: `${guests.pending} guests have not replied with ${timeline.daysToEvent} days to go.`,
        view: 'guests',
        score: 45,
        cta: 'Open Guest Operations',
      });
    }
  }

  // Weather
  const outlook = seasonOutlook(plan.brief.city, plan.brief.country, plan.brief.eventDate);
  const openAir = plan.brief.sessions.filter((s) => s.setting === 'outdoor');
  if (openAir.length && (outlook.monsoon || outlook.heatRisk === 'high' || outlook.coldEvenings)) {
    risks.push({
      id: 'weather',
      severity: outlook.monsoon ? 'high' : 'low',
      title: outlook.monsoon
        ? 'Open-air sessions in monsoon season'
        : outlook.heatRisk === 'high'
          ? 'Open-air sessions in hot season'
          : 'Cold evenings for open-air sessions',
      detail: `${openAir.map((s) => s.name).join(', ')} — ${outlook.notes[0]}`,
      view: 'brief',
      source: 'computed',
    });
  }

  for (const [i, r] of plan.brief.knownRisks.entries()) {
    risks.push({
      id: `planner-${i}`,
      severity: 'medium',
      title: r,
      detail: 'Flagged in the event brief.',
      view: 'brief',
      source: 'planner',
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => order[a.severity] - order[b.severity] || (a.source === 'computed' ? -1 : 1));
  const seen = new Set<string>();
  const ranked = actions
    .sort((a, b) => b.score - a.score)
    .filter((a) => {
      const k = a.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  if (ranked.length < 3) {
    const next = timeline.ordered.filter((t) => t.status !== 'done' && !ranked.some((r) => r.title === t.title));
    for (const t of next.slice(0, 3 - ranked.length)) {
      const d = timeline.insights.get(t.id)!.daysUntilDue;
      ranked.push({
        id: `act-next-${t.id}`,
        title: t.title,
        why: `Next on the timeline · due ${d <= 0 ? 'now' : `in ${d} days`}.`,
        view: 'timeline',
        score: 10,
        cta: 'Open timeline',
      });
    }
  }
  return { budget, timeline, runIssues, risks, actions: ranked.slice(0, 3) };
}

// Plans are immutable snapshots (every edit produces a new object), so the
// derived insights can be cached per plan version and shared by every view and
// row that asks for them instead of being recomputed per component.
const insightsCache = new WeakMap<EventPlan, { today: ISODate; value: PlanInsights }>();

export function getInsights(plan: EventPlan, today: ISODate): PlanInsights {
  const hit = insightsCache.get(plan);
  if (hit && hit.today === today) return hit.value;
  const value = computeInsights(plan, today);
  insightsCache.set(plan, { today, value });
  return value;
}
