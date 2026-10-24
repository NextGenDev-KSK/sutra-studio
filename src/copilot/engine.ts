// Built-in, deterministic planning assistant. It reads the live plan, answers
// with computed facts, and expresses changes as validated PlanOps so they can
// be previewed, edited, applied or rejected. It never claims to have called a
// model, contacted a vendor or verified a business.

import {
  benchmarkRate,
  budgetContext,
  computeBudget,
  lineTotal,
  quoteTotal,
  BOOKED_STATUSES,
  ACTIVE_QUOTE_STATUSES,
  rateStep,
} from '../domain/budget';
import { CATEGORY_KEYWORDS, VENDOR_STATUS_LABEL, categoryMeta, regionFor } from '../domain/catalog';
import { summarizeGuests } from '../domain/guests';
import { computeInsights } from '../domain/insights';
import { makeProposal, type PlanOp } from '../domain/ops';
import { seasonOutlook } from '../domain/season';
import { analyzeTimeline } from '../domain/timeline';
import type { CategoryKey, EventPlan, ISODate, Vendor } from '../domain/types';
import { addDays, diffDays, formatDate, formatMoneyCompact, isValidISODate, plural, roundTo, sum } from '../domain/util';
import type { CopilotReply, FollowUp, InsightBlock } from './types';

export const SUGGESTED_PROMPTS: FollowUp[] = [
  { label: 'Cut 15%, keep photography', request: 'Reduce the total budget by 15% without cutting photography quality.' },
  { label: 'Move 2 weeks earlier', request: 'Move the event two weeks earlier and update the timeline.' },
  { label: 'Monsoon-proof the reception', request: 'Suggest a monsoon-friendly alternative for the outdoor reception.' },
  { label: 'Premium vegetarian menu', request: 'Create a premium vegetarian catering plan.' },
  { label: 'Biggest financial risks', request: 'Find the biggest financial risks in this plan.' },
  { label: 'Compare quotations', request: 'Compare two vendor quotations.' },
  { label: 'Eco-conscious version', request: 'Propose an eco-conscious version of this event.' },
  { label: 'Decisions this week', request: 'Which decisions must I make this week?' },
  { label: 'Decorator cancelled', request: 'Our decorator cancelled. What does this affect?' },
  { label: 'Client progress summary', request: "Summarize today's progress for the client." },
];

const WORD_NUM: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function norm(s: string): string {
  return s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

export function detectCategories(text: string): CategoryKey[] {
  const t = ` ${norm(text)} `;
  const found: CategoryKey[] = [];
  for (const [key, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => new RegExp(`[^a-z]${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t))) found.push(key);
  }
  return found;
}

export function parsePercent(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(%|percent|per cent)/.exec(norm(text));
  return m ? Number(m[1]) : null;
}

/** Parse money like "₹5 lakh", "5L", "2.5 crore", "50,000", "10k". */
export function parseAmount(text: string): number | null {
  const t = norm(text).replace(/rs\.?|inr|₹|\$|£|€/g, ' ');
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|l\b|crores?|cr\b|k\b|thousand|m\b|million)?/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const unit = m[2] ?? '';
  if (/^(lakh|lac|l)/.test(unit)) return n * 1e5;
  if (/^(crore|cr)/.test(unit)) return n * 1e7;
  if (/^(k|thousand)/.test(unit)) return n * 1e3;
  if (/^(m|million)/.test(unit)) return n * 1e6;
  return n;
}

function parseCount(word: string): number | null {
  if (/^\d+$/.test(word)) return Number(word);
  return WORD_NUM[word] ?? null;
}

/** Parse "two weeks earlier", "10 days later", "postpone by a month". Returns signed days. */
export function parseShift(text: string): number | null {
  const t = norm(text);
  const m =
    /(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(day|week|month)s?\s*(earlier|sooner|before|ahead|forward|back|later|after|out)?/.exec(
      t,
    );
  if (!m) return null;
  const n = parseCount(m[1]);
  if (n === null) return null;
  const unit = m[2] === 'week' ? 7 : m[2] === 'month' ? 30 : 1;
  const dir = m[3] ?? '';
  let sign = 0;
  if (/earlier|sooner|before|ahead|forward/.test(dir)) sign = -1;
  else if (/later|after|back|out/.test(dir)) sign = 1;
  else if (/prepone|bring (it )?forward|earlier|sooner/.test(t)) sign = -1;
  else if (/postpone|push|delay|later/.test(t)) sign = 1;
  if (!sign) return null;
  return sign * n * unit;
}

export function parseDate(text: string, today: ISODate): ISODate | null {
  const t = norm(text);
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(t);
  if (iso && isValidISODate(iso[1])) return iso[1];
  const m =
    /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{4})?/.exec(t) ??
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/.exec(t);
  if (!m) return null;
  let day: number, mon: number, year: number | undefined;
  if (/^\d/.test(m[1])) {
    day = Number(m[1]);
    mon = MONTHS.indexOf(m[2]);
    year = m[3] ? Number(m[3]) : undefined;
  } else {
    mon = MONTHS.indexOf(m[1]);
    day = Number(m[2]);
    year = m[3] ? Number(m[3]) : undefined;
  }
  const y0 = Number(today.slice(0, 4));
  const build = (y: number) => `${y}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  let candidate = build(year ?? y0);
  if (!year && candidate <= today) candidate = build(y0 + 1);
  return isValidISODate(candidate) ? candidate : null;
}

function vendorMatches(vendor: Vendor, text: string): boolean {
  const t = norm(text);
  const name = norm(vendor.name.replace(/\(demo\)/i, ''))
    .replace(/[^a-z0-9& ]/g, '')
    .trim();
  if (name && t.includes(name)) return true;
  const words = name.split(' ').filter((w) => w.length > 2 && !['the', 'and', 'co', 'studio'].includes(w));
  if (words.length >= 2 && t.includes(`${words[0]} ${words[1]}`)) return true;
  return words.length > 0 && words[0].length >= 5 && new RegExp(`\\b${words[0]}\\b`).test(t);
}

function findVendor(plan: EventPlan, text: string): Vendor | undefined {
  return plan.vendors.find((v) => vendorMatches(v, text));
}

const m$ = (plan: EventPlan, n: number) => formatMoneyCompact(n, plan.brief.currency);

function reply(text: string, extra: Partial<CopilotReply> = {}): CopilotReply {
  return { text, blocks: [], followUps: [], source: 'rules', ...extra };
}

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

function reduceBudget(plan: EventPlan, request: string, today: ISODate): CopilotReply {
  const s = computeBudget(plan, today);
  const pct = parsePercent(request);
  const amountTarget = pct === null ? parseAmount(request) : null;
  if (pct === null && amountTarget === null) {
    return reply('By how much should I reduce the plan? For example “reduce the budget by 10%” or “cut ₹5 lakh”.', {
      followUps: [{ label: 'Reduce by 10%', request: 'Reduce the total budget by 10%.' }],
    });
  }
  if (pct !== null && (pct <= 0 || pct >= 60)) return reply('Please choose a reduction between 1% and 59%.');
  const target = pct !== null ? (s.plannedTotal * pct) / 100 : amountTarget!;
  const named = detectCategories(request.replace(/.*?(without|but not|except|keep|protect|don't|do not)/i, ''));
  const protectNamed = /(without|but not|except|keep|protect|don't|do not)/i.test(request) ? named : [];
  const protectedSet = new Set<CategoryKey>([...plan.brief.protectedCategories, ...protectNamed]);
  const ctx = budgetContext(plan.brief);
  const neverAuto = new Set(['accessibility', 'permits']);
  const lines = new Map(s.lines.map((l) => [l.key, l]));
  const pctFactor = 1 + plan.budget.contingencyPct / 100;
  const subtotalTarget = target / pctFactor;

  const locked: { key: CategoryKey; text: string }[] = [];
  const switched = new Set<CategoryKey>();
  const candidates = plan.budget.categories
    .map((c) => {
      const line = lines.get(c.key)!;
      if (protectedSet.has(c.key) || neverAuto.has(c.key)) return null;
      if (line.source !== 'estimate') {
        locked.push({
          key: c.key,
          text: `${c.label} (${line.source === 'committed' ? 'booked contract' : 'preferred quotation'} ${m$(plan, line.forecast)})`,
        });
        return null;
      }
      const meta = categoryMeta(c.key);
      const current = line.plannedTotal;
      const leanTotal =
        meta && meta.basis === c.basis ? lineTotal({ ...c, planned: benchmarkRate(meta, 'lean', ctx) }, s.guests) : current * 0.7;
      const floor = c.essential ? Math.max(leanTotal, current * 0.85) : Math.min(current, leanTotal);
      return { c, current, floor, room: Math.max(0, current - floor) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.room > 0);

  const room = sum(candidates.map((c) => c.room));
  const share = room > 0 ? Math.min(1, subtotalTarget / room) : 0;
  const ops: PlanOp[] = [];
  const tradeoffs: string[] = [];
  let saved = 0;
  for (const cand of candidates.sort((a, b) => b.room - a.room)) {
    const newTotal = cand.current - cand.room * share;
    const step = rateStep(cand.c.basis, plan.brief.currency);
    const rate = cand.c.basis === 'perGuest' ? roundTo(newTotal / (s.guests * cand.c.units), step) : roundTo(newTotal, step);
    const realTotal = lineTotal({ ...cand.c, planned: rate }, s.guests);
    if (realTotal >= cand.current) continue;
    saved += cand.current - realTotal;
    ops.push({ op: 'setCategoryPlanned', key: cand.c.key, planned: rate });
    const meta = categoryMeta(cand.c.key);
    if ((cand.current - realTotal) / cand.current > 0.12) tradeoffs.push(`${cand.c.label}: ${meta?.leanTradeoff ?? 'reduced allocation.'}`);
    else tradeoffs.push(`${cand.c.label}: modest trim (${m$(plan, cand.current - realTotal)}).`);
  }

  // If estimate-based cuts are not enough, suggest switching to cheaper active quotations.
  let gap = subtotalTarget - saved;
  if (gap > 0) {
    for (const c of plan.budget.categories) {
      if (gap <= 0) break;
      if (protectedSet.has(c.key)) continue;
      const line = lines.get(c.key)!;
      if (line.source !== 'quote') continue;
      const alternatives = plan.vendors
        .filter((v) => v.category === c.key && ACTIVE_QUOTE_STATUSES.has(v.status) && !v.preferred && v.quote)
        .map((v) => ({ v, total: quoteTotal(v.quote, s.guests) }))
        .filter((a) => a.total < line.forecast)
        .sort((a, b) => a.total - b.total);
      const alt = alternatives[0];
      if (alt) {
        ops.push({ op: 'setVendorPreferred', vendorId: alt.v.id });
        switched.add(c.key);
        saved += line.forecast - alt.total;
        gap -= line.forecast - alt.total;
        tradeoffs.push(
          `${c.label}: switch the preferred quotation to ${alt.v.name} (saves ${m$(plan, line.forecast - alt.total)}). ${alt.v.cons.length ? `Consider: ${alt.v.cons.join('; ')}.` : ''}`.trim(),
        );
      }
    }
  }

  const savedTotal = saved * pctFactor;
  const assumptions = [
    `Interpreted as reducing planned spending by ${pct !== null ? `${pct}% (` : ''}${m$(plan, target)}${pct !== null ? ')' : ''}; the ${m$(plan, plan.brief.totalBudget)} ceiling is unchanged — say “set the budget to …” to lower it too.`,
    'Allocation cuts only become real savings once vendor quotations come in at or below the new amounts.',
    'Accessibility and permits are never reduced automatically.',
  ];
  if (protectedSet.size)
    assumptions.push(`Protected and left untouched: ${[...protectedSet].map((k) => categoryMeta(k)?.label ?? k).join(', ')}.`);
  const stillLocked = locked.filter((l) => !switched.has(l.key)).map((l) => l.text);
  if (stillLocked.length) tradeoffs.push(`Not changed (already contracted or quoted): ${stillLocked.join('; ')}.`);

  if (!ops.length) {
    return reply(
      `I couldn't find flexible spend to cut: every unprotected category is already contracted, quoted or at its floor. Options: renegotiate a booked contract, reduce the guest count (each guest costs about ${m$(plan, s.marginalGuestCost)}), or unprotect a category.`,
      { blocks: [{ kind: 'list', title: 'Locked categories', items: locked.map((l) => l.text) }] },
    );
  }
  const short = target - savedTotal;
  if (short > target * 0.02) {
    const guestsNeeded = s.marginalGuestCost > 0 ? Math.ceil(short / s.marginalGuestCost) : 0;
    tradeoffs.push(
      `Shortfall of ${m$(plan, short)}: reaching the full target needs a contract renegotiation${guestsNeeded ? ` or about ${guestsNeeded} fewer guests` : ''}.`,
    );
  }
  const proposal = makeProposal({
    title: `Reduce planned spend by ${m$(plan, savedTotal)}`,
    summary: `${plural(ops.length, 'change')} across flexible categories${protectNamed.length ? `, protecting ${protectNamed.map((k) => categoryMeta(k)?.label.toLowerCase()).join(' and ')}` : ''}.`,
    reason: `${Math.round((s.committedTotal / Math.max(1, s.forecastSubtotal)) * 100)}% of the forecast is already under contract, so cuts come from estimate-based categories first${ops.some((o) => o.op === 'setVendorPreferred') ? ', then cheaper active quotations' : ''}.`,
    ops,
    tradeoffs,
    assumptions,
  });
  return reply(
    short > target * 0.02
      ? `This saves about ${m$(plan, savedTotal)} of the ${m$(plan, target)} target without touching protected categories. The rest needs a renegotiation or a smaller headcount — see trade-offs.`
      : `Here's a way to save about ${m$(plan, savedTotal)} while keeping protected categories intact. Review the preview before applying.`,
    { proposal },
  );
}

function moveDate(plan: EventPlan, request: string, today: ISODate): CopilotReply {
  const explicit = /\bto\b/.test(norm(request)) ? parseDate(request, today) : null;
  const shift = explicit ? null : parseShift(request);
  if (!explicit && shift === null) {
    return reply('Tell me the new date or the shift, e.g. “move the event two weeks earlier” or “move the event to 14 March 2027”.');
  }
  const newDate = explicit ?? addDays(plan.brief.eventDate, shift!);
  if (newDate <= today)
    return reply(`That would put the event on ${formatDate(newDate)}, which is not in the future. Choose a later date.`);
  const lead = diffDays(today, newDate);
  if (lead < 7)
    return reply(
      `${formatDate(newDate)} is only ${lead} days away — too close to replan automatically. Pick a later date or adjust tasks manually.`,
    );
  const booked = plan.vendors.filter((v) => BOOKED_STATUSES.has(v.status));
  const offsetIn3 = diffDays(newDate, addDays(today, 3));
  const ops: PlanOp[] = [{ op: 'setEventDate', date: newDate }];
  if (booked.length) {
    ops.push({
      op: 'addTask',
      title: `Reconfirm the new date with booked vendors (${booked.map((v) => v.name.replace(/ \(demo\)/, '')).join(', ')})`,
      workstream: 'planning',
      offsetDays: offsetIn3,
      durationDays: 2,
      priority: 'high',
      notes: 'Availability on the new date is not confirmed until each vendor replies in writing.',
    });
  }
  if (plan.brief.venueStatus !== 'confirmed' && plan.brief.venueStatus !== 'not_required') {
    ops.push({
      op: 'addTask',
      title: 'Check shortlisted venue availability for the new date',
      workstream: 'venue',
      offsetDays: offsetIn3,
      durationDays: 1,
      priority: 'high',
      notes: '',
    });
  }
  const oldOutlook = seasonOutlook(plan.brief.city, plan.brief.country, plan.brief.eventDate);
  const newOutlook = seasonOutlook(plan.brief.city, plan.brief.country, newDate);
  const tradeoffs: string[] = [];
  if (shift !== null && shift < 0) tradeoffs.push(`Every open task loses ${-shift} days of lead time; tight tasks may now be at risk.`);
  if (oldOutlook.label !== newOutlook.label)
    tradeoffs.push(`Season changes from “${oldOutlook.label}” to “${newOutlook.label}”: ${newOutlook.notes[0]}`);
  const scheduled = plan.budget.payments.filter((p) => p.status === 'scheduled');
  if (scheduled.length)
    tradeoffs.push(`${plural(scheduled.length, 'scheduled payment')} keep their contractual dates — review them with vendors.`);
  const proposal = makeProposal({
    title: `Move the event to ${formatDate(newDate, { weekday: true })}`,
    summary: `${shift !== null ? `${Math.abs(shift)} days ${shift < 0 ? 'earlier' : 'later'}` : `From ${formatDate(plan.brief.eventDate)}`}; relative deadlines move with it.`,
    reason:
      'Relative task deadlines are recalculated from the new date. Completed and pinned tasks are preserved and any conflicts are listed.',
    ops,
    tradeoffs,
    assumptions: ['Vendor and venue availability on the new date is not confirmed.', 'Run-of-show timings stay the same on the new days.'],
  });
  return reply(`Here's the schedule impact of moving to ${formatDate(newDate)}. Nothing changes until you apply it.`, { proposal });
}

function weatherPlan(plan: EventPlan, request: string, today: ISODate): CopilotReply {
  const t = norm(request);
  const sessionWords = plan.brief.sessions.filter((s) =>
    norm(s.name)
      .split(' ')
      .some((w) => w.length > 3 && t.includes(w)),
  );
  const open = (sessionWords.length ? sessionWords : plan.brief.sessions).filter((s) => s.setting === 'outdoor' || s.setting === 'mixed');
  const outlook = seasonOutlook(plan.brief.city, plan.brief.country, plan.brief.eventDate);
  if (!open.length) {
    return reply(
      `There are no open-air sessions${sessionWords.length ? ` matching “${sessionWords.map((s) => s.name).join(', ')}”` : ''} to weather-proof. ${outlook.notes[0]}`,
      {
        blocks: [{ kind: 'list', title: 'Seasonal outlook', items: [...outlook.notes, outlook.disclaimer] }],
      },
    );
  }
  const s = computeBudget(plan, today);
  const cur = plan.brief.currency;
  const perGuest = cur === 'INR' ? 1500 : Math.max(5, Math.round((1500 / 84) * 2.4));
  const structureCost = roundTo(perGuest * s.guests * open.length, rateStep('fixed', cur));
  const prodCat = plan.budget.categories.find((c) => c.key === 'production') ?? plan.budget.categories.find((c) => c.key === 'decor');
  const ops: PlanOp[] = open.map((sess) => ({ op: 'updateSession' as const, sessionId: sess.id, setting: 'covered' as const }));
  if (prodCat) {
    ops.push({
      op: 'setCategoryPlanned',
      key: prodCat.key,
      planned:
        prodCat.basis === 'fixed'
          ? prodCat.planned + structureCost
          : prodCat.planned + roundTo(structureCost / (s.guests * prodCat.units), rateStep('perGuest', cur)),
    });
  }
  ops.push({
    op: 'addTask',
    title: `Book weatherproof structure & raised flooring (${open.map((x) => x.name).join(', ')})`,
    workstream: 'production',
    offsetDays: -30,
    durationDays: 5,
    priority: 'high',
    notes: 'Needs venue approval and a 1–2 day build window. Cost is an illustrative estimate until quoted.',
    vendorCategory: 'production',
    vendorRole: 'book',
  });
  ops.push({
    op: 'addTask',
    title: 'Weather go/no-go checkpoint (48-hour forecast)',
    workstream: 'production',
    offsetDays: -2,
    durationDays: 1,
    priority: 'high',
    notes: 'Decide whether side walls go up and confirm dry walkways.',
  });
  const runItems = plan.runOfShow.filter((r) => open.some((sess) => sess.dayIndex === r.dayIndex && norm(r.location) === norm(sess.area)));
  for (const r of runItems)
    ops.push({
      op: 'updateRunItem',
      itemId: r.id,
      appendContingency: 'Covered structure with roll-up side walls; dry walkways from drop-off to seating.',
    });
  const proposal = makeProposal({
    title: `Covered-pavilion plan for ${open.map((x) => x.name).join(', ')}`,
    summary: `Switch ${plural(open.length, 'open-air session')} to a covered structure and add a weather decision checkpoint.`,
    reason: outlook.monsoon
      ? `${formatDate(plan.brief.eventDate)} falls in the ${outlook.label.toLowerCase()} for ${plan.brief.city}; open-air sessions carry a high rain risk.`
      : `${formatDate(plan.brief.eventDate)} is outside the typical monsoon for ${plan.brief.city || 'this city'} (${outlook.label.toLowerCase()}), so this is a contingency upgrade rather than a necessity.`,
    ops,
    tradeoffs: [
      'A covered structure reduces the open-sky feel; roll-up side walls keep it airy in fair weather.',
      `Adds about ${m$(plan, structureCost * (1 + plan.budget.contingencyPct / 100))} including contingency (illustrative ~${m$(plan, perGuest)} per guest per session).`,
      'Needs a build window — check it against the run of show setup times.',
    ],
    assumptions: [
      'The venue allows temporary structures on the lawn/courtyard.',
      'Structure pricing is an illustrative estimate; request a quotation from the production vendor.',
      outlook.disclaimer,
    ],
  });
  return reply(
    outlook.monsoon
      ? 'Your date is in the monsoon season, so I recommend a covered plan for the open-air sessions.'
      : 'Your date is outside the typical monsoon, but here is a covered fallback plan if the client wants certainty.',
    {
      proposal,
      blocks: [{ kind: 'list', title: `Seasonal outlook · ${outlook.label}`, items: [...outlook.notes, outlook.disclaimer] }],
    },
  );
}

const REGIONAL_VEG: Record<string, string[]> = {
  rajasthan: ['Dal baati churma', 'Ker sangri', 'Gatte ki sabzi', 'Bajra roti with garlic chutney', 'Mawa kachori'],
  tamil_nadu: ['Banana-leaf meals', 'Vegetable kurma with appam', 'Bisi bele bath', 'Paruppu payasam', 'Filter-coffee bar'],
  kerala: ['Avial and olan', 'Appam with vegetable stew', 'Kerala parotta & kurma', 'Ada pradhaman', 'Banana chips counter'],
  gujarat: ['Live dhokla & khandvi counter', 'Undhiyu', 'Gujarati kadhi', 'Puran poli', 'Shrikhand'],
  punjab: ['Sarson da saag & makki roti', 'Amritsari kulcha counter', 'Paneer tikka', 'Phirni', 'Lassi bar'],
  west_bengal: ['Shukto', 'Cholar dal with luchi', 'Begun bhaja', 'Mishti doi', 'Sandesh selection'],
  maharashtra: ['Puran poli', 'Misal pav counter', 'Varan bhaat', 'Modak selection', 'Kokum sherbet'],
  default: ['Regional thali counter', 'Live tandoor with paneer & vegetables', 'Dal of the day', 'Seasonal halwa', 'Fresh-fruit kulfi'],
};
const CONTEMPORARY_VEG = [
  'Millet & roasted-vegetable salad',
  'Burrata-style paneer with heirloom tomatoes',
  'Truffle khichdi',
  'Wood-fired vegetable flatbreads',
  'Mezze platter with house hummus',
  'Saffron & pistachio kulfi bar',
  'Live dosa counter',
  'Seasonal fruit & rabri parfaits',
];

function vegCatering(plan: EventPlan, today: ISODate): CopilotReply {
  const cat = plan.budget.categories.find((c) => c.key === 'catering');
  if (!cat) return reply('This plan has no catering category. Add one in Budget Lab first.');
  const ctx = budgetContext(plan.brief);
  const meta = categoryMeta('catering')!;
  const premiumVeg = roundTo(benchmarkRate(meta, 'premium', ctx) * 0.92, rateStep('perGuest', plan.brief.currency));
  const s = computeBudget(plan, today);
  const line = s.lines.find((l) => l.key === 'catering')!;
  const caterer = plan.vendors.find((v) => v.category === 'catering' && BOOKED_STATUSES.has(v.status));
  const region = regionFor(plan.brief.city, plan.brief.country);
  const regional = REGIONAL_VEG[region] ?? REGIONAL_VEG.default;
  const meals = plan.brief.sessions.filter((x) => x.hasMeal);
  const blocks: InsightBlock[] = [
    {
      kind: 'table',
      title: 'Menu outline (to refine with the caterer)',
      columns: ['Session', 'Regional', 'Contemporary', 'Sweet'],
      rows: meals.map((sess, i) => [
        sess.name,
        `${regional[i % regional.length]}, ${regional[(i + 2) % regional.length]}`,
        `${CONTEMPORARY_VEG[(i * 2) % CONTEMPORARY_VEG.length]}, ${CONTEMPORARY_VEG[(i * 2 + 1) % CONTEMPORARY_VEG.length]}`,
        regional[4] ?? 'Seasonal dessert',
      ]),
    },
    {
      kind: 'list',
      title: 'Dietary counters',
      items: [
        'Jain counter (if requested by guests): no onion, garlic or root vegetables, with separate utensils.',
        'Vegan options: coconut-milk curries, dairy-free desserts, clearly tagged.',
        `Allergen labels on every dish${plan.brief.dietary.allergens.length ? ` — especially ${plan.brief.dietary.allergens.join(', ').toLowerCase()}` : ''}.`,
      ],
    },
  ];
  const newTotal = lineTotal({ ...cat, planned: premiumVeg }, s.guests);
  const ops: PlanOp[] = [
    { op: 'setCategoryPlanned', key: 'catering', planned: premiumVeg },
    { op: 'setDietary', vegetarianPct: 100 },
    {
      op: 'addTask',
      title: 'Premium vegetarian tasting & menu sign-off',
      workstream: 'catering',
      offsetDays: -45,
      durationDays: 2,
      priority: 'high',
      notes: 'Use the menu outline from the co-pilot as a starting brief.',
    },
  ];
  if (caterer)
    ops.push({
      op: 'addTask',
      title: `Request a revised quotation from ${caterer.name} for the premium vegetarian menu`,
      workstream: 'catering',
      offsetDays: diffDays(plan.brief.eventDate, addDays(today, 5)),
      durationDays: 3,
      priority: 'high',
      notes: 'The current contract stays in force until a revised quote is agreed.',
      vendorCategory: 'catering',
      vendorRole: 'requires',
    });
  const tradeoffs = [
    `Catering allocation ${newTotal >= line.plannedTotal ? 'rises' : 'falls'} from ${m$(plan, line.plannedTotal)} to ${m$(plan, newTotal)} (${m$(plan, premiumVeg)} per guest per meal service, illustrative).`,
  ];
  if (plan.brief.dietary.vegetarianPct < 100)
    tradeoffs.push(
      `The brief records ${100 - plan.brief.dietary.vegetarianPct}% non-vegetarian preference — an all-vegetarian menu changes that; uncheck the dietary change to keep a mixed menu with a premium vegetarian spread.`,
    );
  if (caterer)
    tradeoffs.push(
      `${caterer.name} is booked at ${m$(plan, line.committed)}; the forecast follows the contract until a revised quote is entered.`,
    );
  return reply('Here is a premium vegetarian direction with a menu outline per meal service.', {
    blocks,
    proposal: makeProposal({
      title: 'Premium vegetarian catering plan',
      summary: `All-vegetarian menu across ${plural(meals.length, 'meal service')} with regional and contemporary counters.`,
      reason: 'Premium tier rate adjusted for an all-vegetarian menu; tasting and quotation tasks keep the caterer aligned.',
      ops,
      tradeoffs,
      assumptions: [
        'Assumes the request is for an all-vegetarian event.',
        'Dish suggestions are a starting brief, not the caterer’s confirmed menu.',
        'Per-plate rate is an illustrative benchmark.',
      ],
    }),
  });
}

function financialRisks(plan: EventPlan, today: ISODate): CopilotReply {
  const s = computeBudget(plan, today);
  const g = summarizeGuests(plan.guests);
  const items: string[] = [];
  const headroomPct = s.ceiling > 0 ? (s.remaining / s.ceiling) * 100 : 0;
  items.push(
    s.remaining < 0
      ? `Forecast is ${m$(plan, -s.remaining)} over the ${m$(plan, s.ceiling)} ceiling.`
      : `Headroom is ${m$(plan, s.remaining)} (${headroomPct.toFixed(1)}% of the ceiling) after a ${s.contingencyPct}% contingency of ${m$(plan, s.contingency)}.`,
  );
  for (const l of s.lines
    .filter((x) => x.variance > 0 && x.plannedTotal > 0)
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 3)) {
    items.push(
      `${l.label} is ${m$(plan, l.variance)} over allocation (${l.source === 'committed' ? 'booked contract' : l.source === 'quote' ? 'preferred quote' : 'estimate'}).`,
    );
  }
  items.push(
    `Headcount exposure: each extra guest adds about ${m$(plan, s.marginalGuestCost)}; 10 more guests ≈ ${m$(plan, s.marginalGuestCost * 10)}.${plan.guests.length ? ` RSVPs currently project ~${g.projected} vs ${plan.brief.guestCount} budgeted.` : ''}`,
  );
  const unlocked = s.lines
    .filter((l) => l.source !== 'committed' && l.forecast > 0)
    .sort((a, b) => b.forecast - a.forecast)
    .slice(0, 3);
  if (unlocked.length) items.push(`Prices not yet locked: ${unlocked.map((l) => `${l.label} ${m$(plan, l.forecast)}`).join(', ')}.`);
  const next30 = s.upcomingPayments.filter((p) => p.daysUntil <= 30);
  if (next30.length)
    items.push(`${plural(next30.length, 'payment')} totalling ${m$(plan, sum(next30.map((p) => p.amount)))} fall due in the next 30 days.`);
  if (s.scheduleGaps.length) items.push(`${plural(s.scheduleGaps.length, 'payment schedule')} no longer match their contracts.`);
  if (s.sunkTotal > 0) items.push(`${m$(plan, s.sunkTotal)} paid to cancelled vendors is counted as spent until refunds are recorded.`);
  const largestOpen = unlocked[0];
  if (largestOpen && s.contingency < largestOpen.forecast * 0.1)
    items.push(`Contingency (${m$(plan, s.contingency)}) is small relative to the largest unlocked price (${largestOpen.label}).`);
  const followUps: FollowUp[] = [];
  if (s.contingencyPct < 8) followUps.push({ label: 'Raise contingency to 8%', request: 'Increase contingency to 8%.' });
  followUps.push({ label: 'Trim 5% from flexible spend', request: 'Reduce the total budget by 5%.' });
  return reply('Here are the biggest financial risks, computed from the current plan.', {
    blocks: [{ kind: 'list', title: 'Financial risks', items }],
    followUps,
  });
}

function compareQuotes(plan: EventPlan, request: string): CopilotReply {
  const named = plan.vendors.filter((v) => vendorMatches(v, request));
  let pool: Vendor[];
  let key: CategoryKey | undefined;
  if (named.length >= 2) {
    pool = named;
    key = named[0].category;
  } else {
    const cats = detectCategories(request);
    const withQuotes = (k: CategoryKey) => plan.vendors.filter((v) => v.category === k && v.quote && v.status !== 'cancelled');
    key =
      cats.find((k) => withQuotes(k).length >= 2) ??
      [...new Set(plan.vendors.map((v) => v.category))]
        .map((k) => ({ k, n: withQuotes(k).filter((v) => v.status !== 'rejected').length }))
        .sort((a, b) => b.n - a.n)[0]?.k;
    pool = key ? withQuotes(key) : [];
  }
  if (pool.length < 2)
    return reply('I need at least two vendors with quotations in the same category to compare. Add quotes in the Vendor Hub.');
  const guests = plan.brief.guestCount;
  const rows = pool.map((v) => ({ v, total: quoteTotal(v.quote, guests) })).sort((a, b) => a.total - b.total);
  const cheapest = rows.find((r) => r.v.status !== 'rejected') ?? rows[0];
  const label = categoryMeta(key!)?.label ?? key!;
  const table: InsightBlock = {
    kind: 'table',
    title: `${label} quotations at ${guests} guests`,
    columns: ['Vendor', 'Status', 'Total', 'Per guest', 'Includes', 'Watch-outs', 'Verification'],
    rows: rows.map(({ v, total }) => [
      v.name,
      VENDOR_STATUS_LABEL[v.status],
      m$(plan, total),
      m$(plan, total / Math.max(1, guests)),
      v.quote?.deliverables ?? '—',
      v.cons.join('; ') || '—',
      v.verification.level === 'verified' ? 'Verified' : v.verification.level === 'illustrative' ? 'Illustrative demo' : 'Not verified',
    ]),
  };
  const priciest = rows[rows.length - 1];
  const items = [
    `Spread: ${m$(plan, priciest.total - rows[0].total)} between the lowest and highest quotation.`,
    `Lowest active quotation: ${cheapest.v.name} at ${m$(plan, cheapest.total)}${cheapest.v.cons.length ? ` — watch-outs: ${cheapest.v.cons.join('; ')}` : ''}.`,
  ];
  const bookedHere = rows.find((r) => BOOKED_STATUSES.has(r.v.status));
  if (bookedHere) items.push(`${bookedHere.v.name} is already booked; switching would mean cancelling a contract.`);
  if (rows.some((r) => r.v.verification.level !== 'verified'))
    items.push('Some records are not verified — confirm inclusions, taxes and availability in writing before deciding.');
  const followUps = rows
    .filter((r) => ACTIVE_QUOTE_STATUSES.has(r.v.status) && !r.v.preferred)
    .slice(0, 2)
    .map((r) => ({
      label: `Prefer ${r.v.name.replace(/ \(demo\)/, '')}`,
      request: `Mark ${r.v.name.replace(/ \(demo\)/, '')} as preferred.`,
    }));
  return reply(`Comparison of ${plural(rows.length, 'quotation')} for ${label.toLowerCase()}, recalculated at today's guest count.`, {
    blocks: [table, { kind: 'list', title: 'What stands out', items }],
    followUps,
  });
}

function preferVendor(plan: EventPlan, request: string): CopilotReply | null {
  const v = findVendor(plan, request);
  if (!v) return null;
  const book = /\bbook\b/.test(norm(request));
  if (book) {
    if (BOOKED_STATUSES.has(v.status)) return reply(`${v.name} is already booked.`);
    return reply(`Booking ${v.name} adds its quotation to committed spend and completes any matching booking task.`, {
      proposal: makeProposal({
        title: `Book ${v.name}`,
        summary: `Mark ${v.name} as booked in ${categoryMeta(v.category)?.label ?? v.category}.`,
        reason: 'You asked to book this vendor. This only updates the plan — it does not contact the vendor.',
        ops: [{ op: 'setVendorStatus', vendorId: v.id, status: 'booked' }],
        tradeoffs: v.cons.length ? [`Watch-outs: ${v.cons.join('; ')}.`] : [],
        assumptions: ['The contract and advance payment are handled outside Sutrā; add payments in Budget Lab.'],
      }),
    });
  }
  if (!v.quote) return reply(`${v.name} has no quotation yet, so it can't be the preferred quote.`);
  return reply(
    `Preferring ${v.name} makes its quotation the forecast for ${categoryMeta(v.category)?.label.toLowerCase() ?? v.category} until someone is booked.`,
    {
      proposal: makeProposal({
        title: `Prefer ${v.name}`,
        summary: 'Use this quotation as the category forecast.',
        reason: 'The preferred quotation replaces the planning estimate in the budget forecast.',
        ops: [{ op: 'setVendorPreferred', vendorId: v.id }],
        tradeoffs: v.cons.length ? [`Watch-outs: ${v.cons.join('; ')}.`] : [],
        assumptions: ['The quotation is still valid; confirm before booking.'],
      }),
    },
  );
}

function ecoVersion(plan: EventPlan, today: ISODate): CopilotReply {
  const s = computeBudget(plan, today);
  const lines = new Map(s.lines.map((l) => [l.key, l]));
  const ops: PlanOp[] = [];
  const tradeoffs: string[] = [];
  const adjust = (key: string, factor: number, why: string) => {
    const c = plan.budget.categories.find((x) => x.key === key);
    const l = lines.get(key);
    if (!c || !l) return;
    if (l.source === 'committed') {
      tradeoffs.push(`${c.label} is already booked — agree the low-waste changes with the vendor rather than re-budgeting.`);
      return;
    }
    ops.push({ op: 'setCategoryPlanned', key, planned: roundTo(c.planned * factor, rateStep(c.basis, plan.brief.currency)) });
    tradeoffs.push(why);
  };
  adjust('printing', 0.4, 'Invitations go digital with a small printed run for elders — less keepsake value for some guests.');
  adjust('decor', 0.92, 'Décor shifts to rentals, potted plants and reusable fabric — fewer one-off installations.');
  adjust('gifts', 0.9, 'Favours become consumable local crafts or plants instead of packaged gifts.');
  const decorVendor = plan.vendors.find((v) => v.category === 'decor' && BOOKED_STATUSES.has(v.status));
  ops.push(
    {
      op: 'addTask',
      title: 'Brief every vendor on zero single-use plastic & no foam décor',
      workstream: 'planning',
      offsetDays: -60,
      durationDays: 3,
      priority: 'medium',
      notes: decorVendor ? `Start with ${decorVendor.name}, already booked.` : '',
    },
    {
      op: 'addTask',
      title: 'Identify and verify a local surplus-food redistribution partner',
      workstream: 'catering',
      offsetDays: -21,
      durationDays: 5,
      priority: 'medium',
      notes: 'Verify the organisation directly; Sutrā does not recommend specific partners.',
    },
    {
      op: 'addTask',
      title: 'Set up refill water stations & waste-segregation points',
      workstream: 'production',
      offsetDays: -10,
      durationDays: 2,
      priority: 'medium',
      notes: '',
    },
    {
      op: 'updateBrief',
      field: 'style',
      value: plan.brief.style.includes('eco') ? plan.brief.style : `${plan.brief.style ? `${plan.brief.style} · ` : ''}eco-conscious`,
    },
    {
      op: 'addNote',
      kind: 'decision',
      title: 'Eco-conscious direction proposed',
      body: 'Digital invitations, rental décor, refill stations, waste segregation and a surplus-food plan.',
    },
  );
  return reply('Here is an eco-conscious version that keeps the celebration generous while cutting waste.', {
    blocks: [
      {
        kind: 'list',
        title: 'What changes',
        items: [
          'Digital-first invitations and RSVPs',
          'Rental and living décor; no foam or plastic backdrops',
          'Local seasonal flowers bought by weight and composted afterwards',
          'Refill stations instead of bottled water',
          'Surplus food redistributed through a partner you verify',
          'Shuttles to cut individual car trips',
        ],
      },
    ],
    proposal: makeProposal({
      title: 'Eco-conscious version of the event',
      summary: 'Lower-waste choices across print, décor, gifts and operations.',
      reason: 'Targets the biggest waste sources at events: print, single-use décor, bottled water and surplus food.',
      ops,
      tradeoffs,
      assumptions: [
        'Savings are illustrative estimates; vendors may price rentals differently.',
        'No sustainability claims are verified by Sutrā.',
      ],
    }),
  });
}

function decisionsThisWeek(plan: EventPlan, today: ISODate): CopilotReply {
  const a = analyzeTimeline(plan, today);
  const s = computeBudget(plan, today);
  const team = new Map(plan.team.map((m) => [m.id, m.name]));
  const owner = (id?: string) => (id ? (team.get(id) ?? 'Unassigned') : 'Unassigned');
  const overdue = a.overdue.map((t) => `${t.title} — ${-a.insights.get(t.id)!.daysUntilDue} days overdue (${owner(t.ownerId)})`);
  const week = a.dueThisWeek.map(
    (t) =>
      `${t.title} — due ${formatDate(t.dueDate, { weekday: true, year: false })} (${owner(t.ownerId)})${a.insights.get(t.id)!.venueBlocked ? ' · blocked by venue' : ''}`,
  );
  const pays = s.upcomingPayments
    .filter((p) => p.daysUntil <= 7)
    .map(
      (p) =>
        `${p.label} to ${p.vendorName}: ${m$(plan, p.amount)} ${p.overdue ? `(overdue ${-p.daysUntil} days)` : `due ${formatDate(p.dueDate, { year: false })}`}`,
    );
  const bookingSoon = plan.tasks.filter((t) => t.vendorRole === 'book' && t.status !== 'done' && diffDays(today, t.dueDate) <= 14);
  const choices = bookingSoon.map((t) => {
    const opts = plan.vendors.filter((v) => v.category === t.vendorCategory && ACTIVE_QUOTE_STATUSES.has(v.status));
    return `${t.title}: ${opts.length ? `choose between ${opts.map((v) => v.name).join(' and ')}` : 'no quotations yet — request them'}`;
  });
  const blocks: InsightBlock[] = [];
  if (overdue.length) blocks.push({ kind: 'list', title: 'Overdue — decide now', items: overdue });
  if (choices.length) blocks.push({ kind: 'list', title: 'Vendor decisions due within 14 days', items: choices });
  if (week.length) blocks.push({ kind: 'list', title: 'Due in the next 7 days', items: week });
  if (pays.length) blocks.push({ kind: 'list', title: 'Payments in the next 7 days', items: pays });
  if (!blocks.length)
    return reply(
      'Nothing is due or overdue in the next seven days. The next milestone is ' +
        (a.upcomingMilestones[0]
          ? `“${a.upcomingMilestones[0].title}” on ${formatDate(a.upcomingMilestones[0].dueDate)}.`
          : 'not scheduled.'),
    );
  return reply(`${plural(overdue.length + choices.length + week.length + pays.length, 'item')} need attention this week.`, { blocks });
}

function vendorCancelled(plan: EventPlan, request: string, today: ISODate): CopilotReply {
  const named = findVendor(plan, request);
  const cats = detectCategories(request);
  const vendor =
    named && BOOKED_STATUSES.has(named.status)
      ? named
      : plan.vendors.find((v) => cats.includes(v.category) && BOOKED_STATUSES.has(v.status));
  if (!vendor) {
    const label = cats.length ? categoryMeta(cats[0])?.label.toLowerCase() : 'that';
    return reply(`I couldn't find a booked ${label} vendor in this plan. Name the vendor or check its status in the Vendor Hub.`);
  }
  const cat = vendor.category;
  const label = categoryMeta(cat)?.label ?? cat;
  const s = computeBudget(plan, today);
  const paid = sum(plan.budget.payments.filter((p) => p.vendorId === vendor.id && p.status === 'paid').map((p) => p.amount));
  const scheduled = plan.budget.payments.filter((p) => p.vendorId === vendor.id && p.status === 'scheduled');
  const contract = quoteTotal(vendor.quote, s.guests);
  const alternatives = plan.vendors.filter(
    (v) => v.id !== vendor.id && v.category === cat && ACTIVE_QUOTE_STATUSES.has(v.status) && v.quote,
  );
  const alt = alternatives.sort((a, b) => quoteTotal(a.quote, s.guests) - quoteTotal(b.quote, s.guests))[0];
  const dependent = plan.tasks.filter((t) => t.vendorCategory === cat && t.vendorRole === 'requires' && t.status !== 'done');
  const bookTask = plan.tasks.find((t) => t.vendorCategory === cat && t.vendorRole === 'book');
  const runItems = plan.runOfShow.filter((r) => r.vendorIds.includes(vendor.id));
  const ops: PlanOp[] = [{ op: 'setVendorStatus', vendorId: vendor.id, status: 'cancelled' }];
  if (scheduled.length) ops.push({ op: 'cancelVendorPayments', vendorId: vendor.id });
  const rebookBy = addDays(today, 7);
  if (bookTask)
    ops.push({
      op: 'updateTask',
      taskId: bookTask.id,
      priority: 'high',
      dueDate: rebookBy,
      appendNote: `Re-opened: ${vendor.name} cancelled on ${formatDate(today)}.`,
    });
  else
    ops.push({
      op: 'addTask',
      title: `Book a replacement ${label.toLowerCase()} vendor`,
      workstream: 'planning',
      offsetDays: diffDays(plan.brief.eventDate, rebookBy),
      durationDays: 3,
      priority: 'high',
      notes: '',
      vendorCategory: cat,
      vendorRole: 'book',
    });
  if (alt) {
    ops.push({ op: 'setVendorPreferred', vendorId: alt.id });
    ops.push({
      op: 'addTask',
      title: `Confirm availability & revised quote from ${alt.name}`,
      workstream: 'planning',
      offsetDays: diffDays(plan.brief.eventDate, addDays(today, 2)),
      durationDays: 2,
      priority: 'high',
      notes: 'Shortlisted alternative — availability for the date is not confirmed.',
    });
  }
  for (const t of dependent)
    ops.push({
      op: 'updateTask',
      taskId: t.id,
      status: 'blocked',
      appendNote: `On hold until a replacement ${label.toLowerCase()} vendor is booked.`,
    });
  for (const r of runItems)
    ops.push({
      op: 'updateRunItem',
      itemId: r.id,
      status: 'at_risk',
      appendContingency: `${vendor.name} cancelled — replacement pending.`,
    });
  ops.push({ op: 'addRisk', text: `${label} vendor cancelled — replacement needed` });

  const blocks: InsightBlock[] = [
    {
      kind: 'list',
      title: 'What this affects',
      items: [
        `Budget: ${m$(plan, contract)} leaves committed spend; the forecast falls back to ${alt ? `${alt.name}'s quotation (${m$(plan, quoteTotal(alt.quote, s.guests))})` : 'the planning estimate'}.${paid ? ` ${m$(plan, paid)} already paid stays counted as spent until a refund is recorded.` : ''}`,
        `${plural(scheduled.length, 'scheduled payment')} to ${vendor.name} would be cancelled.`,
        `${plural(dependent.length, 'dependent task')} go on hold: ${dependent.map((t) => t.title).join('; ') || 'none'}.`,
        `${plural(runItems.length, 'run-of-show item')} become at risk: ${runItems.map((r) => r.title).join('; ') || 'none'}.`,
        bookTask
          ? `“${bookTask.title}” re-opens with a new deadline of ${formatDate(rebookBy)}.`
          : `A replacement booking task is added for ${formatDate(rebookBy)}.`,
      ],
    },
  ];
  return reply(
    `${vendor.name}'s cancellation touches budget, ${plural(dependent.length, 'task')} and ${plural(runItems.length, 'run-of-show item')}. Review the recovery plan below.`,
    {
      blocks,
      proposal: makeProposal({
        title: `Recover from ${vendor.name} cancelling`,
        summary: alt
          ? `Fall back to ${alt.name} (shortlisted) and protect dependent work.`
          : 'Re-open the booking and protect dependent work.',
        reason: `${label} is a dependency for ${plural(dependent.length + runItems.length, 'downstream item')}; marking them now keeps the plan honest.`,
        ops,
        tradeoffs: alt
          ? [`${alt.name}: ${alt.cons.join('; ') || 'no noted watch-outs'}.`]
          : ['No shortlisted alternative — sourcing restarts from scratch.'],
        assumptions: [
          paid
            ? `Refund of the ${m$(plan, paid)} advance is not assumed; mark the payment as refunded if it is returned.`
            : 'No advance had been paid.',
          alt ? `${alt.name}'s availability for the date is unconfirmed.` : 'Replacement pricing is unknown.',
        ],
      }),
    },
  );
}

function clientSummary(plan: EventPlan, today: ISODate): CopilotReply {
  const ins = computeInsights(plan, today);
  const a = ins.timeline;
  const s = ins.budget;
  const g = summarizeGuests(plan.guests);
  const recent = plan.tasks.filter((t) => t.status === 'done' && t.completedOn && diffDays(t.completedOn, today) <= 14);
  const booked = plan.vendors.filter((v) => BOOKED_STATUSES.has(v.status));
  const nextMilestones = a.upcomingMilestones.slice(0, 3);
  const needs = ins.actions.map((x) => x.title);
  const client = plan.brief.clientName.replace(/\s*\(fictional\)/i, '') || 'there';
  const lines = [
    `Subject: ${plan.brief.name} — progress update, ${formatDate(today)}`,
    '',
    `Hi ${client},`,
    '',
    `Here's where things stand with ${a.daysToEvent} days to go.`,
    '',
    `• Progress: ${a.done} of ${a.total} planning tasks complete (${a.pct}%).${
      recent.length
        ? ` Recently completed: ${recent
            .slice(0, 3)
            .map((t) => t.title)
            .join('; ')}.`
        : ''
    }`,
    `• Booked: ${booked.length ? booked.map((v) => `${categoryMeta(v.category)?.label.toLowerCase() ?? v.category} (${v.name.replace(/ \(demo\)/, '')})`).join(', ') : 'no vendors booked yet'}.`,
    `• Budget: forecast ${m$(plan, s.forecastTotal)} of ${m$(plan, s.ceiling)} including a ${s.contingencyPct}% contingency — ${s.remaining >= 0 ? `${m$(plan, s.remaining)} headroom` : `${m$(plan, -s.remaining)} over, and we'll bring you options`}.`,
  ];
  if (plan.guests.length) lines.push(`• RSVPs: ${g.confirmed} attending, ${g.pending} yet to reply, ${g.declined} declined.`);
  if (nextMilestones.length)
    lines.push(`• Coming up: ${nextMilestones.map((t) => `${t.title} (${formatDate(t.dueDate, { year: false })})`).join('; ')}.`);
  if (needs.length) lines.push(`• Where we need you: ${needs.join('; ')}.`);
  lines.push('', 'Warm regards,', plan.brief.plannerName || 'Your planning team');
  return reply('Here is a client-ready update. It uses aggregate figures only — no individual guest details.', {
    blocks: [{ kind: 'text', title: 'Client update (draft)', body: lines.join('\n'), copyable: true }],
  });
}

function setGuests(plan: EventPlan, request: string, today: ISODate): CopilotReply | null {
  const t = norm(request);
  const m = /(\d{1,6})/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  let count = n;
  if (/\b(add|increase by|more|extra|plus)\b/.test(t) && !/\bto\b/.test(t)) count = plan.brief.guestCount + n;
  else if (/\b(reduce by|fewer|less|minus|remove|cut)\b/.test(t) && !/\bto\b/.test(t)) count = plan.brief.guestCount - n;
  if (count < 1 || count > 100000) return reply('Guest count must be between 1 and 100,000.');
  if (count === plan.brief.guestCount) return reply(`The plan already assumes ${count} guests.`);
  const s = computeBudget(plan, today);
  const delta = count - plan.brief.guestCount;
  return reply(`Changing the guest count re-prices every per-guest line and contract.`, {
    proposal: makeProposal({
      title: `Plan for ${count} guests`,
      summary: `${delta > 0 ? '+' : ''}${delta} guests vs the current plan.`,
      reason: 'Per-guest categories and per-guest vendor contracts scale with headcount; fixed costs do not.',
      ops: [{ op: 'setGuestCount', count }],
      tradeoffs: [
        `Roughly ${m$(plan, Math.abs(delta) * s.marginalGuestCost)} ${delta > 0 ? 'more' : 'less'} forecast spend (${m$(plan, s.marginalGuestCost)} per guest).`,
        'Payment schedules for per-guest contracts will need updating.',
      ],
      assumptions: ['Venue capacity and seating plans still fit the new headcount.'],
    }),
  });
}

function setContingency(plan: EventPlan, request: string): CopilotReply | null {
  const pct = parsePercent(request);
  if (pct === null) return null;
  if (pct < 0 || pct > 30) return reply('Contingency must be between 0% and 30%.');
  return reply(`Contingency is a reserve on top of category forecasts, so it changes totals without touching any category.`, {
    proposal: makeProposal({
      title: `Set contingency to ${pct}%`,
      summary: `From ${plan.budget.contingencyPct}% to ${pct}%.`,
      reason:
        pct > plan.budget.contingencyPct
          ? 'A larger reserve absorbs late changes and unlocked prices.'
          : 'Frees headroom at the cost of resilience.',
      ops: [{ op: 'setContingencyPct', pct }],
      tradeoffs: [],
      assumptions: [],
    }),
  });
}

function setCeiling(plan: EventPlan, request: string): CopilotReply | null {
  const amount = parseAmount(request.replace(/.*\b(to|by)\b/i, ''));
  if (!amount) return null;
  const t = norm(request);
  let target = amount;
  if (/\bby\b/.test(t)) target = /(reduce|lower|cut|decrease)/.test(t) ? plan.brief.totalBudget - amount : plan.brief.totalBudget + amount;
  if (target <= 0) return reply('The budget ceiling must be greater than zero.');
  return reply('Changing the ceiling changes headroom and how scenarios are fitted — category allocations stay as they are.', {
    proposal: makeProposal({
      title: `Set the budget ceiling to ${m$(plan, target)}`,
      summary: `From ${m$(plan, plan.brief.totalBudget)}.`,
      reason: 'You asked to change the client’s stated budget.',
      ops: [{ op: 'setTotalBudget', amount: Math.round(target) }],
      tradeoffs: [],
      assumptions: ['The client has approved the new ceiling.'],
    }),
  });
}

function help(plan: EventPlan): CopilotReply {
  return reply(
    `I work directly on “${plan.brief.name}”. I can propose changes you can preview, edit, apply or reject — or answer questions from the live plan.`,
    {
      blocks: [{ kind: 'list', title: 'Try asking', items: SUGGESTED_PROMPTS.map((p) => p.request) }],
      followUps: SUGGESTED_PROMPTS.slice(0, 4),
    },
  );
}

/** Route a request to the matching intent. */
export function respond(request: string, plan: EventPlan, today: ISODate): CopilotReply {
  const t = norm(request);
  if (!t) return help(plan);
  if (/(cancel+ed|cancel+ing|dropped out|backed out|pulled out|no longer available|ghosted)/.test(t))
    return vendorCancelled(plan, request, today);
  if (
    /\b(move|shift|push|bring|prepone|postpone|reschedule|delay)\b/.test(t) &&
    /(event|wedding|date|celebration|party|it\b|day|week|month)/.test(t) &&
    (parseShift(t) !== null || /\bto\b/.test(t))
  )
    return moveDate(plan, request, today);
  if (/compare/.test(t)) return compareQuotes(plan, request);
  if (/\b(prefer|go with|choose|select|book)\b/.test(t)) {
    const r = preferVendor(plan, request);
    if (r) return r;
  }
  if (/(risk|exposure|worr|concern|danger)/.test(t) && /(financ|budget|money|cost|spend)/.test(t)) return financialRisks(plan, today);
  if (/contingency/.test(t)) {
    const r = setContingency(plan, request);
    if (r) return r;
  }
  if (
    /(reduce|cut|lower|trim|save|bring down|decrease|shave)/.test(t) &&
    /(budget|cost|spend|total|plan)/.test(t) &&
    !/\b(guest|people|pax|headcount)\b/.test(t)
  ) {
    if (/\b(ceiling)\b/.test(t) || /\bset\b.*\bbudget\b.*\bto\b/.test(t)) {
      const r = setCeiling(plan, request);
      if (r) return r;
    }
    return reduceBudget(plan, request, today);
  }
  if (/\b(set|change|increase|raise|update|make)\b.*\b(budget|ceiling)\b/.test(t)) {
    const r = setCeiling(plan, request);
    if (r) return r;
  }
  if (/\b(guest|guests|people|pax|headcount|attendees)\b/.test(t) && /\d/.test(t)) {
    const r = setGuests(plan, request, today);
    if (r) return r;
  }
  if (/(monsoon|rain|weather|wet|storm|heat|hot|cold|wind)/.test(t)) return weatherPlan(plan, request, today);
  if (/(veg|vegetarian)/.test(t) && /(cater|menu|food|meal|plan)/.test(t)) return vegCatering(plan, today);
  if (/(eco|sustainab|green|zero.?waste|plastic|carbon|environment)/.test(t)) return ecoVersion(plan, today);
  if (/(this week|decide|decision|what.*(today|now)|priorit|urgent)/.test(t)) return decisionsThisWeek(plan, today);
  if (/(summar|update|report|recap|status)/.test(t) && /(client|progress|today|family|families|host)/.test(t))
    return clientSummary(plan, today);
  if (/(risk)/.test(t)) return financialRisks(plan, today);
  return reply("I'm not sure how to act on that yet. Here's what I can do with this plan:", {
    blocks: [{ kind: 'list', items: SUGGESTED_PROMPTS.map((p) => p.request) }],
    followUps: SUGGESTED_PROMPTS.slice(0, 4),
  });
}
