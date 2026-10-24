import { describe, expect, it } from 'vitest';
import { computeBudget, computeScenarios, quoteTotal } from '../src/domain/budget';
import { guestsFromCSV, guestsToCSV, summarizeGuests } from '../src/domain/guests';
import { createDemoPlan } from '../src/domain/demo';
import { emptyIntake, generatePlan, validateIntake } from '../src/domain/generator';
import { makeBackup, parseBackup } from '../src/domain/io';
import { applyOps, applyVendorStatus, validateOps } from '../src/domain/ops';
import { analyzeRunOfShow } from '../src/domain/runOfShow';
import { analyzeTimeline, rescheduleForEventDate, wouldCreateCycle } from '../src/domain/timeline';
import { addDays, deepClone, formatMoney, formatMoneyCompact } from '../src/domain/util';
import { budgetCSV, timelineICS } from '../src/domain/exports';
import { csvCell, parseCSV } from '../src/domain/csv';

const TODAY = '2026-10-23';
const demo = () => createDemoPlan(TODAY);

describe('money formatting', () => {
  it('uses Indian digit grouping and lakh/crore compaction', () => {
    expect(formatMoney(7_500_000, 'INR')).toBe('₹75,00,000');
    expect(formatMoneyCompact(7_774_464, 'INR')).toBe('₹77.74 L');
    expect(formatMoneyCompact(12_500_000, 'INR')).toBe('₹1.25 Cr');
    expect(formatMoneyCompact(45_000, 'INR')).toBe('₹45,000');
    expect(formatMoneyCompact(-250_000, 'INR')).toBe('−₹2.5 L');
    expect(formatMoneyCompact(45_200, 'USD')).toBe('$45.2K');
  });
});

describe('budget engine (demo plan)', () => {
  it('reconciles categories + contingency to the total, with known figures', () => {
    const b = computeBudget(demo(), TODAY);
    expect(b.reconciles).toBe(true);
    expect(b.forecastSubtotal).toBe(7_334_400);
    expect(b.contingency).toBe(440_064);
    expect(b.forecastTotal).toBe(7_774_464);
    expect(b.remaining).toBe(225_536);
    expect(b.committedTotal).toBe(1_764_000 + 1_180_000 + 560_000 + 50_400);
    expect(b.paidTotal).toBe(529_200 + 472_000 + 280_000 + 50_400);
    expect(b.costPerGuest).toBeCloseTo(7_774_464 / 180, 5);
    const catering = b.lines.find((l) => l.key === 'catering')!;
    expect(catering.source).toBe('committed');
    expect(catering.variance).toBe(1_764_000 - 1_656_000);
  });

  it('recalculates every dependent figure when the guest count changes', () => {
    const p = demo();
    p.brief.guestCount = 200;
    const b = computeBudget(p, TODAY);
    expect(b.lines.find((l) => l.key === 'catering')!.committed).toBe(2_450 * 200 * 4);
    expect(b.forecastTotal).toBeGreaterThan(7_774_464);
    expect(b.remaining).toBeLessThan(0);
    expect(b.warnings.some((w) => w.id === 'over-ceiling')).toBe(true);
    expect(b.scheduleGaps.some((g) => g.vendorId === 'v_cat1')).toBe(true);
    expect(b.costPerGuest).toBeCloseTo(b.forecastTotal / 200, 5);
  });

  it('recalculates when a booked vendor quote is edited', () => {
    const p = demo();
    const before = computeBudget(p, TODAY).forecastTotal;
    p.vendors.find((v) => v.id === 'v_dec1')!.quote!.amount = 1_080_000;
    const after = computeBudget(p, TODAY);
    expect(after.lines.find((l) => l.key === 'decor')!.forecast).toBe(1_080_000);
    expect(after.forecastSubtotal).toBe(7_334_400 - 100_000);
    expect(after.forecastTotal).toBe(7_234_400 + Math.round(7_234_400 * 0.06));
    expect(before).toBeGreaterThan(after.forecastTotal);
  });

  it('counts money paid to a cancelled vendor as sunk until refunded', () => {
    const p = demo();
    applyVendorStatus(p, 'v_dec1', 'cancelled', TODAY);
    const b = computeBudget(p, TODAY);
    const decor = b.lines.find((l) => l.key === 'decor')!;
    expect(decor.committed).toBe(0);
    expect(decor.sunk).toBe(472_000);
    expect(decor.forecast).toBe(1_150_000 + 472_000);
    p.budget.payments.find((x) => x.id === 'p04')!.status = 'refunded';
    expect(computeBudget(p, TODAY).lines.find((l) => l.key === 'decor')!.sunk).toBe(0);
  });

  it('never drops a vendor whose category has no allocation', () => {
    const p = demo();
    p.vendors.push({
      ...deepClone(p.vendors[0]),
      id: 'v_x',
      category: 'fireworks',
      status: 'booked',
      quote: { basis: 'fixed', amount: 50_000, units: 1, deliverables: '' },
    });
    const b = computeBudget(p, TODAY);
    const line = b.lines.find((l) => l.key === 'fireworks')!;
    expect(line.synthetic).toBe(true);
    expect(line.forecast).toBe(50_000);
    expect(b.warnings.some((w) => w.id === 'unplanned-fireworks')).toBe(true);
  });
});

describe('scenarios', () => {
  it('reconcile, are ordered lean ≤ balanced ≤ premium, and respect the ceiling', () => {
    const p = demo();
    const s = computeScenarios(p, TODAY);
    for (const k of ['lean', 'balanced', 'premium'] as const) {
      const x = s[k];
      expect(x.reconciles).toBe(true);
      expect(x.lines.reduce((a, l) => a + l.total, 0) + x.contingency).toBe(x.total);
    }
    expect(s.lean.total).toBeLessThanOrEqual(s.balanced.total);
    // When both are capped at the ceiling they can differ by rounding only.
    expect(s.premium.total).toBeGreaterThanOrEqual(s.balanced.total - p.brief.totalBudget * 0.001);
    expect(s.balanced.total).toBeLessThanOrEqual(p.brief.totalBudget);
    expect(s.premium.total).toBeLessThanOrEqual(p.brief.totalBudget);
    const photoBal = s.balanced.lines.find((l) => l.key === 'photography')!;
    expect(photoBal.protected).toBe(true);
    expect(photoBal.tier).toBe('premium');
  });

  it('can show an uncapped premium comparison only when explicitly enabled', () => {
    const p = demo();
    p.budget.allowPremiumOverCeiling = true;
    const s = computeScenarios(p, TODAY);
    expect(s.premium.total).toBeGreaterThan(p.brief.totalBudget);
    expect(s.premium.notes.join(' ')).toMatch(/uncapped/);
  });

  it('applies planner overrides and still reconciles', () => {
    const p = demo();
    p.budget.scenarioOverrides.lean = { venue: 1_000_000 };
    const s = computeScenarios(p, TODAY).lean;
    expect(s.lines.find((l) => l.key === 'venue')!.total).toBe(1_000_000);
    expect(s.reconciles).toBe(true);
  });
});

describe('timeline engine', () => {
  it('moves relative tasks, preserves completed work and pinned dates', () => {
    const p = demo();
    p.tasks.find((t) => t.id === 't33')!.schedule = 'pinned';
    const newDate = addDays(p.brief.eventDate, -14);
    const { tasks, report } = rescheduleForEventDate(p, newDate, TODAY);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    for (const t of p.tasks.filter((x) => x.status === 'done')) expect(byId.get(t.id)!.dueDate).toBe(t.dueDate);
    expect(byId.get('t33')!.dueDate).toBe(p.tasks.find((t) => t.id === 't33')!.dueDate);
    expect(byId.get('t29')!.dueDate).toBe(addDays(p.tasks.find((t) => t.id === 't29')!.dueDate, -14));
    expect(report.deltaDays).toBe(-14);
    expect(report.preserved.length).toBe(p.tasks.filter((t) => t.status === 'done').length);
    expect(report.compressed.length).toBeGreaterThan(0);
    for (const c of report.compressed) expect(byId.get(c.id)!.dueDate).toBe(TODAY);
  });

  it('flags venue-dependent, overdue and vendor-dependent work', () => {
    const p = demo();
    const a = analyzeTimeline(p, TODAY);
    expect(a.venueBlocked.map((t) => t.id).sort()).toEqual(['t07', 't08', 't11', 't16', 't18', 't25', 't32'].sort());
    expect(a.overdue.map((t) => t.id)).toContain('t27');
    expect(a.daysToEvent).toBe(120);
    applyVendorStatus(p, 'v_venue1', 'booked', TODAY);
    const b = analyzeTimeline(p, TODAY);
    expect(p.brief.venueStatus).toBe('confirmed');
    expect(b.venueBlocked.length).toBe(0);
    expect(p.tasks.find((t) => t.id === 't06')!.status).toBe('done');
  });

  it('detects cycles before they are created', () => {
    const p = demo();
    expect(wouldCreateCycle(p.tasks, 't05', 't07')).toBe(true);
    expect(wouldCreateCycle(p.tasks, 't07', 't33')).toBe(false);
  });
});

describe('run of show', () => {
  it('detects the curfew breach and the missing setup window in the demo', () => {
    const issues = analyzeRunOfShow(demo());
    expect(issues.map((i) => `${i.kind}:${i.itemId}`).sort()).toEqual(['curfew:r04', 'setup:r09']);
  });

  it('detects overlaps and dependency breaks', () => {
    const p = demo();
    p.runOfShow.find((r) => r.id === 'r06')!.start = '09:00';
    const kinds = analyzeRunOfShow(p).map((i) => i.kind);
    expect(kinds).toContain('overlap');
    expect(kinds).toContain('dependency');
  });
});

describe('operations', () => {
  it('rejects invalid changes before they can be applied', () => {
    const p = demo();
    const errors = validateOps(
      p,
      [
        { op: 'setEventDate', date: '2020-01-01' },
        { op: 'setVendorStatus', vendorId: 'nope', status: 'booked' },
        { op: 'setCategoryPlanned', key: 'unknown', planned: 10 },
        { op: 'setGuestCount', count: -5 } as never,
      ],
      TODAY,
    );
    expect(errors).toHaveLength(4);
  });

  it('does not mutate the source plan', () => {
    const p = demo();
    const snapshot = JSON.stringify(p);
    applyOps(
      p,
      [
        { op: 'setGuestCount', count: 250 },
        { op: 'setEventDate', date: addDays(p.brief.eventDate, 7) },
      ],
      TODAY,
    );
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});

describe('guests & CSV', () => {
  it('summarises RSVPs and projects attendance', () => {
    const s = summarizeGuests(demo().guests);
    expect(s.invited).toBe(s.confirmed + s.pending + s.declined + s.tentative);
    expect(s.projected).toBe(Math.round(s.confirmed + s.pending * 0.7 + s.tentative * 0.5));
  });

  it('round-trips guests through CSV and neutralises formula injection', () => {
    const guests = demo().guests.slice(0, 5);
    guests[0].notes = '=HYPERLINK("http://x")';
    const csv = guestsToCSV(guests);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    const back = guestsFromCSV(csv);
    expect(back.guests).toHaveLength(5);
    expect(back.guests[0].notes).toBe('=HYPERLINK("http://x")');
    expect(back.guests.map((g) => g.rsvp)).toEqual(guests.map((g) => g.rsvp));
  });

  it('reports malformed rows instead of importing them', () => {
    const r = guestsFromCSV('Name,Party size,RSVP\nAsha,2,yes\n,1,no\nRavi,abc,maybe\nMina,1,whatever');
    expect(r.guests.map((g) => g.name)).toEqual(['Asha', 'Mina']);
    expect(r.skipped).toBe(2);
    expect(r.errors.length).toBe(3);
    expect(guestsFromCSV('Email\nx@y.z').errors[0]).toMatch(/Name/);
    expect(() => parseCSV('"unclosed')).toThrow();
    expect(csvCell('-1')).toBe("'-1");
  });
});

describe('import / export', () => {
  it('round-trips a backup and rejects malformed files', () => {
    const p = demo();
    const ok = parseBackup(JSON.stringify(makeBackup(p)));
    expect(ok.ok).toBe(true);
    expect(parseBackup('{not json').ok).toBe(false);
    expect(parseBackup('{"hello":1}').ok).toBe(false);
    const broken = makeBackup(p) as unknown as { plan: { brief: { eventDate: string } } };
    broken.plan.brief.eventDate = '31-12-2026';
    const bad = parseBackup(JSON.stringify(broken));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join(' ')).toMatch(/eventDate/);
  });

  it('exports current values, not seed values', () => {
    const p = demo();
    p.budget.categories.find((c) => c.key === 'venue')!.planned = 1_234_000;
    expect(budgetCSV(p, TODAY)).toContain('1234000');
    expect(timelineICS(p)).toContain('BEGIN:VCALENDAR');
  });
});

describe('event generation from intake', () => {
  it('builds a brief and plan that reflect the intake', () => {
    const d = {
      ...emptyIntake(TODAY),
      name: 'Ira turns 40',
      type: 'birthday' as const,
      city: 'Bengaluru',
      eventDate: addDays(TODAY, 52),
      guestCount: 85,
      totalBudget: 1_200_000,
      sessionCount: 2,
      sessionNames: 'Sunset cocktails, Dinner',
    };
    expect(validateIntake(d, TODAY)).toEqual({});
    const p = generatePlan(d, TODAY);
    expect(p.brief.name).toBe('Ira turns 40');
    expect(p.brief.guestCount).toBe(85);
    expect(p.brief.sessions.map((s) => s.name)).toEqual(['Sunset cocktails', 'Dinner']);
    expect(p.narrative.vision).toContain('Bengaluru');
    expect(p.narrative.assumptions.some((a) => /No ceremonial or cultural requirements/.test(a.text))).toBe(true);
    const b = computeBudget(p, TODAY);
    expect(b.plannedTotal).toBeLessThanOrEqual(1_200_000);
    expect(p.tasks.every((t) => t.dueDate >= TODAY)).toBe(true);
    expect(p.budget.categories.some((c) => c.key === 'accommodation')).toBe(false);
  });

  it('rejects impossible input', () => {
    const e = validateIntake({ ...emptyIntake(TODAY), name: '', eventDate: '2025-01-01', guestCount: 0, totalBudget: -1 }, TODAY);
    expect(Object.keys(e).sort()).toEqual(['eventDate', 'guestCount', 'name', 'totalBudget']);
  });

  it('quote totals scale per guest', () => {
    expect(quoteTotal({ basis: 'perGuest', amount: 2450, units: 4, deliverables: '' }, 180)).toBe(1_764_000);
  });
});
