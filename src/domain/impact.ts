import { computeBudget } from './budget';
import { SETTING_LABEL, TASK_STATUS_LABEL, VENDOR_STATUS_LABEL } from './catalog';
import { analyzeRunOfShow } from './runOfShow';
import { analyzeTimeline } from './timeline';
import type { EventPlan, ISODate, ScheduleChangeReport } from './types';
import { formatDate } from './util';

export interface PlanImpact {
  budget: {
    forecastBefore: number;
    forecastAfter: number;
    plannedBefore: number;
    plannedAfter: number;
    remainingBefore: number;
    remainingAfter: number;
    perGuestBefore: number;
    perGuestAfter: number;
    committedBefore: number;
    committedAfter: number;
    ceilingBefore: number;
    ceilingAfter: number;
    categories: {
      key: string;
      label: string;
      plannedBefore: number;
      plannedAfter: number;
      forecastBefore: number;
      forecastAfter: number;
    }[];
  };
  timeline: {
    schedule?: ScheduleChangeReport;
    added: { title: string; due: ISODate }[];
    statusChanges: { title: string; from: string; to: string }[];
    newlyBlocked: string[];
    unblocked: string[];
    newlyAtRisk: string[];
  };
  vendors: { name: string; from: string; to: string }[];
  sessions: { name: string; change: string }[];
  runOfShow: { changed: string[]; issuesBefore: number; issuesAfter: number };
  brief: { field: string; from: string; to: string }[];
  isEmpty: boolean;
}

export function computeImpact(before: EventPlan, after: EventPlan, today: ISODate): PlanImpact {
  const b0 = computeBudget(before, today);
  const b1 = computeBudget(after, today);
  const lines0 = new Map(b0.lines.map((l) => [l.key, l]));
  const categories = b1.lines
    .map((l) => {
      const o = lines0.get(l.key);
      return {
        key: l.key,
        label: l.label,
        plannedBefore: o?.plannedTotal ?? 0,
        plannedAfter: l.plannedTotal,
        forecastBefore: o?.forecast ?? 0,
        forecastAfter: l.forecast,
      };
    })
    .filter(
      (c) => Math.round(c.plannedBefore) !== Math.round(c.plannedAfter) || Math.round(c.forecastBefore) !== Math.round(c.forecastAfter),
    );

  const t0 = analyzeTimeline(before, today);
  const t1 = analyzeTimeline(after, today);
  const oldTasks = new Map(before.tasks.map((t) => [t.id, t]));
  const added = after.tasks.filter((t) => !oldTasks.has(t.id)).map((t) => ({ title: t.title, due: t.dueDate }));
  const statusChanges = after.tasks
    .filter((t) => oldTasks.has(t.id) && oldTasks.get(t.id)!.status !== t.status)
    .map((t) => ({ title: t.title, from: TASK_STATUS_LABEL[oldTasks.get(t.id)!.status], to: TASK_STATUS_LABEL[t.status] }));
  const blocked = (a: ReturnType<typeof analyzeTimeline>) => new Set([...a.venueBlocked, ...a.vendorBlocked].map((t) => t.id));
  const bl0 = blocked(t0);
  const bl1 = blocked(t1);
  const titleOf = (id: string) => after.tasks.find((t) => t.id === id)?.title ?? before.tasks.find((t) => t.id === id)?.title ?? id;
  const newlyBlocked = [...bl1].filter((id) => !bl0.has(id)).map(titleOf);
  const unblocked = [...bl0].filter((id) => !bl1.has(id)).map(titleOf);
  const risk0 = new Set(t0.atRisk.map((t) => t.id));
  const newlyAtRisk = t1.atRisk.filter((t) => !risk0.has(t.id)).map((t) => t.title);

  const oldVendors = new Map(before.vendors.map((v) => [v.id, v]));
  const vendors = after.vendors
    .filter((v) => oldVendors.has(v.id) && (oldVendors.get(v.id)!.status !== v.status || oldVendors.get(v.id)!.preferred !== v.preferred))
    .map((v) => {
      const o = oldVendors.get(v.id)!;
      if (o.status !== v.status) return { name: v.name, from: VENDOR_STATUS_LABEL[o.status], to: VENDOR_STATUS_LABEL[v.status] };
      return { name: v.name, from: o.preferred ? 'Preferred' : 'Not preferred', to: v.preferred ? 'Preferred' : 'Not preferred' };
    });

  const oldSessions = new Map(before.brief.sessions.map((s) => [s.id, s]));
  const sessions = after.brief.sessions
    .filter((s) => oldSessions.has(s.id))
    .flatMap((s) => {
      const o = oldSessions.get(s.id)!;
      const out: { name: string; change: string }[] = [];
      if (o.setting !== s.setting) out.push({ name: s.name, change: `${SETTING_LABEL[o.setting]} → ${SETTING_LABEL[s.setting]}` });
      if (o.area !== s.area) out.push({ name: s.name, change: `Area “${o.area}” → “${s.area}”` });
      return out;
    });

  const oldRun = new Map(before.runOfShow.map((r) => [r.id, r]));
  const changedRun = after.runOfShow
    .filter((r) => oldRun.has(r.id) && JSON.stringify(oldRun.get(r.id)) !== JSON.stringify(r))
    .map((r) => r.title);

  const brief: PlanImpact['brief'] = [];
  const fields: [string, (p: EventPlan) => string][] = [
    ['Event date', (p) => formatDate(p.brief.eventDate)],
    ['Guest count', (p) => String(p.brief.guestCount)],
    ['Budget ceiling', (p) => String(p.brief.totalBudget)],
    ['Venue status', (p) => p.brief.venueStatus],
    ['Style', (p) => p.brief.style],
    ['Theme', (p) => p.brief.themeName],
    ['Atmosphere', (p) => p.brief.atmosphere],
    ['Weather notes', (p) => p.brief.weatherConcerns],
    ['Vegetarian share', (p) => `${p.brief.dietary.vegetarianPct}%`],
    ['Palette', (p) => p.brief.colors.join(' ')],
    ['Known risks', (p) => String(p.brief.knownRisks.length)],
  ];
  for (const [label, get] of fields) {
    const f = get(before);
    const t = get(after);
    if (f !== t) brief.push({ field: label, from: f, to: t });
  }

  const isEmpty =
    !categories.length &&
    !added.length &&
    !statusChanges.length &&
    !vendors.length &&
    !sessions.length &&
    !changedRun.length &&
    !brief.length &&
    b0.forecastTotal === b1.forecastTotal &&
    before.budget.contingencyPct === after.budget.contingencyPct &&
    before.notes.length === after.notes.length &&
    before.appliedThemeId === after.appliedThemeId &&
    JSON.stringify(before.budget.payments) === JSON.stringify(after.budget.payments);

  return {
    budget: {
      forecastBefore: b0.forecastTotal,
      forecastAfter: b1.forecastTotal,
      plannedBefore: b0.plannedTotal,
      plannedAfter: b1.plannedTotal,
      remainingBefore: b0.remaining,
      remainingAfter: b1.remaining,
      perGuestBefore: b0.costPerGuest,
      perGuestAfter: b1.costPerGuest,
      committedBefore: b0.committedTotal,
      committedAfter: b1.committedTotal,
      ceilingBefore: b0.ceiling,
      ceilingAfter: b1.ceiling,
      categories,
    },
    timeline: {
      schedule:
        after.lastScheduleChange &&
        after.lastScheduleChange !== before.lastScheduleChange &&
        after.brief.eventDate !== before.brief.eventDate
          ? after.lastScheduleChange
          : undefined,
      added,
      statusChanges,
      newlyBlocked,
      unblocked,
      newlyAtRisk,
    },
    vendors,
    sessions,
    runOfShow: { changed: changedRun, issuesBefore: analyzeRunOfShow(before).length, issuesAfter: analyzeRunOfShow(after).length },
    brief,
    isEmpty,
  };
}
