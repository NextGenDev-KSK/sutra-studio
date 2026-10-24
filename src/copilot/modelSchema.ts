import { z } from 'zod';
import { PlanOpSchema, type PlanOp } from '../domain/ops';

// Shared between the server (structured-output schema sent to the model) and
// the client (re-validation before anything can be applied). The model sees a
// flat op shape — every field present, unused ones null — which is far more
// robust under constrained decoding than a deep discriminated union. It is
// converted into a typed PlanOp and validated again with PlanOpSchema.

export const OP_NAMES = [
  'setCategoryPlanned',
  'setContingencyPct',
  'setGuestCount',
  'setTotalBudget',
  'setEventDate',
  'addTask',
  'updateTask',
  'setVendorStatus',
  'setVendorPreferred',
  'cancelVendorPayments',
  'updateSession',
  'updateRunItem',
  'setDietary',
  'updateBrief',
  'addRisk',
  'addNote',
] as const;

export const FlatOpSchema = z.object({
  op: z.enum(OP_NAMES),
  categoryKey: z.string().nullable(),
  planned: z.number().nullable(),
  pct: z.number().nullable(),
  count: z.number().nullable(),
  amount: z.number().nullable(),
  date: z.string().nullable(),
  title: z.string().nullable(),
  workstream: z.string().nullable(),
  offsetDays: z.number().nullable(),
  durationDays: z.number().nullable(),
  priority: z.string().nullable(),
  notes: z.string().nullable(),
  taskId: z.string().nullable(),
  status: z.string().nullable(),
  vendorId: z.string().nullable(),
  sessionId: z.string().nullable(),
  setting: z.string().nullable(),
  itemId: z.string().nullable(),
  field: z.string().nullable(),
  value: z.string().nullable(),
  text: z.string().nullable(),
});

export type FlatOp = z.infer<typeof FlatOpSchema>;

export const ModelResponseSchema = z.object({
  reply: z.string(),
  insights: z.array(z.string()),
  proposal: z
    .object({
      title: z.string(),
      summary: z.string(),
      reason: z.string(),
      tradeoffs: z.array(z.string()),
      assumptions: z.array(z.string()),
      ops: z.array(FlatOpSchema),
    })
    .nullable(),
});

const v = <T>(x: T | null | undefined): T | undefined => (x === null ? undefined : x);

/** Convert a flat model op into a typed PlanOp; returns an error string if it doesn't fit. */
export function fromFlatOp(f: FlatOp): { op?: PlanOp; error?: string } {
  let candidate: Record<string, unknown>;
  switch (f.op) {
    case 'setCategoryPlanned':
      candidate = { op: f.op, key: v(f.categoryKey), planned: v(f.planned) ?? v(f.amount) };
      break;
    case 'setContingencyPct':
      candidate = { op: f.op, pct: v(f.pct) };
      break;
    case 'setGuestCount':
      candidate = { op: f.op, count: v(f.count) };
      break;
    case 'setTotalBudget':
      candidate = { op: f.op, amount: v(f.amount) };
      break;
    case 'setEventDate':
      candidate = { op: f.op, date: v(f.date) };
      break;
    case 'addTask':
      candidate = {
        op: f.op,
        title: v(f.title),
        workstream: v(f.workstream) ?? 'planning',
        offsetDays: v(f.offsetDays) !== undefined ? Math.round(f.offsetDays!) : -14,
        durationDays: v(f.durationDays) !== undefined ? Math.round(f.durationDays!) : 2,
        priority: v(f.priority) ?? 'medium',
        notes: v(f.notes) ?? '',
        vendorCategory: v(f.categoryKey),
      };
      break;
    case 'updateTask':
      candidate = {
        op: f.op,
        taskId: v(f.taskId),
        status: v(f.status),
        priority: v(f.priority),
        appendNote: v(f.notes) ?? v(f.text),
        dueDate: v(f.date),
      };
      break;
    case 'setVendorStatus':
      candidate = { op: f.op, vendorId: v(f.vendorId), status: v(f.status) };
      break;
    case 'setVendorPreferred':
    case 'cancelVendorPayments':
      candidate = { op: f.op, vendorId: v(f.vendorId) };
      break;
    case 'updateSession':
      candidate = { op: f.op, sessionId: v(f.sessionId), setting: v(f.setting), area: v(f.value) };
      break;
    case 'updateRunItem':
      candidate = { op: f.op, itemId: v(f.itemId), status: v(f.status), appendContingency: v(f.text) ?? v(f.notes) };
      break;
    case 'setDietary':
      candidate = { op: f.op, vegetarianPct: v(f.pct) };
      break;
    case 'updateBrief':
      candidate = { op: f.op, field: v(f.field), value: v(f.value) ?? v(f.text) };
      break;
    case 'addRisk':
      candidate = { op: f.op, text: v(f.text) ?? v(f.title) };
      break;
    case 'addNote':
      candidate = {
        op: f.op,
        kind: f.status === 'decision' ? 'decision' : 'note',
        title: v(f.title) ?? 'Note',
        body: v(f.text) ?? v(f.notes) ?? '',
      };
      break;
  }
  const clean = Object.fromEntries(Object.entries(candidate).filter(([, x]) => x !== undefined));
  const parsed = PlanOpSchema.safeParse(clean);
  if (!parsed.success)
    return { error: `${f.op}: ${parsed.error.issues[0]?.path.join('.') || ''} ${parsed.error.issues[0]?.message ?? 'invalid'}`.trim() };
  return { op: parsed.data };
}
