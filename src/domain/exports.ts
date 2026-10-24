import { computeBudget, computeScenarios, quoteTotal } from './budget';
import { PRIORITY_LABEL, SCENARIO_LABEL, TASK_STATUS_LABEL, VENDOR_STATUS_LABEL, categoryMeta, workstreamLabel } from './catalog';
import { toCSV } from './csv';
import { analyzeRunOfShow, sortRunItems } from './runOfShow';
import { analyzeTimeline } from './timeline';
import type { EventPlan, ISODate, ScenarioKey } from './types';
import { addDays } from './util';

const VERIFICATION_LABEL = {
  illustrative: 'Illustrative demo — not verified',
  unverified: 'Planner-entered — not verified',
  verified: 'Verified',
} as const;

export function budgetCSV(plan: EventPlan, today: ISODate): string {
  const b = computeBudget(plan, today);
  const rows: unknown[][] = b.lines.map((l) => [
    l.label,
    l.basis === 'perGuest' ? `Per guest × ${l.units}${l.unitLabel ? ` ${l.unitLabel}` : ''}` : 'Fixed',
    l.basis === 'perGuest' ? l.planned : '',
    Math.round(l.plannedTotal),
    l.bestQuote === null ? '' : Math.round(l.bestQuote),
    Math.round(l.committed),
    Math.round(l.paid),
    Math.round(l.forecast),
    l.source,
    Math.round(l.variance),
  ]);
  rows.push([
    'Subtotal',
    '',
    '',
    Math.round(b.plannedSubtotal),
    '',
    Math.round(b.committedTotal),
    Math.round(b.paidTotal),
    Math.round(b.forecastSubtotal),
    '',
    '',
  ]);
  rows.push([`Contingency (${b.contingencyPct}%)`, '', '', b.plannedContingency, '', '', '', b.contingency, '', '']);
  rows.push(['Total', '', '', Math.round(b.plannedTotal), '', '', '', Math.round(b.forecastTotal), '', '']);
  rows.push(['Budget ceiling', '', '', b.ceiling, '', '', '', b.ceiling, '', '']);
  rows.push(['Remaining (ceiling − forecast)', '', '', '', '', '', '', Math.round(b.remaining), '', '']);
  rows.push(['Cost per guest', '', '', Math.round(b.plannedPerGuest), '', '', '', Math.round(b.costPerGuest), '', '']);
  rows.push([]);
  rows.push([
    `Event: ${plan.brief.name}`,
    `Guests: ${plan.brief.guestCount}`,
    `Currency: ${plan.brief.currency}`,
    `Exported: ${new Date().toISOString()}`,
  ]);
  rows.push(['Estimates are illustrative planning benchmarks, not market quotations.']);
  return toCSV(
    ['Category', 'Basis', 'Rate per guest', 'Planned', 'Best quote', 'Committed', 'Paid', 'Forecast', 'Forecast source', 'Variance'],
    rows,
  );
}

export function scenariosCSV(plan: EventPlan, today: ISODate): string {
  const s = computeScenarios(plan, today);
  const keys: ScenarioKey[] = ['lean', 'balanced', 'premium'];
  const current = computeBudget(plan, today);
  const rows: unknown[][] = plan.budget.categories.map((c) => [
    c.label,
    Math.round(current.lines.find((l) => l.key === c.key)?.plannedTotal ?? 0),
    ...keys.map((k) => Math.round(s[k].lines.find((l) => l.key === c.key)?.total ?? 0)),
  ]);
  rows.push(['Subtotal', Math.round(current.plannedSubtotal), ...keys.map((k) => s[k].subtotal)]);
  rows.push([`Contingency (${plan.budget.contingencyPct}%)`, current.plannedContingency, ...keys.map((k) => s[k].contingency)]);
  rows.push(['Total', Math.round(current.plannedTotal), ...keys.map((k) => s[k].total)]);
  rows.push(['Per guest', Math.round(current.plannedPerGuest), ...keys.map((k) => Math.round(s[k].perGuest))]);
  rows.push([
    'Within ceiling',
    current.plannedTotal <= current.ceiling ? 'Yes' : 'No',
    ...keys.map((k) => (s[k].withinCeiling ? 'Yes' : 'No')),
  ]);
  rows.push([]);
  for (const k of keys) for (const t of s[k].tradeoffs) rows.push([`${SCENARIO_LABEL[k]} trade-off`, t]);
  return toCSV(['Category', 'Current plan', 'Lean', 'Balanced', 'Premium'], rows);
}

export function timelineCSV(plan: EventPlan, today: ISODate): string {
  const a = analyzeTimeline(plan, today);
  const team = new Map(plan.team.map((m) => [m.id, m.name]));
  const titles = new Map(plan.tasks.map((t) => [t.id, t.title]));
  return toCSV(
    ['Task', 'Workstream', 'Owner', 'Status', 'Priority', 'Due date', 'Milestone', 'Depends on', 'Schedule', 'Flags'],
    a.ordered.map((t) => [
      t.title,
      workstreamLabel(t.workstream),
      t.ownerId ? (team.get(t.ownerId) ?? '') : '',
      TASK_STATUS_LABEL[t.status],
      PRIORITY_LABEL[t.priority],
      t.dueDate,
      t.milestone ? 'Yes' : '',
      t.dependsOn
        .map((d) => titles.get(d) ?? '')
        .filter(Boolean)
        .join('; '),
      t.schedule === 'pinned' ? 'Pinned date' : 'Moves with event date',
      a.insights.get(t.id)?.flags.join('; ') ?? '',
    ]),
  );
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function timelineICS(plan: EventPlan): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  const d = (iso: ISODate) => iso.replace(/-/g, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sutra Studio//Event Plan//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(plan.brief.name)}`,
  ];
  const add = (uidv: string, date: ISODate, summary: string, description: string) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidv}@sutra-studio`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d(date)}`,
      `DTEND;VALUE=DATE:${d(addDays(date, 1))}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      'END:VEVENT',
    );
  };
  for (let i = 0; i < plan.brief.durationDays; i++)
    add(`${plan.id}-day${i}`, addDays(plan.brief.eventDate, i), `${plan.brief.name} — Day ${i + 1}`, 'Event day');
  for (const t of plan.tasks.filter((x) => x.status !== 'done'))
    add(
      `${plan.id}-${t.id}`,
      t.dueDate,
      `${t.milestone ? '◆ ' : ''}${t.title}`,
      `${workstreamLabel(t.workstream)} · ${TASK_STATUS_LABEL[t.status]}`,
    );
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function vendorsCSV(plan: EventPlan): string {
  return toCSV(
    [
      'Vendor',
      'Category',
      'Status',
      'Preferred',
      'Quote basis',
      'Quote total (current guests)',
      'Deliverables',
      'Availability',
      'Pros',
      'Cons',
      'Next action',
      'Verification',
      'Source URL',
      'Checked on',
      'Phone',
      'Email',
      'Website',
    ],
    plan.vendors.map((v) => [
      v.name,
      categoryMeta(v.category)?.label ?? v.category,
      VENDOR_STATUS_LABEL[v.status],
      v.preferred ? 'Yes' : '',
      v.quote ? (v.quote.basis === 'perGuest' ? `${v.quote.amount} per guest × ${v.quote.units}` : 'Fixed') : 'No quote',
      v.quote ? Math.round(quoteTotal(v.quote, plan.brief.guestCount)) : '',
      v.quote?.deliverables ?? '',
      v.availability,
      v.pros.join('; '),
      v.cons.join('; '),
      v.nextAction,
      VERIFICATION_LABEL[v.verification.level],
      v.verification.sourceUrl ?? '',
      v.verification.checkedOn ?? '',
      v.phone,
      v.email,
      v.website,
    ]),
  );
}

export function runOfShowCSV(plan: EventPlan): string {
  const team = new Map(plan.team.map((m) => [m.id, m.name]));
  const vendors = new Map(plan.vendors.map((v) => [v.id, v.name]));
  const issues = analyzeRunOfShow(plan);
  return toCSV(
    [
      'Day',
      'Date',
      'Start',
      'End',
      'Activity',
      'Location',
      'Lead',
      'Vendors',
      'Setup (min)',
      'Setup notes',
      'Buffer (min)',
      'Timing',
      'Status',
      'Contingency',
      'Issues',
    ],
    sortRunItems(plan.runOfShow).map((r) => [
      r.dayIndex + 1,
      addDays(plan.brief.eventDate, r.dayIndex),
      r.start,
      r.end,
      r.title,
      r.location,
      r.leadId ? (team.get(r.leadId) ?? '') : '',
      r.vendorIds
        .map((id) => vendors.get(id) ?? '')
        .filter(Boolean)
        .join('; '),
      r.setupMinutes,
      r.setupNotes,
      r.bufferMinutes,
      r.timing === 'confirmed' ? 'Confirmed' : 'Suggested',
      r.status,
      r.contingency,
      issues
        .filter((i) => i.itemId === r.id)
        .map((i) => i.message)
        .join(' '),
    ]),
  );
}
