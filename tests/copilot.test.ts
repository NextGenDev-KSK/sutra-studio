import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { respond, parseShift, parseAmount, parseDate } from '../src/copilot/engine';
import { fromFlatOp } from '../src/copilot/modelSchema';
import { computeBudget } from '../src/domain/budget';
import { createDemoPlan } from '../src/domain/demo';
import { applyOps, validateOps } from '../src/domain/ops';
import { analyzeTimeline } from '../src/domain/timeline';
import { addDays } from '../src/domain/util';
import { createCopilotHandler } from '../server/copilotApi';

const TODAY = '2026-10-23';
const demo = () => createDemoPlan(TODAY);

describe('request parsing', () => {
  it('parses shifts, amounts and dates', () => {
    expect(parseShift('move the event two weeks earlier')).toBe(-14);
    expect(parseShift('postpone by 10 days')).toBe(10);
    expect(parseShift('push back a month')).toBe(30);
    expect(parseAmount('cut ₹5 lakh')).toBe(500_000);
    expect(parseAmount('reduce by 2.5 crore')).toBe(25_000_000);
    expect(parseDate('move it to 14 March 2027', TODAY)).toBe('2027-03-14');
    expect(parseDate('move it to 2027-04-01', TODAY)).toBe('2027-04-01');
  });
});

describe('co-pilot intents', () => {
  it('reduces spend without touching protected photography', () => {
    const p = demo();
    const r = respond('Reduce the total budget by 15% without cutting photography quality.', p, TODAY);
    expect(r.proposal).toBeDefined();
    const ops = r.proposal!.ops;
    expect(ops.some((o) => o.op === 'setCategoryPlanned' && o.key === 'photography')).toBe(false);
    expect(ops.some((o) => o.op === 'setCategoryPlanned' && (o.key === 'accessibility' || o.key === 'permits'))).toBe(false);
    expect(validateOps(p, ops, TODAY)).toEqual([]);
    const before = computeBudget(p, TODAY);
    const after = computeBudget(applyOps(p, ops, TODAY).plan, TODAY);
    expect(after.forecastTotal).toBeLessThan(before.forecastTotal);
    expect(r.proposal!.tradeoffs.join(' ')).toMatch(/Not changed/);
  });

  it('moves the event and reschedules', () => {
    const p = demo();
    const r = respond('Move the event two weeks earlier and update the timeline.', p, TODAY);
    const op = r.proposal!.ops.find((o) => o.op === 'setEventDate');
    expect(op).toEqual({ op: 'setEventDate', date: addDays(p.brief.eventDate, -14) });
    const { plan } = applyOps(p, r.proposal!.ops, TODAY);
    expect(plan.brief.eventDate).toBe(addDays(p.brief.eventDate, -14));
    expect(plan.lastScheduleChange?.moved.length).toBeGreaterThan(0);
  });

  it('plans a recovery when the decorator cancels', () => {
    const p = demo();
    const r = respond('Our decorator cancelled. What does this affect?', p, TODAY);
    const ops = r.proposal!.ops;
    expect(ops[0]).toEqual({ op: 'setVendorStatus', vendorId: 'v_dec1', status: 'cancelled' });
    expect(validateOps(p, ops, TODAY)).toEqual([]);
    const { plan } = applyOps(p, ops, TODAY);
    const b = computeBudget(plan, TODAY);
    const decor = b.lines.find((l) => l.key === 'decor')!;
    expect(decor.committed).toBe(0);
    expect(decor.sunk).toBe(472_000);
    expect(plan.vendors.find((v) => v.id === 'v_dec2')!.preferred).toBe(true);
    expect(['t16', 't17', 't18'].map((id) => plan.tasks.find((t) => t.id === id)!.status)).toEqual(['blocked', 'blocked', 'blocked']);
    expect(plan.tasks.find((t) => t.id === 't15')!.status).toBe('todo');
    expect(plan.runOfShow.filter((x) => x.vendorIds.includes('v_dec1')).every((x) => x.status === 'at_risk')).toBe(true);
    expect(plan.budget.payments.find((x) => x.id === 'p05')!.status).toBe('cancelled');
    expect(analyzeTimeline(plan, TODAY).vendorBlocked.length).toBeGreaterThan(0);
  });

  it('weather-proofs only the requested outdoor session', () => {
    const p = demo();
    const r = respond('Suggest a monsoon-friendly alternative for the outdoor reception.', p, TODAY);
    const sessionOps = r.proposal!.ops.filter((o) => o.op === 'updateSession');
    expect(sessionOps).toEqual([{ op: 'updateSession', sessionId: 's_reception', setting: 'covered' }]);
    expect(r.proposal!.reason).toMatch(/outside the typical monsoon/);
  });

  it('answers informational questions without proposing changes', () => {
    const p = demo();
    for (const q of [
      'Which decisions must I make this week?',
      'Find the biggest financial risks in this plan.',
      "Summarize today's progress for the client.",
      'Compare two vendor quotations.',
    ]) {
      const r = respond(q, p, TODAY);
      expect(r.proposal).toBeUndefined();
      expect(r.blocks.length).toBeGreaterThan(0);
    }
    const summary = respond("Summarize today's progress for the client.", p, TODAY).blocks[0];
    expect(summary.kind === 'text' && summary.body).toBeTruthy();
    for (const g of p.guests.slice(0, 10)) expect(JSON.stringify(summary)).not.toContain(g.name);
  });

  it('builds vegetarian and eco proposals that validate', () => {
    const p = demo();
    for (const q of [
      'Create a premium vegetarian catering plan.',
      'Propose an eco-conscious version of this event.',
      'Increase contingency to 8%',
      'Plan for 200 guests',
      'Set the budget to ₹85 lakh',
    ]) {
      const r = respond(q, p, TODAY);
      expect(r.proposal, q).toBeDefined();
      expect(validateOps(p, r.proposal!.ops, TODAY), q).toEqual([]);
    }
  });

  it('falls back helpfully for requests it cannot handle', () => {
    const r = respond('Write me a poem about elephants', demo(), TODAY);
    expect(r.proposal).toBeUndefined();
    expect(r.text).toMatch(/not sure/);
  });

  it('refuses impossible date moves', () => {
    const r = respond('Move the event 200 days earlier', demo(), TODAY);
    expect(r.proposal).toBeUndefined();
    expect(r.text).toMatch(/not in the future/);
  });
});

describe('model output validation', () => {
  const nulls = {
    categoryKey: null,
    planned: null,
    pct: null,
    count: null,
    amount: null,
    date: null,
    title: null,
    workstream: null,
    offsetDays: null,
    durationDays: null,
    priority: null,
    notes: null,
    taskId: null,
    status: null,
    vendorId: null,
    sessionId: null,
    setting: null,
    itemId: null,
    field: null,
    value: null,
    text: null,
  };
  it('converts valid flat ops and rejects malformed ones', () => {
    expect(fromFlatOp({ ...nulls, op: 'setGuestCount', count: 200 }).op).toEqual({ op: 'setGuestCount', count: 200 });
    expect(fromFlatOp({ ...nulls, op: 'setGuestCount', count: -3 }).error).toBeTruthy();
    expect(fromFlatOp({ ...nulls, op: 'setVendorStatus', vendorId: 'v1', status: 'teleported' }).error).toBeTruthy();
    expect(fromFlatOp({ ...nulls, op: 'addTask', title: 'Book tent', offsetDays: -20 }).op).toMatchObject({
      op: 'addTask',
      title: 'Book tent',
      workstream: 'planning',
    });
  });
});

describe('server endpoint without a key', () => {
  it('reports unavailable and refuses model calls', async () => {
    const handler = createCopilotHandler({});
    const server = http.createServer((req, res) =>
      handler(req, res, () => {
        res.statusCode = 404;
        res.end();
      }),
    );
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const status = await fetch(`http://127.0.0.1:${port}/api/copilot/status`).then((r) => r.json());
      expect(status).toEqual({ available: false });
      const res = await fetch(`http://127.0.0.1:${port}/api/copilot`, {
        method: 'POST',
        body: JSON.stringify({ request: 'hi', context: {} }),
      });
      expect(res.status).toBe(503);
      const other = await fetch(`http://127.0.0.1:${port}/other`);
      expect(other.status).toBe(404);
    } finally {
      server.close();
    }
  });
});
