import { z } from 'zod';
import { BOOKED_STATUSES, lineTotal } from './budget';
import { SETTING_LABEL, TASK_STATUS_LABEL, VENDOR_STATUS_LABEL, categoryMeta } from './catalog';
import { rescheduleForEventDate } from './timeline';
import type { EventPlan, ISODate, Task, Vendor, VendorStatus } from './types';
import { addDays, deepClone, diffDays, formatDate, formatMoneyCompact, isValidISODate, uid } from './util';

// ---------------------------------------------------------------------------
// Operation vocabulary — the only way the co-pilot and themes change a plan.
// ---------------------------------------------------------------------------

const workstream = z.enum([
  'planning',
  'venue',
  'catering',
  'design',
  'media',
  'entertainment',
  'guests',
  'logistics',
  'production',
  'finance',
]);
const priority = z.enum(['high', 'medium', 'low']);
const taskStatus = z.enum(['todo', 'in_progress', 'blocked', 'done']);
const vendorStatus = z.enum(['identified', 'contacted', 'quoted', 'shortlisted', 'booked', 'completed', 'rejected', 'cancelled']);
const setting = z.enum(['indoor', 'outdoor', 'covered', 'mixed']);
const money = z.number().finite().min(0).max(1e12);

export const PlanOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('setCategoryPlanned'), key: z.string().min(1), planned: money }),
  z.object({ op: z.literal('setContingencyPct'), pct: z.number().finite().min(0).max(30) }),
  z.object({ op: z.literal('setGuestCount'), count: z.number().int().min(1).max(100_000) }),
  z.object({ op: z.literal('setTotalBudget'), amount: money.positive() }),
  z.object({ op: z.literal('setEventDate'), date: z.string() }),
  z.object({
    op: z.literal('addTask'),
    title: z.string().min(3).max(140),
    workstream,
    offsetDays: z.number().int().min(-730).max(60),
    durationDays: z.number().int().min(0).max(120),
    priority,
    notes: z.string().max(600),
    vendorCategory: z.string().optional(),
    vendorRole: z.enum(['book', 'requires']).optional(),
  }),
  z.object({
    op: z.literal('updateTask'),
    taskId: z.string(),
    status: taskStatus.optional(),
    priority: priority.optional(),
    appendNote: z.string().max(400).optional(),
    dueDate: z.string().optional(),
  }),
  z.object({ op: z.literal('setVendorStatus'), vendorId: z.string(), status: vendorStatus }),
  z.object({ op: z.literal('setVendorPreferred'), vendorId: z.string() }),
  z.object({ op: z.literal('cancelVendorPayments'), vendorId: z.string() }),
  z.object({ op: z.literal('updateSession'), sessionId: z.string(), setting: setting.optional(), area: z.string().max(80).optional() }),
  z.object({
    op: z.literal('updateRunItem'),
    itemId: z.string(),
    status: z.enum(['planned', 'ready', 'at_risk']).optional(),
    appendContingency: z.string().max(400).optional(),
  }),
  z.object({ op: z.literal('setDietary'), vegetarianPct: z.number().min(0).max(100) }),
  z.object({
    op: z.literal('updateBrief'),
    field: z.enum(['style', 'atmosphere', 'weatherConcerns', 'themeName']),
    value: z.string().max(400),
  }),
  z.object({ op: z.literal('setColors'), colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8) }),
  z.object({ op: z.literal('addRisk'), text: z.string().min(3).max(300) }),
  z.object({ op: z.literal('addNote'), kind: z.enum(['note', 'decision']), title: z.string().min(1).max(140), body: z.string().max(1200) }),
  z.object({ op: z.literal('setAppliedTheme'), themeId: z.string() }),
]);

export type PlanOp = z.infer<typeof PlanOpSchema>;

export interface Proposal {
  id: string;
  title: string;
  summary: string;
  reason: string;
  ops: PlanOp[];
  tradeoffs: string[];
  assumptions: string[];
  createdAt: string;
}

export function makeProposal(p: Omit<Proposal, 'id' | 'createdAt'>): Proposal {
  return { ...p, id: uid('prop'), createdAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateOps(plan: EventPlan, ops: PlanOp[], today: ISODate): string[] {
  const errors: string[] = [];
  ops.forEach((raw, i) => {
    const parsed = PlanOpSchema.safeParse(raw);
    const n = `Change ${i + 1}`;
    if (!parsed.success) {
      errors.push(`${n}: ${parsed.error.issues[0]?.message ?? 'invalid change'} (${(raw as { op?: string }).op ?? 'unknown'}).`);
      return;
    }
    const op = parsed.data;
    switch (op.op) {
      case 'setCategoryPlanned':
        if (!plan.budget.categories.some((c) => c.key === op.key)) errors.push(`${n}: budget category “${op.key}” does not exist.`);
        break;
      case 'setEventDate':
        if (!isValidISODate(op.date)) errors.push(`${n}: “${op.date}” is not a valid date.`);
        else if (op.date <= today) errors.push(`${n}: the event date must be after today.`);
        else if (diffDays(today, op.date) > 365 * 5) errors.push(`${n}: the event date is more than five years away.`);
        break;
      case 'updateTask':
        if (!plan.tasks.some((t) => t.id === op.taskId)) errors.push(`${n}: task not found.`);
        if (op.dueDate !== undefined && !isValidISODate(op.dueDate)) errors.push(`${n}: “${op.dueDate}” is not a valid date.`);
        break;
      case 'setVendorStatus':
      case 'setVendorPreferred':
      case 'cancelVendorPayments':
        if (!plan.vendors.some((v) => v.id === op.vendorId)) errors.push(`${n}: vendor not found.`);
        break;
      case 'updateSession':
        if (!plan.brief.sessions.some((s) => s.id === op.sessionId)) errors.push(`${n}: session not found.`);
        break;
      case 'updateRunItem':
        if (!plan.runOfShow.some((r) => r.id === op.itemId)) errors.push(`${n}: run-of-show item not found.`);
        break;
      case 'setAppliedTheme':
        if (!plan.themes.some((t) => t.id === op.themeId)) errors.push(`${n}: theme concept not found.`);
        break;
      case 'addTask':
        if (op.vendorCategory && !plan.budget.categories.some((c) => c.key === op.vendorCategory) && !categoryMeta(op.vendorCategory)) {
          errors.push(`${n}: unknown vendor category “${op.vendorCategory}”.`);
        }
        break;
      default:
        break;
    }
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Vendor status side-effects (shared with direct planner actions)
// ---------------------------------------------------------------------------

/**
 * Apply a vendor status change and its consequences in place. Returns a
 * human-readable list of every consequence so it can be shown and logged.
 */
export function applyVendorStatus(plan: EventPlan, vendorId: string, status: VendorStatus, today: ISODate): string[] {
  const log: string[] = [];
  const vendor = plan.vendors.find((v) => v.id === vendorId);
  if (!vendor) return log;
  const prev = vendor.status;
  if (prev === status) return log;
  vendor.status = status;
  log.push(`${vendor.name}: ${VENDOR_STATUS_LABEL[prev]} → ${VENDOR_STATUS_LABEL[status]}.`);
  const cat = vendor.category;
  const label = categoryMeta(cat)?.label ?? cat;

  if (status === 'booked') {
    vendor.bookedOn = today;
    if (vendor.availability === 'unknown' || vendor.availability === 'requested') vendor.availability = 'confirmed';
    for (const t of plan.tasks) {
      if (t.vendorCategory === cat && t.vendorRole === 'book' && t.status !== 'done') {
        t.status = 'done';
        t.completedOn = today;
        log.push(`Marked “${t.title}” done because ${vendor.name} is booked.`);
      }
    }
    if (cat === 'venue' && plan.brief.venueStatus !== 'confirmed') {
      plan.brief.venueStatus = 'confirmed';
      plan.brief.venueName = vendor.name;
      log.push(`Venue confirmed as ${vendor.name}; venue-dependent tasks are unblocked.`);
    }
  }

  const wasBooked = BOOKED_STATUSES.has(prev);
  const stillBooked = plan.vendors.some((v) => v.id !== vendorId && v.category === cat && BOOKED_STATUSES.has(v.status));
  if (wasBooked && (status === 'cancelled' || status === 'rejected') && !stillBooked) {
    for (const t of plan.tasks) {
      if (t.vendorCategory === cat && t.vendorRole === 'book' && t.status === 'done') {
        t.status = 'todo';
        t.completedOn = undefined;
        log.push(`Re-opened “${t.title}” — no ${label.toLowerCase()} vendor is booked now.`);
      }
    }
    if (cat === 'venue') {
      plan.brief.venueStatus = 'searching';
      log.push('Venue status set to “Still searching”; venue-dependent tasks are blocked again.');
    }
  }
  return log;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export interface ApplyResult {
  plan: EventPlan;
  log: string[];
}

export function applyOps(source: EventPlan, ops: PlanOp[], today: ISODate): ApplyResult {
  const plan = deepClone(source);
  const log: string[] = [];
  for (const op of ops) {
    switch (op.op) {
      case 'setCategoryPlanned': {
        const c = plan.budget.categories.find((x) => x.key === op.key);
        if (c) c.planned = op.planned;
        break;
      }
      case 'setContingencyPct':
        plan.budget.contingencyPct = op.pct;
        break;
      case 'setGuestCount':
        plan.brief.guestCount = op.count;
        break;
      case 'setTotalBudget':
        plan.brief.totalBudget = op.amount;
        break;
      case 'setEventDate': {
        const { tasks, report } = rescheduleForEventDate(plan, op.date, today);
        plan.tasks = tasks;
        plan.brief.eventDate = op.date;
        plan.lastScheduleChange = report;
        log.push(
          `Event date moved to ${formatDate(op.date)}; ${report.moved.length} tasks rescheduled, ${report.preserved.length} completed tasks preserved.`,
        );
        break;
      }
      case 'addTask': {
        const task: Task = {
          id: uid('t'),
          title: op.title,
          workstream: op.workstream,
          ownerId: plan.team[0]?.id,
          status: 'todo',
          priority: op.priority,
          dueDate: maxISO(addDays(plan.brief.eventDate, op.offsetDays), today),
          durationDays: op.durationDays,
          dependsOn: [],
          schedule: 'relative',
          offsetDays: op.offsetDays,
          milestone: false,
          requiresVenue: false,
          vendorCategory: op.vendorCategory,
          vendorRole: op.vendorRole,
          notes: op.notes,
          source: 'copilot',
        };
        plan.tasks.push(task);
        break;
      }
      case 'updateTask': {
        const t = plan.tasks.find((x) => x.id === op.taskId);
        if (!t) break;
        if (op.status) {
          t.status = op.status;
          t.completedOn = op.status === 'done' ? today : undefined;
        }
        if (op.priority) t.priority = op.priority;
        if (op.dueDate && isValidISODate(op.dueDate)) {
          t.dueDate = op.dueDate;
          t.offsetDays = diffDays(plan.brief.eventDate, op.dueDate);
        }
        if (op.appendNote) t.notes = t.notes ? `${t.notes}\n${op.appendNote}` : op.appendNote;
        break;
      }
      case 'setVendorStatus':
        log.push(...applyVendorStatus(plan, op.vendorId, op.status, today));
        break;
      case 'setVendorPreferred': {
        const v = plan.vendors.find((x) => x.id === op.vendorId);
        if (!v) break;
        for (const other of plan.vendors) if (other.category === v.category) other.preferred = other.id === v.id;
        if (v.status === 'identified' || v.status === 'contacted') v.status = v.quote ? 'shortlisted' : v.status;
        break;
      }
      case 'cancelVendorPayments':
        for (const p of plan.budget.payments) if (p.vendorId === op.vendorId && p.status === 'scheduled') p.status = 'cancelled';
        break;
      case 'updateSession': {
        const s = plan.brief.sessions.find((x) => x.id === op.sessionId);
        if (!s) break;
        if (op.setting) s.setting = op.setting;
        if (op.area !== undefined) s.area = op.area;
        break;
      }
      case 'updateRunItem': {
        const r = plan.runOfShow.find((x) => x.id === op.itemId);
        if (!r) break;
        if (op.status) r.status = op.status;
        if (op.appendContingency) r.contingency = r.contingency ? `${r.contingency} ${op.appendContingency}` : op.appendContingency;
        break;
      }
      case 'setDietary':
        plan.brief.dietary.vegetarianPct = op.vegetarianPct;
        plan.brief.dietarySpecified = true;
        break;
      case 'updateBrief':
        plan.brief[op.field] = op.value;
        break;
      case 'setColors':
        plan.brief.colors = op.colors;
        break;
      case 'addRisk':
        if (!plan.brief.knownRisks.includes(op.text)) plan.brief.knownRisks.push(op.text);
        break;
      case 'addNote':
        plan.notes.unshift({ id: uid('n'), at: new Date().toISOString(), kind: op.kind, title: op.title, body: op.body });
        break;
      case 'setAppliedTheme':
        plan.appliedThemeId = op.themeId;
        break;
    }
  }
  plan.updatedAt = new Date().toISOString();
  return { plan, log };
}

function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

// ---------------------------------------------------------------------------
// Human-readable descriptions
// ---------------------------------------------------------------------------

export function describeOp(plan: EventPlan, op: PlanOp): string {
  const cur = plan.brief.currency;
  const m = (n: number) => formatMoneyCompact(n, cur);
  const vendor = (id: string): Vendor | undefined => plan.vendors.find((v) => v.id === id);
  switch (op.op) {
    case 'setCategoryPlanned': {
      const c = plan.budget.categories.find((x) => x.key === op.key);
      if (!c) return `Set ${op.key} allocation`;
      const before = lineTotal(c, plan.brief.guestCount);
      const after = lineTotal({ ...c, planned: op.planned }, plan.brief.guestCount);
      const rate = c.basis === 'perGuest' ? ` (${m(op.planned)} per guest${c.units > 1 ? ` × ${c.units} ${c.unitLabel}s` : ''})` : '';
      return `${c.label}: ${m(before)} → ${m(after)}${rate}`;
    }
    case 'setContingencyPct':
      return `Contingency: ${plan.budget.contingencyPct}% → ${op.pct}%`;
    case 'setGuestCount':
      return `Guest count: ${plan.brief.guestCount} → ${op.count}`;
    case 'setTotalBudget':
      return `Budget ceiling: ${m(plan.brief.totalBudget)} → ${m(op.amount)}`;
    case 'setEventDate':
      return `Event date: ${formatDate(plan.brief.eventDate)} → ${isValidISODate(op.date) ? formatDate(op.date) : op.date}`;
    case 'addTask':
      return `New task: “${op.title}” (${op.offsetDays === 0 ? 'on the event day' : op.offsetDays < 0 ? `${-op.offsetDays} days before the event` : `${op.offsetDays} days after`})`;
    case 'updateTask': {
      const t = plan.tasks.find((x) => x.id === op.taskId);
      const parts = [];
      if (op.status) parts.push(`${t ? TASK_STATUS_LABEL[t.status] : '?'} → ${TASK_STATUS_LABEL[op.status]}`);
      if (op.priority) parts.push(`priority ${op.priority}`);
      if (op.dueDate) parts.push(`due ${isValidISODate(op.dueDate) ? formatDate(op.dueDate) : op.dueDate}`);
      if (op.appendNote) parts.push('note added');
      return `Task “${t?.title ?? 'unknown'}”: ${parts.join(', ')}`;
    }
    case 'setVendorStatus': {
      const v = vendor(op.vendorId);
      return `${v?.name ?? 'Vendor'}: ${v ? VENDOR_STATUS_LABEL[v.status] : '?'} → ${VENDOR_STATUS_LABEL[op.status]}`;
    }
    case 'setVendorPreferred':
      return `Mark ${vendor(op.vendorId)?.name ?? 'vendor'} as the preferred quotation in its category`;
    case 'cancelVendorPayments':
      return `Cancel scheduled (unpaid) payments to ${vendor(op.vendorId)?.name ?? 'vendor'}`;
    case 'updateSession': {
      const s = plan.brief.sessions.find((x) => x.id === op.sessionId);
      const parts = [
        op.setting ? `${s ? SETTING_LABEL[s.setting] : '?'} → ${SETTING_LABEL[op.setting]}` : '',
        op.area ? `area “${op.area}”` : '',
      ].filter(Boolean);
      return `${s?.name ?? 'Session'}: ${parts.join(' · ')}`;
    }
    case 'updateRunItem': {
      const r = plan.runOfShow.find((x) => x.id === op.itemId);
      const parts = [op.status ? `status ${op.status.replace('_', ' ')}` : '', op.appendContingency ? 'contingency note added' : ''].filter(
        Boolean,
      );
      return `Run of show “${r?.title ?? 'item'}”: ${parts.join(' · ')}`;
    }
    case 'setDietary':
      return `Dietary mix: ${plan.brief.dietary.vegetarianPct}% → ${op.vegetarianPct}% vegetarian`;
    case 'updateBrief':
      return `Brief ${op.field === 'themeName' ? 'theme' : op.field}: “${op.value.slice(0, 80)}${op.value.length > 80 ? '…' : ''}”`;
    case 'setColors':
      return `Palette: ${op.colors.join(', ')}`;
    case 'addRisk':
      return `Add risk: “${op.text}”`;
    case 'addNote':
      return `Log ${op.kind}: “${op.title}”`;
    case 'setAppliedTheme':
      return `Mark theme “${plan.themes.find((t) => t.id === op.themeId)?.name ?? op.themeId}” as applied`;
  }
}
