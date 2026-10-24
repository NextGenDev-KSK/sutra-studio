import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askCopilot, buildModelContext, fetchCopilotStatus } from '../src/copilot/provider';
import { fromFlatOp, OP_NAMES, type FlatOp } from '../src/copilot/modelSchema';
import { createDemoPlan } from '../src/domain/demo';
import { runOfShowCSV, scenariosCSV, timelineCSV, vendorsCSV } from '../src/domain/exports';
import { makeTemplate, planFromTemplate, withFreshIdentity } from '../src/domain/io';
import { applyOps, describeOp, type PlanOp } from '../src/domain/ops';
import { addDays } from '../src/domain/util';
import { createCopilotHandler } from '../server/copilotApi';

const TODAY = '2026-10-23';
const demo = () => createDemoPlan(TODAY);
const nulls: Omit<FlatOp, 'op'> = {
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

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('co-pilot provider', () => {
  it('reports availability only for a JSON status endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ available: true, model: 'claude-opus-5' })),
    );
    expect(await fetchCopilotStatus()).toEqual({ available: true, model: 'claude-opus-5', checked: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } })),
    );
    expect((await fetchCopilotStatus()).available).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect((await fetchCopilotStatus()).available).toBe(false);
  });

  it('uses the built-in assistant without calling the network when no model is available', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await askCopilot('Increase contingency to 8%', demo(), TODAY, [], { available: false, checked: true });
    expect(r.source).toBe('rules');
    expect(r.proposal?.ops).toEqual([{ op: 'setContingencyPct', pct: 8 }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts a valid model proposal after re-validating it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          reply: 'Done.',
          insights: ['x'],
          proposal: {
            title: 'More guests',
            summary: '',
            reason: 'r',
            tradeoffs: [],
            assumptions: [],
            ops: [{ ...nulls, op: 'setGuestCount', count: 190 }],
          },
        }),
      ),
    );
    const r = await askCopilot('more guests', demo(), TODAY, [], { available: true, checked: true });
    expect(r.source).toBe('model');
    expect(r.proposal?.ops).toEqual([{ op: 'setGuestCount', count: 190 }]);
    expect(r.blocks).toEqual([{ kind: 'list', items: ['x'] }]);
  });

  it('falls back with a notice on outages, malformed output or invalid references', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: 'Rate limited' }, 429)),
    );
    let r = await askCopilot('Which decisions must I make this week?', demo(), TODAY, [], { available: true, checked: true });
    expect(r.source).toBe('rules');
    expect(r.notice).toMatch(/Couldn't reach Claude \(Rate limited\)/);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ unexpected: true })),
    );
    r = await askCopilot('Which decisions must I make this week?', demo(), TODAY, [], { available: true, checked: true });
    expect(r.notice).toMatch(/did not match the expected structure/);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          reply: 'x',
          insights: [],
          proposal: {
            title: 't',
            summary: '',
            reason: '',
            tradeoffs: [],
            assumptions: [],
            ops: [{ ...nulls, op: 'updateTask', taskId: 'nope', status: 'done' }],
          },
        }),
      ),
    );
    r = await askCopilot('close it', demo(), TODAY, [], { available: true, checked: true });
    expect(r.source).toBe('rules');
    expect(r.notice).toMatch(/failed validation/);
  });

  it('never sends guest names or contact details to the model', () => {
    const plan = demo();
    plan.guests[0].contact = 'guest@example.com';
    const ctx = JSON.stringify(buildModelContext(plan, TODAY));
    for (const g of plan.guests) expect(ctx).not.toContain(g.name);
    expect(ctx).not.toContain('guest@example.com');
    expect(ctx).toContain('"invited"');
  });
});

describe('model operation conversion', () => {
  const p = demo();
  const samples: Record<(typeof OP_NAMES)[number], Partial<FlatOp>> = {
    setCategoryPlanned: { categoryKey: 'venue', planned: 1_300_000 },
    setContingencyPct: { pct: 7 },
    setGuestCount: { count: 170 },
    setTotalBudget: { amount: 9_000_000 },
    setEventDate: { date: addDays(p.brief.eventDate, 7) },
    addTask: { title: 'Confirm generator backup', workstream: 'production', offsetDays: -20 },
    updateTask: { taskId: 't27', status: 'done', notes: 'Received both lists' },
    setVendorStatus: { vendorId: 'v_ent1', status: 'booked' },
    setVendorPreferred: { vendorId: 'v_venue2' },
    cancelVendorPayments: { vendorId: 'v_dec1' },
    updateSession: { sessionId: 's_reception', setting: 'covered', value: 'Lawn pavilion' },
    updateRunItem: { itemId: 'r09', status: 'ready', text: 'Heaters confirmed.' },
    setDietary: { pct: 80 },
    updateBrief: { field: 'atmosphere', value: 'Warm and unhurried.' },
    addRisk: { text: 'Late guest-list changes' },
    addNote: { status: 'decision', title: 'Reception stays outdoors', text: 'Approved.' },
  };

  it('converts every operation type into a valid, describable, applicable change', () => {
    const ops: PlanOp[] = [];
    for (const name of OP_NAMES) {
      const { op, error } = fromFlatOp({ ...nulls, op: name, ...samples[name] } as FlatOp);
      expect(error, name).toBeUndefined();
      ops.push(op!);
      expect(describeOp(p, op!).length, name).toBeGreaterThan(5);
    }
    const { plan, log } = applyOps(p, ops, TODAY);
    expect(plan.brief.guestCount).toBe(170);
    expect(plan.brief.sessions.find((s) => s.id === 's_reception')!.area).toBe('Lawn pavilion');
    expect(plan.vendors.find((v) => v.id === 'v_ent1')!.status).toBe('booked');
    expect(plan.tasks.find((t) => t.id === 't22')!.status).toBe('done');
    expect(log.some((l) => /Marked “Book entertainment” done/.test(l))).toBe(true);
    expect(plan.notes[0].kind).toBe('decision');
  });
});

describe('exports and templates', () => {
  it('produces complete CSVs from current data', () => {
    const p = demo();
    p.vendors[0].name = 'Renamed Venue';
    expect(vendorsCSV(p)).toContain('Renamed Venue');
    expect(vendorsCSV(p)).toContain('Illustrative demo — not verified');
    const sc = scenariosCSV(p, TODAY);
    expect(sc.split('\r\n')[0]).toBe('Category,Current plan,Lean,Balanced,Premium');
    expect(sc).toContain('Within ceiling');
    const tl = timelineCSV(p, TODAY);
    expect(tl).toContain('Waiting on venue confirmation');
    expect(runOfShowCSV(p)).toMatch(/past the 22:00 cut-off/);
  });

  it('templates strip people, money and progress; new events get fresh ids and dates', () => {
    const p = demo();
    const tpl = makeTemplate(p, 'Heritage wedding');
    expect(tpl.plan.guests).toEqual([]);
    expect(tpl.plan.vendors).toEqual([]);
    expect(tpl.plan.budget.payments).toEqual([]);
    expect(tpl.plan.tasks.every((t) => t.status === 'todo')).toBe(true);
    const date = addDays(TODAY, 200);
    const next = planFromTemplate(tpl, { name: 'Second wedding', eventDate: date, guestCount: 150, totalBudget: 6_000_000 }, TODAY);
    expect(next.id).not.toBe(p.id);
    expect(next.brief.eventDate).toBe(date);
    expect(next.brief.venueStatus).toBe('searching');
    const ids = new Set(next.tasks.map((t) => t.id));
    expect(next.tasks.every((t) => t.dependsOn.every((d) => ids.has(d)))).toBe(true);
    expect(next.tasks.every((t) => !p.tasks.some((o) => o.id === t.id))).toBe(true);
    expect(withFreshIdentity(p).isDemo).toBe(false);
  });
});

describe('co-pilot API request validation (no network)', () => {
  async function withServer(fn: (base: string) => Promise<void>) {
    const handler = createCopilotHandler({ apiKey: 'sk-ant-test-not-used' });
    const server = http.createServer((req, res) =>
      handler(req, res, () => {
        res.statusCode = 404;
        res.end();
      }),
    );
    await new Promise<void>((r) => server.listen(0, r));
    try {
      await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      server.close();
    }
  }

  it('rejects wrong methods, malformed bodies and oversized requests, and rate-limits', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/copilot/status`).then((r) => r.json())).available).toBe(true);
      expect((await fetch(`${base}/api/copilot`)).status).toBe(405);
      expect((await fetch(`${base}/api/copilot`, { method: 'POST', body: '{nope' })).status).toBe(400);
      expect((await fetch(`${base}/api/copilot`, { method: 'POST', body: JSON.stringify({ request: '', context: {} }) })).status).toBe(400);
      const big = await fetch(`${base}/api/copilot`, {
        method: 'POST',
        body: JSON.stringify({ request: 'x', context: { pad: 'x'.repeat(500_000) } }),
      }).catch(() => null);
      expect(big === null || big.status === 400).toBe(true);
      let last = 0;
      for (let i = 0; i < 20; i++) last = (await fetch(`${base}/api/copilot`, { method: 'POST', body: '{bad' })).status;
      expect(last).toBe(429);
    });
  });
});
