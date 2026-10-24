import {
  CATEGORY_META,
  INTERNATIONAL_COST_INDEX,
  REFERENCE_FX,
  SCENARIO_LABEL,
  categoryMeta,
  cityCostFactor,
  eventTypeProfile,
  isIndia,
  type CategoryMeta,
  type UnitsRule,
} from './catalog';
import type {
  BudgetCategory,
  CategoryKey,
  CurrencyCode,
  EventBrief,
  EventPlan,
  ISODate,
  Payment,
  Quote,
  ScenarioKey,
  Vendor,
} from './types';
import { diffDays, formatMoneyCompact, roundTo, sum } from './util';

// ---------------------------------------------------------------------------
// Context & benchmarks
// ---------------------------------------------------------------------------

export interface BudgetContext {
  guests: number;
  days: number;
  sessions: number;
  mealSessions: number;
  india: boolean;
  currency: CurrencyCode;
  cityFactor: number;
  fixedScale: number;
  perGuestScale: number;
  accessibilityNeeds: boolean;
}

export function budgetContext(brief: EventBrief): BudgetContext {
  const profile = eventTypeProfile(brief.type);
  const sessions = Math.max(1, brief.sessions.length);
  return {
    guests: Math.max(1, Math.round(brief.guestCount)),
    days: Math.max(1, Math.round(brief.durationDays)),
    sessions,
    mealSessions: Math.max(1, brief.sessions.filter((s) => s.hasMeal).length || 1),
    india: isIndia(brief.country),
    currency: brief.currency,
    cityFactor: cityCostFactor(brief.city, brief.country),
    fixedScale: profile.fixedScale,
    perGuestScale: profile.perGuestScale,
    accessibilityNeeds: brief.accessibility.length > 0,
  };
}

export function unitsFor(rule: UnitsRule, ctx: BudgetContext): number {
  if (rule === 'mealSessions') return ctx.mealSessions;
  if (rule === 'nights') return Math.max(1, ctx.days);
  return 1;
}

/** Rounding step for a rate in a currency: keeps numbers readable. */
export function rateStep(basis: 'fixed' | 'perGuest', currency: CurrencyCode): number {
  if (currency === 'INR') return basis === 'fixed' ? 1000 : 10;
  return basis === 'fixed' ? 10 : 1;
}

export function benchmarkRate(meta: CategoryMeta, tier: ScenarioKey, ctx: BudgetContext): number {
  const conversion = (ctx.india ? 1 : INTERNATIONAL_COST_INDEX) / REFERENCE_FX[ctx.currency];
  const base = meta.tiers[tier];
  if (meta.basis === 'perGuest') {
    const rate = base * ctx.perGuestScale * ctx.cityFactor * conversion;
    return Math.max(rateStep('perGuest', ctx.currency), roundTo(rate, rateStep('perGuest', ctx.currency)));
  }
  const shape = meta.scaling === 'perDay' ? 1 + 0.8 * (ctx.days - 1) : meta.scaling === 'perSession' ? 1 + 0.5 * (ctx.sessions - 1) : 1;
  const guestFactor = Math.pow(ctx.guests / 150, meta.guestExponent);
  const accessibility = meta.key === 'accessibility' && ctx.accessibilityNeeds ? 1.5 : 1;
  const total = base * ctx.fixedScale * shape * guestFactor * ctx.cityFactor * conversion * accessibility;
  return Math.max(rateStep('fixed', ctx.currency), roundTo(total, rateStep('fixed', ctx.currency)));
}

export function lineTotal(cat: Pick<BudgetCategory, 'basis' | 'planned' | 'units'>, guests: number): number {
  return cat.basis === 'perGuest' ? cat.planned * guests * Math.max(0, cat.units) : cat.planned;
}

export function quoteTotal(quote: Quote | null | undefined, guests: number): number {
  if (!quote) return 0;
  return quote.basis === 'perGuest' ? quote.amount * guests * Math.max(0, quote.units || 1) : quote.amount;
}

export const BOOKED_STATUSES = new Set(['booked', 'completed']);
export const ACTIVE_QUOTE_STATUSES = new Set(['quoted', 'shortlisted']);
export const INACTIVE_STATUSES = new Set(['rejected', 'cancelled']);

// ---------------------------------------------------------------------------
// Current plan summary
// ---------------------------------------------------------------------------

export type ForecastSource = 'committed' | 'quote' | 'estimate';

export interface CategoryLine {
  key: CategoryKey;
  label: string;
  basis: BudgetCategory['basis'];
  units: number;
  unitLabel: string;
  planned: number;
  plannedTotal: number;
  bestQuote: number | null;
  bestQuoteVendorId: string | null;
  preferredQuote: number | null;
  committed: number;
  paid: number;
  /** Paid to vendors later cancelled/rejected and not refunded. */
  sunk: number;
  outstanding: number;
  forecast: number;
  source: ForecastSource;
  variance: number;
  variancePct: number;
  vendorCount: number;
  bookedCount: number;
  /** True when the category exists only because a vendor references it. */
  synthetic: boolean;
}

export type Severity = 'danger' | 'warning' | 'info';

export interface BudgetWarning {
  id: string;
  severity: Severity;
  message: string;
  categoryKey?: CategoryKey;
}

export interface PaymentView extends Payment {
  vendorName: string;
  categoryKey: CategoryKey;
  daysUntil: number;
  overdue: boolean;
}

export interface BudgetSummary {
  currency: CurrencyCode;
  guests: number;
  ceiling: number;
  contingencyPct: number;
  lines: CategoryLine[];
  plannedSubtotal: number;
  plannedContingency: number;
  plannedTotal: number;
  forecastSubtotal: number;
  contingency: number;
  forecastTotal: number;
  committedTotal: number;
  paidTotal: number;
  sunkTotal: number;
  outstandingTotal: number;
  remaining: number;
  unallocated: number;
  costPerGuest: number;
  plannedPerGuest: number;
  /** Forecast cost of one additional guest (incl. contingency). */
  marginalGuestCost: number;
  utilisationPct: number;
  reconciles: boolean;
  warnings: BudgetWarning[];
  payments: PaymentView[];
  upcomingPayments: PaymentView[];
  scheduleGaps: { vendorId: string; vendorName: string; contract: number; scheduled: number }[];
}

export function computeBudget(plan: EventPlan, today: ISODate): BudgetSummary {
  const { brief, budget, vendors } = plan;
  const guests = Math.max(0, Math.round(brief.guestCount));
  const currency = brief.currency;
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const paidByVendor = new Map<string, number>();
  for (const p of budget.payments) {
    if (p.status === 'paid') paidByVendor.set(p.vendorId, (paidByVendor.get(p.vendorId) ?? 0) + p.amount);
  }

  // Every vendor's category must be represented so no committed money is dropped.
  const categories: (BudgetCategory & { synthetic?: boolean })[] = [...budget.categories];
  for (const v of vendors) {
    if (!categories.some((c) => c.key === v.category)) {
      const meta = categoryMeta(v.category);
      categories.push({
        key: v.category,
        label: meta?.label ?? v.category,
        basis: 'fixed',
        planned: 0,
        units: 1,
        unitLabel: '',
        notes: 'Added automatically because a vendor references this category.',
        essential: false,
        synthetic: true,
      });
    }
  }

  const lines: CategoryLine[] = categories.map((cat) => {
    const inCat = vendors.filter((v) => v.category === cat.key);
    const booked = inCat.filter((v) => BOOKED_STATUSES.has(v.status) && v.quote);
    const active = inCat.filter((v) => ACTIVE_QUOTE_STATUSES.has(v.status) && v.quote);
    const committed = sum(booked.map((v) => quoteTotal(v.quote, guests)));
    const preferred = active.find((v) => v.preferred);
    let best: Vendor | undefined = preferred;
    if (!best && active.length) {
      best = [...active].sort((a, b) => quoteTotal(a.quote, guests) - quoteTotal(b.quote, guests))[0];
    }
    const paid = sum(inCat.map((v) => paidByVendor.get(v.id) ?? 0));
    const sunk = sum(inCat.filter((v) => INACTIVE_STATUSES.has(v.status)).map((v) => paidByVendor.get(v.id) ?? 0));
    const paidToBooked = sum(booked.map((v) => paidByVendor.get(v.id) ?? 0));
    const plannedTotal = lineTotal(cat, guests);
    let source: ForecastSource = 'estimate';
    let base = plannedTotal;
    if (booked.length) {
      source = 'committed';
      base = committed;
    } else if (preferred) {
      source = 'quote';
      base = quoteTotal(preferred.quote, guests);
    }
    const forecast = base + sunk;
    const variance = forecast - plannedTotal;
    return {
      key: cat.key,
      label: cat.label,
      basis: cat.basis,
      units: cat.units,
      unitLabel: cat.unitLabel,
      planned: cat.planned,
      plannedTotal,
      bestQuote: best ? quoteTotal(best.quote, guests) : null,
      bestQuoteVendorId: best?.id ?? null,
      preferredQuote: preferred ? quoteTotal(preferred.quote, guests) : null,
      committed,
      paid,
      sunk,
      outstanding: Math.max(0, committed - paidToBooked),
      forecast,
      source,
      variance,
      variancePct: plannedTotal > 0 ? (variance / plannedTotal) * 100 : forecast > 0 ? 100 : 0,
      vendorCount: inCat.length,
      bookedCount: booked.length,
      synthetic: !!cat.synthetic,
    };
  });

  const pct = Math.max(0, budget.contingencyPct);
  const plannedSubtotal = sum(lines.map((l) => l.plannedTotal));
  const plannedContingency = Math.round((plannedSubtotal * pct) / 100);
  const plannedTotal = plannedSubtotal + plannedContingency;
  const forecastSubtotal = sum(lines.map((l) => l.forecast));
  const contingency = Math.round((forecastSubtotal * pct) / 100);
  const forecastTotal = forecastSubtotal + contingency;
  const committedTotal = sum(lines.map((l) => l.committed));
  const paidTotal = sum(lines.map((l) => l.paid));
  const sunkTotal = sum(lines.map((l) => l.sunk));
  const outstandingTotal = sum(lines.map((l) => l.outstanding));
  const ceiling = Math.max(0, brief.totalBudget);

  // Marginal guest: everything whose forecast scales with headcount.
  let perGuestForecast = 0;
  for (const cat of categories) {
    const inCat = vendors.filter((v) => v.category === cat.key);
    const booked = inCat.filter((v) => BOOKED_STATUSES.has(v.status) && v.quote);
    const preferred = inCat.find((v) => ACTIVE_QUOTE_STATUSES.has(v.status) && v.preferred && v.quote);
    if (booked.length) {
      perGuestForecast += sum(booked.filter((v) => v.quote!.basis === 'perGuest').map((v) => v.quote!.amount * (v.quote!.units || 1)));
    } else if (preferred) {
      if (preferred.quote!.basis === 'perGuest') perGuestForecast += preferred.quote!.amount * (preferred.quote!.units || 1);
    } else if (cat.basis === 'perGuest') {
      perGuestForecast += cat.planned * cat.units;
    }
  }
  const marginalGuestCost = perGuestForecast * (1 + pct / 100);

  // Payments
  const payments: PaymentView[] = budget.payments
    .map((p) => {
      const v = vendorById.get(p.vendorId);
      const daysUntil = diffDays(today, p.dueDate);
      return {
        ...p,
        vendorName: v?.name ?? 'Removed vendor',
        categoryKey: v?.category ?? 'unknown',
        daysUntil,
        overdue: p.status === 'scheduled' && daysUntil < 0,
      };
    })
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  const upcomingPayments = payments.filter((p) => p.status === 'scheduled');

  const scheduleGaps: BudgetSummary['scheduleGaps'] = [];
  for (const v of vendors) {
    if (!BOOKED_STATUSES.has(v.status) || !v.quote) continue;
    const contract = quoteTotal(v.quote, guests);
    const scheduled = sum(
      budget.payments.filter((p) => p.vendorId === v.id && (p.status === 'scheduled' || p.status === 'paid')).map((p) => p.amount),
    );
    if (Math.abs(contract - scheduled) >= 1) scheduleGaps.push({ vendorId: v.id, vendorName: v.name, contract, scheduled });
  }

  const warnings: BudgetWarning[] = [];
  const fmt = (n: number) => formatMoneyCompact(n, currency);
  if (forecastTotal > ceiling) {
    warnings.push({
      id: 'over-ceiling',
      severity: 'danger',
      message: `Forecast exceeds the ${fmt(ceiling)} budget by ${fmt(forecastTotal - ceiling)} (including contingency).`,
    });
  } else if (ceiling > 0 && forecastTotal > ceiling * 0.97) {
    warnings.push({
      id: 'near-ceiling',
      severity: 'warning',
      message: `Forecast is within 3% of the budget ceiling — only ${fmt(ceiling - forecastTotal)} of headroom left.`,
    });
  }
  if (plannedTotal > ceiling) {
    warnings.push({
      id: 'plan-over',
      severity: 'warning',
      message: `Planned allocations exceed the ceiling by ${fmt(plannedTotal - ceiling)}. Adjust allocations or adopt a scenario.`,
    });
  }
  for (const l of lines) {
    if (l.variance > 0 && l.plannedTotal > 0 && l.variancePct >= 3) {
      warnings.push({
        id: `var-${l.key}`,
        severity: l.variancePct >= 10 ? 'danger' : 'warning',
        categoryKey: l.key,
        message: `${l.label} forecast is ${fmt(l.variance)} (${l.variancePct.toFixed(1)}%) over its allocation${l.source === 'committed' ? ' — based on a booked contract' : l.source === 'quote' ? ' — based on the preferred quotation' : ''}.`,
      });
    }
    if (l.plannedTotal === 0 && l.forecast > 0) {
      warnings.push({
        id: `unplanned-${l.key}`,
        severity: 'warning',
        categoryKey: l.key,
        message: `${l.label} has ${fmt(l.forecast)} of costs but no allocation.`,
      });
    }
    if (l.sunk > 0) {
      warnings.push({
        id: `sunk-${l.key}`,
        severity: 'warning',
        categoryKey: l.key,
        message: `${fmt(l.sunk)} already paid to a cancelled ${l.label.toLowerCase()} vendor is counted as spent until a refund is recorded.`,
      });
    }
  }
  if (pct < 5)
    warnings.push({
      id: 'low-contingency',
      severity: 'info',
      message: `Contingency is ${pct}% — most planners hold 5–10% for late changes.`,
    });
  for (const p of upcomingPayments) {
    if (p.overdue)
      warnings.push({
        id: `pay-over-${p.id}`,
        severity: 'danger',
        message: `${p.label} to ${p.vendorName} (${fmt(p.amount)}) was due ${-p.daysUntil} days ago.`,
      });
    else if (p.daysUntil <= 14)
      warnings.push({
        id: `pay-soon-${p.id}`,
        severity: 'info',
        message: `${p.label} to ${p.vendorName} (${fmt(p.amount)}) is due in ${p.daysUntil} days.`,
      });
  }
  for (const g of scheduleGaps) {
    const diff = g.contract - g.scheduled;
    warnings.push({
      id: `gap-${g.vendorId}`,
      severity: 'warning',
      message:
        diff > 0
          ? `Payment schedule for ${g.vendorName} covers ${fmt(g.scheduled)} of a ${fmt(g.contract)} contract — ${fmt(diff)} is unscheduled.`
          : `Payment schedule for ${g.vendorName} totals ${fmt(g.scheduled)}, ${fmt(-diff)} more than the ${fmt(g.contract)} contract.`,
    });
  }

  return {
    currency,
    guests,
    ceiling,
    contingencyPct: pct,
    lines,
    plannedSubtotal,
    plannedContingency,
    plannedTotal,
    forecastSubtotal,
    contingency,
    forecastTotal,
    committedTotal,
    paidTotal,
    sunkTotal,
    outstandingTotal,
    remaining: ceiling - forecastTotal,
    unallocated: ceiling - plannedTotal,
    costPerGuest: guests > 0 ? forecastTotal / guests : 0,
    plannedPerGuest: guests > 0 ? plannedTotal / guests : 0,
    marginalGuestCost,
    utilisationPct: ceiling > 0 ? (forecastTotal / ceiling) * 100 : 0,
    reconciles: Math.abs(sum(lines.map((l) => l.forecast)) + contingency - forecastTotal) < 1,
    warnings,
    payments,
    upcomingPayments,
    scheduleGaps,
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export interface ScenarioLine {
  key: CategoryKey;
  label: string;
  basis: BudgetCategory['basis'];
  units: number;
  unitLabel: string;
  rate: number;
  total: number;
  tier: ScenarioKey;
  protected: boolean;
  adjusted: boolean;
  overridden: boolean;
  planTotal: number;
  delta: number;
  note: string;
}

export interface Scenario {
  key: ScenarioKey;
  label: string;
  lines: ScenarioLine[];
  subtotal: number;
  contingency: number;
  total: number;
  perGuest: number;
  ceiling: number;
  withinCeiling: boolean;
  deltaVsPlan: number;
  deltaVsForecast: number;
  reconciles: boolean;
  notes: string[];
  tradeoffs: string[];
}

interface WorkLine {
  cat: BudgetCategory;
  meta?: CategoryMeta;
  protected: boolean;
  /** The level this scenario aims for on this line. */
  intended: ScenarioKey;
  total: number;
  tierTotals: Record<ScenarioKey, number>;
  adjusted: boolean;
}

function tierRate(cat: BudgetCategory, meta: CategoryMeta | undefined, tier: ScenarioKey, ctx: BudgetContext): number {
  if (meta && meta.basis === cat.basis) return benchmarkRate(meta, tier, ctx);
  // Custom categories (or a basis the planner changed): scale the planner's own number.
  const f = tier === 'lean' ? 0.85 : tier === 'premium' ? 1.25 : 1;
  return roundTo(cat.planned * f, rateStep(cat.basis, ctx.currency));
}

function totalFor(cat: BudgetCategory, rate: number, guests: number): number {
  return lineTotal({ basis: cat.basis, planned: rate, units: cat.units }, guests);
}

const NEXT_TIER: Record<ScenarioKey, ScenarioKey> = { lean: 'balanced', balanced: 'premium', premium: 'premium' };

/**
 * Trimming order used to fit a scenario under the ceiling. Unprotected lines
 * give way first; protected lines are only trimmed once everything else has
 * reached the same floor. Lean is never trimmed (it is the floor).
 */
const FIT_STAGES: Record<ScenarioKey, { protected: boolean; floor: ScenarioKey }[]> = {
  lean: [],
  balanced: [
    { protected: false, floor: 'lean' },
    { protected: true, floor: 'balanced' },
    { protected: true, floor: 'lean' },
  ],
  premium: [
    { protected: false, floor: 'balanced' },
    { protected: true, floor: 'balanced' },
    { protected: false, floor: 'lean' },
    { protected: true, floor: 'lean' },
  ],
};

/** Reduce totals stage by stage so the subtotal fits `maxSubtotal`. Returns the remaining excess. */
function fitToCeiling(lines: WorkLine[], maxSubtotal: number, key: ScenarioKey): number {
  let excess = sum(lines.map((l) => l.total)) - maxSubtotal;
  for (const stage of FIT_STAGES[key]) {
    if (excess <= 0) break;
    const group = lines.filter((l) => l.protected === stage.protected);
    const reducible = group.map((l) => Math.max(0, l.total - Math.min(l.total, l.tierTotals[stage.floor])));
    const R = sum(reducible);
    if (R <= 0) continue;
    const share = Math.min(1, excess / R);
    group.forEach((l, i) => {
      if (reducible[i] > 0) {
        l.total -= reducible[i] * share;
        l.adjusted = true;
      }
    });
    excess -= Math.min(R, excess);
  }
  return Math.max(0, excess);
}

/** The level a line actually lands on after fitting (labels must not overstate). */
function effectiveTier(total: number, tiers: Record<ScenarioKey, number>, intended: ScenarioKey): ScenarioKey {
  const order: ScenarioKey[] = ['premium', 'balanced', 'lean'];
  for (const t of order.slice(order.indexOf(intended))) if (total >= tiers[t] * 0.985) return t;
  return 'lean';
}

export function computeScenario(plan: EventPlan, key: ScenarioKey, summary?: BudgetSummary, today = '1970-01-01'): Scenario {
  const brief = plan.brief;
  const ctx = budgetContext(brief);
  const guests = ctx.guests;
  const pct = Math.max(0, plan.budget.contingencyPct);
  const ceiling = Math.max(0, brief.totalBudget);
  const protectedSet = new Set(brief.protectedCategories);
  const current = summary ?? computeBudget(plan, today);
  const notes: string[] = [];

  const work: WorkLine[] = plan.budget.categories.map((cat) => {
    const meta = categoryMeta(cat.key);
    const isProtected = protectedSet.has(cat.key);
    const intended: ScenarioKey = isProtected ? NEXT_TIER[key] : key;
    const tierTotals = {
      lean: totalFor(cat, tierRate(cat, meta, 'lean', ctx), guests),
      balanced: totalFor(cat, tierRate(cat, meta, 'balanced', ctx), guests),
      premium: totalFor(cat, tierRate(cat, meta, 'premium', ctx), guests),
    };
    return { cat, meta, protected: isProtected, intended, total: tierTotals[intended], tierTotals, adjusted: false };
  });

  const maxSubtotal = ceiling / (1 + pct / 100);
  if (key !== 'lean') {
    if (key === 'premium' && plan.budget.allowPremiumOverCeiling) {
      notes.push('Over-ceiling comparison enabled: premium rates are shown uncapped.');
    } else {
      const before = sum(work.map((l) => l.total));
      const left = fitToCeiling(work, maxSubtotal, key);
      if (before > maxSubtotal) {
        const touchedProtected = work.some((l) => l.protected && l.adjusted);
        notes.push(
          left > 0
            ? `Even after trimming every category to lean levels, this scenario is ${formatMoneyCompact(left * (1 + pct / 100), brief.currency)} over the ceiling.`
            : `Trimmed ${touchedProtected ? 'categories (unprotected first, then protected)' : 'unprotected categories'} by ${formatMoneyCompact(before - maxSubtotal, brief.currency)} to respect your ${formatMoneyCompact(ceiling, brief.currency)} ceiling.`,
        );
      }
    }
  }

  const overrides = plan.budget.scenarioOverrides[key] ?? {};
  const planLines = new Map(current.lines.map((l) => [l.key, l]));
  const lines: ScenarioLine[] = work.map((w) => {
    const step = rateStep(w.cat.basis, brief.currency);
    const divisor = w.cat.basis === 'perGuest' ? guests * Math.max(1e-9, w.cat.units) : 1;
    let rate = Math.max(0, roundTo(w.total / divisor, step));
    const overridden = Object.prototype.hasOwnProperty.call(overrides, w.cat.key);
    if (overridden) rate = Math.max(0, overrides[w.cat.key]);
    const total = totalFor(w.cat, rate, guests);
    const planTotal = planLines.get(w.cat.key)?.plannedTotal ?? 0;
    const tier = overridden ? w.intended : effectiveTier(w.total, w.tierTotals, w.intended);
    const tierText = w.meta
      ? tier === 'lean'
        ? w.meta.leanTradeoff
        : tier === 'premium'
          ? w.meta.premiumUpgrade
          : w.meta.description
      : 'Custom category scaled from your own allocation.';
    return {
      key: w.cat.key,
      label: w.cat.label,
      basis: w.cat.basis,
      units: w.cat.units,
      unitLabel: w.cat.unitLabel,
      rate,
      total,
      tier,
      protected: w.protected,
      adjusted: w.adjusted && !overridden,
      overridden,
      planTotal,
      delta: total - planTotal,
      note: overridden ? 'Edited by planner.' : w.adjusted ? `Trimmed to fit the ceiling. ${tierText}` : tierText,
    };
  });

  // Rounding can push a fitted scenario a few rupees over; correct on the largest flexible fixed line.
  let subtotal = sum(lines.map((l) => l.total));
  let contingency = Math.round((subtotal * pct) / 100);
  const capped = key !== 'lean' && !(key === 'premium' && plan.budget.allowPremiumOverCeiling);
  if (capped && subtotal + contingency > ceiling && subtotal + contingency - ceiling < rateStep('fixed', brief.currency) * 20) {
    const flex = lines.filter((l) => l.basis === 'fixed' && !l.protected && !l.overridden).sort((a, b) => b.total - a.total)[0];
    if (flex) {
      const over = subtotal + contingency - ceiling;
      const cut = Math.ceil(over / (1 + pct / 100) / rateStep('fixed', brief.currency) + 1) * rateStep('fixed', brief.currency);
      flex.rate = Math.max(0, flex.rate - cut);
      flex.total = flex.rate;
      flex.delta = flex.total - flex.planTotal;
      subtotal = sum(lines.map((l) => l.total));
      contingency = Math.round((subtotal * pct) / 100);
    }
  }
  const total = subtotal + contingency;
  if (key === 'lean' && total > ceiling)
    notes.push('Even the lean scenario exceeds the ceiling — consider fewer guests, sessions or a revised budget.');
  if (lines.some((l) => l.overridden)) notes.push('Includes planner edits — reset to regenerate from benchmarks.');

  const tradeoffs: string[] = [];
  const sortedByDelta = [...lines].sort((a, b) => a.delta - b.delta);
  if (key === 'lean') {
    for (const l of sortedByDelta.filter((l) => !l.protected && l.delta < 0).slice(0, 5))
      tradeoffs.push(`${l.label}: ${categoryMeta(l.key)?.leanTradeoff ?? 'Reduced from your current allocation.'}`);
    for (const l of lines.filter((l) => l.protected)) tradeoffs.push(`${l.label} is protected and kept at a balanced level.`);
  } else if (key === 'balanced') {
    for (const l of lines.filter((l) => l.protected))
      tradeoffs.push(`${l.label} is protected and lifted to premium: ${categoryMeta(l.key)?.premiumUpgrade ?? 'upgraded.'}`);
    for (const l of lines.filter((l) => l.adjusted).slice(0, 4)) tradeoffs.push(`${l.label} trimmed toward lean to stay within budget.`);
    if (!tradeoffs.length) tradeoffs.push('Every category sits at a balanced level with no trims required.');
  } else {
    for (const l of [...lines]
      .sort((a, b) => b.delta - a.delta)
      .filter((l) => l.delta > 0)
      .slice(0, 5)) {
      tradeoffs.push(`${l.label}: ${categoryMeta(l.key)?.premiumUpgrade ?? 'Upgraded.'}`);
    }
    for (const l of lines.filter((l) => l.adjusted).slice(0, 3))
      tradeoffs.push(`${l.label} held closer to balanced so the plan fits the ceiling.`);
  }

  return {
    key,
    label: SCENARIO_LABEL[key],
    lines,
    subtotal,
    contingency,
    total,
    perGuest: guests > 0 ? total / guests : 0,
    ceiling,
    withinCeiling: total <= ceiling,
    deltaVsPlan: total - current.plannedTotal,
    deltaVsForecast: total - current.forecastTotal,
    reconciles: sum(lines.map((l) => l.total)) + contingency === total,
    notes,
    tradeoffs,
  };
}

export function computeScenarios(plan: EventPlan, today: ISODate): Record<ScenarioKey, Scenario> {
  const summary = computeBudget(plan, today);
  return {
    lean: computeScenario(plan, 'lean', summary, today),
    balanced: computeScenario(plan, 'balanced', summary, today),
    premium: computeScenario(plan, 'premium', summary, today),
  };
}

/** Initial categories for a new event: the balanced scenario fitted to the stated budget. */
export function initialCategories(brief: EventBrief, contingencyPct: number): BudgetCategory[] {
  const ctx = budgetContext(brief);
  const profile = eventTypeProfile(brief.type);
  const cats: BudgetCategory[] = CATEGORY_META.filter((m) => profile.categories.includes(m.key)).map((meta) => ({
    key: meta.key,
    label: meta.label,
    basis: meta.basis,
    planned: benchmarkRate(meta, 'balanced', ctx),
    units: unitsFor(meta.units, ctx),
    unitLabel: meta.unitLabel,
    notes: meta.description,
    essential: meta.essential,
  }));
  const draft = {
    brief,
    budget: {
      categories: cats,
      contingencyPct,
      payments: [],
      scenarioOverrides: { lean: {}, balanced: {}, premium: {} },
      allowPremiumOverCeiling: false,
    },
    vendors: [],
  } as unknown as EventPlan;
  const balanced = computeScenario(draft, 'balanced');
  return cats.map((c) => ({ ...c, planned: balanced.lines.find((l) => l.key === c.key)?.rate ?? c.planned }));
}
