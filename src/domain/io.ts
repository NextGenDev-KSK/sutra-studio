import { z } from 'zod';
import { generateNarrative } from './brief';
import { generateConcepts } from './themes';
import type { EventPlan, EventTemplate, ISODate } from './types';
import { addDays, deepClone, isValidISODate, uid } from './util';

// ---------------------------------------------------------------------------
// Import validation. Imports are untrusted: every field is type-checked and
// string lengths are capped before anything reaches the workspace.
// ---------------------------------------------------------------------------

const str = (max = 2000) => z.string().max(max);
const date = z.string().refine(isValidISODate, 'must be a YYYY-MM-DD date');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM');
const num = z.number().finite();
const nonneg = num.min(0);

const SessionSchema = z.object({
  id: str(80),
  name: str(140),
  dayIndex: z.number().int().min(0).max(30),
  start: time,
  end: time,
  setting: z.enum(['indoor', 'outdoor', 'covered', 'mixed']),
  hasMeal: z.boolean(),
  area: str(120),
});

const BriefSchema = z.object({
  name: str(200).min(1),
  type: z.enum([
    'wedding',
    'engagement',
    'birthday',
    'anniversary',
    'baby_shower',
    'community',
    'festival',
    'cultural',
    'corporate',
    'custom',
  ]),
  customTypeLabel: str(80).default(''),
  city: str(120),
  country: str(120),
  venueName: str(200).default(''),
  venueStatus: z.enum(['confirmed', 'shortlisted', 'searching', 'not_required']),
  eventDate: date,
  durationDays: z.number().int().min(1).max(30),
  sessions: z.array(SessionSchema).max(40),
  guestCount: z.number().int().min(1).max(100_000),
  totalBudget: nonneg,
  currency: z.enum(['INR', 'USD', 'GBP', 'EUR', 'AED', 'SGD']),
  style: str(300).default(''),
  themeName: str(200).default(''),
  colors: z
    .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .max(12)
    .default([]),
  atmosphere: str(1000).default(''),
  culturalPreferences: str(2000).default(''),
  dietary: z.object({
    vegetarianPct: num.min(0).max(100),
    veganCount: nonneg,
    jainCount: nonneg,
    allergens: z.array(str(80)).max(30),
    notes: str(1000),
  }),
  dietarySpecified: z.boolean(),
  accessibility: z.array(str(120)).max(30),
  accessibilityNotes: str(1000).default(''),
  setting: z.enum(['indoor', 'outdoor', 'covered', 'mixed']),
  weatherConcerns: str(1000).default(''),
  plannerName: str(120).default(''),
  clientName: str(200).default(''),
  protectedCategories: z.array(str(60)).max(20).default([]),
  goals: str(2000).default(''),
  nonNegotiables: z.array(str(300)).max(30).default([]),
  knownRisks: z.array(str(300)).max(50).default([]),
});

const NarrativeSchema = z.object({
  generatedAt: str(40),
  vision: str(4000),
  objectives: z.array(str(500)).max(30),
  audience: str(2000),
  assumptions: z.array(z.object({ id: str(80), text: str(600), field: str(60).optional() })).max(40),
  openQuestions: z.array(str(500)).max(30),
  guestExperienceIdeas: z.array(str(500)).max(30),
  edited: z.record(z.string(), z.boolean()).default({}),
});

const QuoteSchema = z.object({
  basis: z.enum(['fixed', 'perGuest']),
  amount: nonneg,
  units: nonneg,
  deliverables: str(2000),
  receivedOn: date.optional(),
  validUntil: date.optional(),
});

const VendorSchema = z.object({
  id: str(80),
  name: str(200).min(1),
  category: str(60),
  location: str(200),
  serviceArea: str(200),
  contactName: str(120),
  phone: str(60),
  email: str(200),
  website: str(400),
  description: str(2000),
  quote: QuoteSchema.nullable(),
  availability: z.enum(['unknown', 'requested', 'confirmed', 'unavailable']),
  status: z.enum(['identified', 'contacted', 'quoted', 'shortlisted', 'booked', 'completed', 'rejected', 'cancelled']),
  preferred: z.boolean(),
  pros: z.array(str(300)).max(20),
  cons: z.array(str(300)).max(20),
  notes: str(2000),
  nextAction: str(300),
  verification: z.object({
    level: z.enum(['illustrative', 'unverified', 'verified']),
    sourceUrl: str(500).optional(),
    checkedOn: date.optional(),
    note: str(500).optional(),
  }),
  bookedOn: date.optional(),
  createdAt: str(40),
});

const TaskSchema = z.object({
  id: str(80),
  title: str(200).min(1),
  workstream: z.enum(['planning', 'venue', 'catering', 'design', 'media', 'entertainment', 'guests', 'logistics', 'production', 'finance']),
  ownerId: str(80).optional(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']),
  priority: z.enum(['high', 'medium', 'low']),
  dueDate: date,
  durationDays: z.number().int().min(0).max(365),
  dependsOn: z.array(str(80)).max(30),
  schedule: z.enum(['relative', 'pinned']),
  offsetDays: z.number().int().min(-2000).max(400),
  milestone: z.boolean(),
  requiresVenue: z.boolean(),
  vendorCategory: str(60).optional(),
  vendorRole: z.enum(['book', 'requires']).optional(),
  notes: str(2000),
  completedOn: date.optional(),
  source: z.enum(['template', 'planner', 'copilot', 'theme']),
});

const RunItemSchema = z.object({
  id: str(80),
  dayIndex: z.number().int().min(0).max(30),
  start: time,
  end: time,
  title: str(200).min(1),
  location: str(200),
  leadId: str(80).optional(),
  vendorIds: z.array(str(80)).max(30),
  setupMinutes: z.number().int().min(0).max(1440),
  setupNotes: str(1000),
  dependsOn: z.array(str(80)).max(20),
  bufferMinutes: z.number().int().min(0).max(600),
  timing: z.enum(['confirmed', 'suggested']),
  status: z.enum(['planned', 'ready', 'at_risk']),
  contingency: str(1000),
  amplifiedSound: z.boolean(),
});

const GuestSchema = z.object({
  id: str(80),
  name: str(160).min(1),
  group: str(120),
  partySize: z.number().int().min(1).max(50),
  rsvp: z.enum(['pending', 'confirmed', 'declined', 'tentative']),
  diet: z.enum(['vegetarian', 'non_vegetarian', 'vegan', 'jain', 'other', 'unknown']),
  allergies: str(300),
  accessibility: str(300),
  assistanceNotes: str(500),
  table: str(60),
  contact: str(200),
  notes: str(1000),
});

const ThemeSchema = z.object({
  id: str(80),
  name: str(200),
  archetype: str(60),
  rationale: str(2000),
  palette: z.array(z.object({ name: str(60), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(10),
  decor: str(2000),
  lighting: str(2000),
  florals: str(2000),
  attire: str(2000),
  food: str(2000),
  guestExperience: str(2000),
  photography: str(2000),
  costFactors: z.record(z.string(), num.min(0).max(5)),
  practicality: num.min(1).max(5),
  logistics: z.array(str(500)).max(20),
  weather: z.array(str(500)).max(20),
  leadTimeDays: z.number().int().min(0).max(730),
  procurement: z.array(z.object({ title: str(200), offsetDays: z.number().int(), workstream: TaskSchema.shape.workstream })).max(20),
  saved: z.boolean(),
});

export const EventPlanSchema = z.object({
  id: str(80),
  schemaVersion: z.literal(1),
  isDemo: z.boolean(),
  createdAt: str(40),
  updatedAt: str(40),
  brief: BriefSchema,
  narrative: NarrativeSchema,
  budget: z.object({
    categories: z
      .array(
        z.object({
          key: str(60),
          label: str(120),
          basis: z.enum(['fixed', 'perGuest']),
          planned: nonneg,
          units: nonneg,
          unitLabel: str(40),
          notes: str(1000),
          essential: z.boolean(),
        }),
      )
      .max(60),
    contingencyPct: num.min(0).max(30),
    payments: z
      .array(
        z.object({
          id: str(80),
          vendorId: str(80),
          label: str(160),
          amount: nonneg,
          dueDate: date,
          status: z.enum(['scheduled', 'paid', 'refunded', 'cancelled']),
          paidOn: date.optional(),
        }),
      )
      .max(500),
    scenarioOverrides: z.object({
      lean: z.record(z.string(), nonneg),
      balanced: z.record(z.string(), nonneg),
      premium: z.record(z.string(), nonneg),
    }),
    allowPremiumOverCeiling: z.boolean(),
  }),
  vendors: z.array(VendorSchema).max(500),
  tasks: z.array(TaskSchema).max(1000),
  guests: z.array(GuestSchema).max(5000),
  runOfShow: z.array(RunItemSchema).max(500),
  daySettings: z.array(z.object({ dayIndex: z.number().int().min(0), soundCutoff: z.union([time, z.literal('')]) })).max(31),
  themes: z.array(ThemeSchema).max(20),
  themeVariant: z.number().int().min(0).default(0),
  appliedThemeId: str(80).optional(),
  team: z.array(z.object({ id: str(80), name: str(120), role: str(120), responsibilities: str(500), email: str(200) })).max(100),
  notes: z
    .array(
      z.object({
        id: str(80),
        at: str(40),
        kind: z.enum(['note', 'decision']),
        title: str(200),
        body: str(4000),
        authorId: str(80).optional(),
      }),
    )
    .max(1000),
  activity: z
    .array(
      z.object({
        id: str(80),
        at: str(40),
        actor: z.enum(['planner', 'copilot', 'system']),
        module: str(40),
        summary: str(600),
        details: z.array(str(600)).max(50).optional(),
      }),
    )
    .max(2000),
  lastScheduleChange: z.any().optional(),
});

export interface BackupFile {
  app: 'sutra-studio';
  kind: 'event-plan';
  version: 1;
  exportedAt: string;
  plan: EventPlan;
}

export function makeBackup(plan: EventPlan): BackupFile {
  return { app: 'sutra-studio', kind: 'event-plan', version: 1, exportedAt: new Date().toISOString(), plan };
}

export type ImportResult = { ok: true; plan: EventPlan; warnings: string[] } | { ok: false; errors: string[] };

export function parseBackup(text: string): ImportResult {
  if (text.length > 15_000_000) return { ok: false, errors: ['The file is larger than 15 MB.'] };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file is not valid JSON. Choose a backup exported from Sutrā Studio.'] };
  }
  if (!data || typeof data !== 'object') return { ok: false, errors: ['The file does not contain an event plan.'] };
  const obj = data as Record<string, unknown>;
  const candidate = obj.app === 'sutra-studio' && obj.kind === 'event-plan' ? obj.plan : obj;
  if (obj.app !== 'sutra-studio') {
    if (!candidate || typeof candidate !== 'object' || !('brief' in (candidate as object))) {
      return { ok: false, errors: ['This JSON was not exported from Sutrā Studio (missing the app marker and an event brief).'] };
    }
  }
  const parsed = EventPlanSchema.safeParse(candidate);
  if (!parsed.success) {
    const errors = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || 'file'}: ${i.message}`);
    if (parsed.error.issues.length > 6) errors.push(`…and ${parsed.error.issues.length - 6} more problems.`);
    return { ok: false, errors };
  }
  const plan = parsed.data as unknown as EventPlan;
  const warnings: string[] = [];
  const taskIds = new Set(plan.tasks.map((t) => t.id));
  let dangling = 0;
  for (const t of plan.tasks) {
    const before = t.dependsOn.length;
    t.dependsOn = t.dependsOn.filter((d) => taskIds.has(d) && d !== t.id);
    dangling += before - t.dependsOn.length;
  }
  if (dangling) warnings.push(`${dangling} task dependencies pointed at missing tasks and were removed.`);
  const vendorIds = new Set(plan.vendors.map((v) => v.id));
  const orphanPayments = plan.budget.payments.filter((p) => !vendorIds.has(p.vendorId)).length;
  if (orphanPayments) warnings.push(`${orphanPayments} payments reference vendors that are not in the file.`);
  return { ok: true, plan, warnings };
}

/** Give an imported or duplicated plan fresh identity so it never overwrites another event. */
export function withFreshIdentity(plan: EventPlan, nameSuffix = ''): EventPlan {
  const copy = deepClone(plan);
  const now = new Date().toISOString();
  copy.id = uid('evt');
  copy.isDemo = false;
  copy.createdAt = now;
  copy.updatedAt = now;
  if (nameSuffix) copy.brief.name = `${copy.brief.name}${nameSuffix}`;
  return copy;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function makeTemplate(plan: EventPlan, name: string): EventTemplate {
  const p = deepClone(plan);
  p.isDemo = false;
  p.guests = [];
  p.vendors = [];
  p.budget.payments = [];
  p.budget.scenarioOverrides = { lean: {}, balanced: {}, premium: {} };
  p.notes = [];
  p.activity = [];
  p.lastScheduleChange = undefined;
  p.brief.knownRisks = [];
  p.brief.clientName = '';
  p.tasks = p.tasks.map((t) => ({ ...t, status: 'todo', completedOn: undefined, notes: '' }));
  p.runOfShow = p.runOfShow.map((r) => ({ ...r, vendorIds: [], status: 'planned', timing: 'suggested' }));
  return {
    id: uid('tpl'),
    name: name.trim() || `${plan.brief.name} template`,
    createdAt: new Date().toISOString(),
    sourceEventName: plan.brief.name,
    type: plan.brief.type,
    plan: p,
  };
}

export interface TemplateOverrides {
  name: string;
  eventDate: ISODate;
  guestCount: number;
  totalBudget: number;
}

export function planFromTemplate(tpl: EventTemplate, o: TemplateOverrides, today: ISODate): EventPlan {
  const p = withFreshIdentity(tpl.plan);
  p.brief.name = o.name.trim() || tpl.plan.brief.name;
  p.brief.eventDate = o.eventDate;
  p.brief.guestCount = o.guestCount;
  p.brief.totalBudget = o.totalBudget;
  p.brief.venueStatus = p.brief.venueStatus === 'not_required' ? 'not_required' : 'searching';
  p.brief.venueName = '';
  const taskMap = new Map(p.tasks.map((t) => [t.id, uid('t')]));
  p.tasks = p.tasks.map((t) => {
    const due = addDays(o.eventDate, t.offsetDays);
    return {
      ...t,
      id: taskMap.get(t.id)!,
      dependsOn: t.dependsOn.map((d) => taskMap.get(d)!).filter(Boolean),
      dueDate: due < today ? today : due,
      schedule: 'relative',
    };
  });
  const runMap = new Map(p.runOfShow.map((r) => [r.id, uid('r')]));
  p.runOfShow = p.runOfShow.map((r) => ({
    ...r,
    id: runMap.get(r.id)!,
    dependsOn: r.dependsOn.map((d) => runMap.get(d)!).filter(Boolean),
  }));
  p.narrative = generateNarrative(p.brief, today, p.budget.contingencyPct, p.narrative);
  p.themes = generateConcepts(p.brief, today, 0);
  p.appliedThemeId = undefined;
  p.activity = [
    { id: uid('a'), at: new Date().toISOString(), actor: 'system', module: 'overview', summary: `Created from template “${tpl.name}”.` },
  ];
  return p;
}
