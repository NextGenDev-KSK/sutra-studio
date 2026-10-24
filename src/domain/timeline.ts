import { BOOKED_STATUSES } from './budget';
import { WORKSTREAMS } from './catalog';
import type { EventPlan, ID, ISODate, ScheduleChangeReport, Task, Workstream } from './types';
import { addDays, diffDays, maxDate } from './util';

export interface TaskInsight {
  task: Task;
  overdue: boolean;
  daysUntilDue: number;
  earliestFinish: ISODate;
  slackDays: number;
  atRisk: boolean;
  critical: boolean;
  blockedBy: Task[];
  venueBlocked: boolean;
  vendorBlocked: boolean;
  dependencyConflicts: Task[];
  inCycle: boolean;
  flags: string[];
}

export interface WorkstreamProgress {
  workstream: Workstream;
  label: string;
  done: number;
  total: number;
  pct: number;
  overdue: number;
}

export interface TimelineAnalysis {
  insights: Map<ID, TaskInsight>;
  ordered: Task[];
  overdue: Task[];
  critical: Task[];
  atRisk: Task[];
  venueBlocked: Task[];
  vendorBlocked: Task[];
  dueThisWeek: Task[];
  upcomingMilestones: Task[];
  done: number;
  total: number;
  pct: number;
  byWorkstream: WorkstreamProgress[];
  daysToEvent: number;
  cycles: ID[];
}

function remainingDuration(t: Task): number {
  const d = Math.max(0, Math.round(t.durationDays));
  if (t.status === 'in_progress') return Math.ceil(d / 2);
  return d;
}

export function analyzeTimeline(plan: EventPlan, today: ISODate): TimelineAnalysis {
  const tasks = plan.tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ef = new Map<ID, ISODate>();
  const visiting = new Set<ID>();
  const cycles = new Set<ID>();

  const finish = (t: Task): ISODate => {
    const cached = ef.get(t.id);
    if (cached) return cached;
    if (t.status === 'done') {
      const done = t.completedOn ?? t.dueDate;
      ef.set(t.id, done);
      return done;
    }
    if (visiting.has(t.id)) {
      cycles.add(t.id);
      return today;
    }
    visiting.add(t.id);
    let start = today;
    for (const depId of t.dependsOn) {
      const dep = byId.get(depId);
      if (dep) start = maxDate(start, finish(dep));
    }
    visiting.delete(t.id);
    const result = addDays(start, remainingDuration(t));
    ef.set(t.id, result);
    return result;
  };

  const venueOpen = plan.brief.venueStatus === 'shortlisted' || plan.brief.venueStatus === 'searching';
  const bookedCategories = new Set(plan.vendors.filter((v) => BOOKED_STATUSES.has(v.status)).map((v) => v.category));

  const insights = new Map<ID, TaskInsight>();
  for (const t of tasks) {
    const earliestFinish = finish(t);
    const done = t.status === 'done';
    const daysUntilDue = diffDays(today, t.dueDate);
    const slackDays = done ? 0 : diffDays(earliestFinish, t.dueDate);
    const overdue = !done && daysUntilDue < 0;
    const blockedBy = t.dependsOn.map((id) => byId.get(id)).filter((d): d is Task => !!d && d.status !== 'done');
    const venueBlocked = !done && t.requiresVenue && venueOpen;
    const vendorBlocked = !done && t.vendorRole === 'requires' && !!t.vendorCategory && !bookedCategories.has(t.vendorCategory);
    const dependencyConflicts = done
      ? []
      : t.dependsOn.map((id) => byId.get(id)).filter((d): d is Task => !!d && d.status !== 'done' && d.dueDate > t.dueDate);
    const atRisk = !done && slackDays < 0;
    const critical = !done && slackDays <= 2;
    const flags: string[] = [];
    if (overdue) flags.push(`${-daysUntilDue} days overdue`);
    else if (atRisk) flags.push(`Cannot finish by due date (short by ${-slackDays} days)`);
    if (venueBlocked) flags.push('Waiting on venue confirmation');
    if (vendorBlocked) flags.push('Needs a booked vendor');
    if (blockedBy.length) flags.push(`Waiting on ${blockedBy.length} task${blockedBy.length > 1 ? 's' : ''}`);
    if (dependencyConflicts.length) flags.push('Due before a task it depends on');
    if (cycles.has(t.id)) flags.push('Circular dependency');
    insights.set(t.id, {
      task: t,
      overdue,
      daysUntilDue,
      earliestFinish,
      slackDays,
      atRisk,
      critical,
      blockedBy,
      venueBlocked,
      vendorBlocked,
      dependencyConflicts,
      inCycle: cycles.has(t.id),
      flags,
    });
  }

  const ordered = [...tasks].sort((a, b) => (a.dueDate === b.dueDate ? a.title.localeCompare(b.title) : a.dueDate < b.dueDate ? -1 : 1));
  const open = ordered.filter((t) => t.status !== 'done');
  const done = tasks.length - open.length;
  const byWorkstream: WorkstreamProgress[] = WORKSTREAMS.map((w) => {
    const list = tasks.filter((t) => t.workstream === w.key);
    const d = list.filter((t) => t.status === 'done').length;
    return {
      workstream: w.key,
      label: w.label,
      done: d,
      total: list.length,
      pct: list.length ? Math.round((d / list.length) * 100) : 0,
      overdue: list.filter((t) => insights.get(t.id)?.overdue).length,
    };
  }).filter((w) => w.total > 0);

  return {
    insights,
    ordered,
    overdue: open.filter((t) => insights.get(t.id)!.overdue),
    critical: open.filter((t) => insights.get(t.id)!.critical),
    atRisk: open.filter((t) => insights.get(t.id)!.atRisk),
    venueBlocked: open.filter((t) => insights.get(t.id)!.venueBlocked),
    vendorBlocked: open.filter((t) => insights.get(t.id)!.vendorBlocked),
    dueThisWeek: open.filter((t) => {
      const d = insights.get(t.id)!.daysUntilDue;
      return d >= 0 && d <= 7;
    }),
    upcomingMilestones: open.filter((t) => t.milestone),
    done,
    total: tasks.length,
    pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    byWorkstream,
    daysToEvent: diffDays(today, plan.brief.eventDate),
    cycles: [...cycles],
  };
}

/** Would making `taskId` depend on `depId` create a cycle? */
export function wouldCreateCycle(tasks: Task[], taskId: ID, depId: ID): boolean {
  if (taskId === depId) return true;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const stack = [depId];
  const seen = new Set<ID>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const d of byId.get(cur)?.dependsOn ?? []) stack.push(d);
  }
  return false;
}

/**
 * Move every relative task with the event date. Completed work and pinned
 * (manually dated) tasks are never changed; conflicts are reported instead.
 */
export function rescheduleForEventDate(
  plan: EventPlan,
  newDate: ISODate,
  today: ISODate,
  now: string = new Date().toISOString(),
): { tasks: Task[]; report: ScheduleChangeReport } {
  const oldDate = plan.brief.eventDate;
  const report: ScheduleChangeReport = {
    at: now,
    oldDate,
    newDate,
    deltaDays: diffDays(oldDate, newDate),
    moved: [],
    compressed: [],
    preserved: [],
    pinned: [],
    conflicts: [],
    paymentsAfterEvent: [],
  };
  const tasks = plan.tasks.map((t) => {
    if (t.status === 'done') {
      report.preserved.push({ id: t.id, title: t.title });
      return t;
    }
    if (t.schedule === 'pinned') {
      const conflict = t.offsetDays <= 0 && t.dueDate > newDate;
      report.pinned.push({ id: t.id, title: t.title, date: t.dueDate, conflict });
      if (conflict) report.conflicts.push(`“${t.title}” is pinned to a date after the new event date.`);
      return t;
    }
    const wanted = addDays(newDate, t.offsetDays);
    const due = wanted < today ? today : wanted;
    if (wanted < today) report.compressed.push({ id: t.id, title: t.title, wanted, to: due });
    if (due !== t.dueDate) report.moved.push({ id: t.id, title: t.title, from: t.dueDate, to: due });
    return due === t.dueDate ? t : { ...t, dueDate: due };
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    if (t.status === 'done') continue;
    for (const depId of t.dependsOn) {
      const dep = byId.get(depId);
      if (dep && dep.status !== 'done' && dep.dueDate > t.dueDate) {
        report.conflicts.push(`“${t.title}” is now due before “${dep.title}”, which it depends on.`);
      }
    }
  }
  for (const p of plan.budget.payments) {
    if (p.status === 'scheduled' && p.dueDate <= oldDate && p.dueDate > newDate) {
      report.paymentsAfterEvent.push({ id: p.id, label: p.label, dueDate: p.dueDate });
    }
  }
  if (report.compressed.length) {
    report.conflicts.push(
      `${report.compressed.length} task${report.compressed.length > 1 ? 's' : ''} would fall in the past and ${report.compressed.length > 1 ? 'have' : 'has'} been set to today — review the workload.`,
    );
  }
  return { tasks, report };
}
