import { initialCategories } from './budget';
import { buildAssumptions, generateNarrative } from './brief';
import { eventTypeProfile, isIndia } from './catalog';
import { generateConcepts } from './themes';
import type {
  CategoryKey,
  CurrencyCode,
  DaySettings,
  EventBrief,
  EventPlan,
  EventType,
  ISODate,
  Priority,
  RunItem,
  Session,
  Setting,
  Task,
  TeamMember,
  VenueStatus,
  Workstream,
} from './types';
import { addDays, diffDays, isValidISODate, minutesToTime, uid } from './util';

export interface IntakeData {
  name: string;
  type: EventType;
  customTypeLabel: string;
  city: string;
  country: string;
  venueName: string;
  venueStatus: VenueStatus;
  eventDate: ISODate;
  durationDays: number;
  sessionCount: number;
  sessionNames: string;
  guestCount: number;
  totalBudget: number;
  currency: CurrencyCode;
  contingencyPct: number;
  style: string;
  colors: string[];
  atmosphere: string;
  culturalPreferences: string;
  dietarySpecified: boolean;
  vegetarianPct: number;
  veganCount: number;
  jainCount: number;
  allergens: string;
  dietaryNotes: string;
  accessibility: string[];
  accessibilityNotes: string;
  setting: Setting;
  weatherConcerns: string;
  plannerName: string;
  clientName: string;
  team: { name: string; role: string }[];
  protectedCategories: CategoryKey[];
  goals: string;
  nonNegotiables: string;
  knownRisks: string;
}

export function emptyIntake(today: ISODate): IntakeData {
  return {
    name: '',
    type: 'wedding',
    customTypeLabel: '',
    city: '',
    country: 'India',
    venueName: '',
    venueStatus: 'searching',
    eventDate: addDays(today, 150),
    durationDays: 1,
    sessionCount: 2,
    sessionNames: '',
    guestCount: 150,
    totalBudget: 2_500_000,
    currency: 'INR',
    contingencyPct: 7,
    style: '',
    colors: [],
    atmosphere: '',
    culturalPreferences: '',
    dietarySpecified: false,
    vegetarianPct: 50,
    veganCount: 0,
    jainCount: 0,
    allergens: '',
    dietaryNotes: '',
    accessibility: [],
    accessibilityNotes: '',
    setting: 'mixed',
    weatherConcerns: '',
    plannerName: '',
    clientName: '',
    team: [],
    protectedCategories: [],
    goals: '',
    nonNegotiables: '',
    knownRisks: '',
  };
}

export type IntakeErrors = Partial<Record<keyof IntakeData, string>>;

export function validateIntake(d: IntakeData, today: ISODate): IntakeErrors {
  const e: IntakeErrors = {};
  if (d.name.trim().length < 2) e.name = 'Give the event a name (at least 2 characters).';
  if (d.type === 'custom' && !d.customTypeLabel.trim()) e.customTypeLabel = 'Describe the custom event type.';
  if (!isValidISODate(d.eventDate)) e.eventDate = 'Enter a valid date.';
  else if (d.eventDate <= today) e.eventDate = 'The event date must be in the future.';
  else if (diffDays(today, d.eventDate) > 365 * 5) e.eventDate = 'Dates more than five years out are not supported.';
  if (!Number.isInteger(d.durationDays) || d.durationDays < 1 || d.durationDays > 14) e.durationDays = 'Duration must be 1–14 days.';
  if (!Number.isInteger(d.sessionCount) || d.sessionCount < 1 || d.sessionCount > 12) e.sessionCount = 'Between 1 and 12 sessions.';
  if (!Number.isFinite(d.guestCount) || d.guestCount < 1 || d.guestCount > 100_000 || !Number.isInteger(d.guestCount))
    e.guestCount = 'Guest count must be a whole number between 1 and 100,000.';
  if (!Number.isFinite(d.totalBudget) || d.totalBudget <= 0) e.totalBudget = 'Enter a budget greater than zero.';
  if (!Number.isFinite(d.contingencyPct) || d.contingencyPct < 0 || d.contingencyPct > 30) e.contingencyPct = 'Contingency must be 0–30%.';
  if (d.dietarySpecified && (d.vegetarianPct < 0 || d.vegetarianPct > 100)) e.vegetarianPct = 'Use a percentage between 0 and 100.';
  if (d.dietarySpecified && (d.veganCount < 0 || d.jainCount < 0 || d.veganCount + d.jainCount > d.guestCount))
    e.veganCount = 'Special-diet counts cannot exceed the guest count.';
  return e;
}

const SPLIT = /\n|,|;/;

function splitList(s: string): string[] {
  return s
    .split(SPLIT)
    .map((x) => x.trim())
    .filter(Boolean);
}

const SLOTS: Record<number, [string, string][]> = {
  1: [['18:30', '22:30']],
  2: [
    ['11:00', '14:30'],
    ['19:00', '22:30'],
  ],
  3: [
    ['09:30', '12:00'],
    ['13:00', '16:00'],
    ['19:00', '22:30'],
  ],
};

export function buildSessions(d: Pick<IntakeData, 'sessionCount' | 'sessionNames' | 'durationDays' | 'type' | 'setting'>): Session[] {
  const names = splitList(d.sessionNames);
  const defaults = eventTypeProfile(d.type).defaultSessions;
  const count = Math.max(1, Math.min(12, d.sessionCount || names.length || 1));
  const days = Math.max(1, d.durationDays);
  const perDay = Math.ceil(count / days);
  const sessions: Session[] = [];
  for (let i = 0; i < count; i++) {
    const dayIndex = Math.min(days - 1, Math.floor(i / perDay));
    const slotIdx = i % perDay;
    const slots = SLOTS[Math.min(3, perDay)] ?? SLOTS[3];
    const [start, end] = slots[Math.min(slotIdx, slots.length - 1)];
    sessions.push({
      id: uid('s'),
      name: names[i] ?? defaults[i] ?? `Session ${i + 1}`,
      dayIndex,
      start,
      end,
      setting: d.setting === 'mixed' ? (i % 2 === 0 ? 'indoor' : 'outdoor') : d.setting,
      hasMeal: true,
      area: d.setting === 'mixed' ? (i % 2 === 0 ? 'Main hall' : 'Lawn') : 'Main area',
    });
  }
  return sessions;
}

// ---------------------------------------------------------------------------
// Task templates — `at` is the fraction of the standard lead time before the event.
// ---------------------------------------------------------------------------

interface TaskTemplate {
  key: string;
  title: string;
  ws: Workstream;
  at: number;
  dur: number;
  deps?: string[];
  milestone?: boolean;
  requiresVenue?: boolean;
  vendor?: CategoryKey;
  role?: 'book' | 'requires';
  priority?: Priority;
  when?: (b: EventBrief, cats: Set<CategoryKey>) => boolean;
  fixedOffset?: number;
}

const has = (k: CategoryKey) => (_b: EventBrief, cats: Set<CategoryKey>) => cats.has(k);
const needsVenue = (b: EventBrief) => b.venueStatus !== 'not_required';

const TEMPLATES: TaskTemplate[] = [
  {
    key: 'brief',
    title: 'Confirm brief, priorities & budget with client',
    ws: 'planning',
    at: 1,
    dur: 3,
    milestone: true,
    priority: 'high',
  },
  {
    key: 'budget_ok',
    title: 'Approve budget framework',
    ws: 'finance',
    at: 0.95,
    dur: 3,
    deps: ['brief'],
    milestone: true,
    priority: 'high',
  },
  { key: 'venue_short', title: 'Shortlist venues', ws: 'venue', at: 0.9, dur: 7, deps: ['brief'], when: needsVenue },
  { key: 'venue_visit', title: 'Site visits & venue selection', ws: 'venue', at: 0.83, dur: 7, deps: ['venue_short'], when: needsVenue },
  {
    key: 'venue_book',
    title: 'Sign venue contract & pay advance',
    ws: 'venue',
    at: 0.78,
    dur: 3,
    deps: ['venue_visit'],
    milestone: true,
    vendor: 'venue',
    role: 'book',
    priority: 'high',
    when: needsVenue,
  },
  {
    key: 'floorplan',
    title: 'Floor plan & capacity sign-off',
    ws: 'venue',
    at: 0.6,
    dur: 5,
    deps: ['venue_book'],
    requiresVenue: true,
    when: needsVenue,
  },
  {
    key: 'caterer_short',
    title: 'Shortlist caterers & arrange tastings',
    ws: 'catering',
    at: 0.75,
    dur: 10,
    deps: ['budget_ok'],
    when: has('catering'),
  },
  {
    key: 'caterer_book',
    title: 'Book caterer',
    ws: 'catering',
    at: 0.65,
    dur: 3,
    deps: ['caterer_short'],
    vendor: 'catering',
    role: 'book',
    priority: 'high',
    when: has('catering'),
  },
  {
    key: 'menu',
    title: 'Finalise menus & dietary counters',
    ws: 'catering',
    at: 0.3,
    dur: 7,
    deps: ['caterer_book'],
    requiresVenue: true,
    vendor: 'catering',
    role: 'requires',
    when: has('catering'),
  },
  { key: 'design_dir', title: 'Creative direction & moodboard sign-off', ws: 'design', at: 0.7, dur: 7, deps: ['brief'] },
  {
    key: 'decor_book',
    title: 'Book décor & florals',
    ws: 'design',
    at: 0.6,
    dur: 3,
    deps: ['design_dir'],
    vendor: 'decor',
    role: 'book',
    when: has('decor'),
  },
  {
    key: 'decor_layout',
    title: 'Décor layout for each space',
    ws: 'design',
    at: 0.35,
    dur: 7,
    deps: ['decor_book', 'floorplan'],
    requiresVenue: true,
    vendor: 'decor',
    role: 'requires',
    when: has('decor'),
  },
  {
    key: 'photo_book',
    title: 'Book photography & film',
    ws: 'media',
    at: 0.62,
    dur: 3,
    deps: ['budget_ok'],
    vendor: 'photography',
    role: 'book',
    when: has('photography'),
  },
  {
    key: 'shotlist',
    title: 'Shot list & key moments',
    ws: 'media',
    at: 0.12,
    dur: 3,
    deps: ['photo_book'],
    vendor: 'photography',
    role: 'requires',
    when: has('photography'),
  },
  {
    key: 'ent_book',
    title: 'Book entertainment',
    ws: 'entertainment',
    at: 0.5,
    dur: 3,
    deps: ['budget_ok'],
    vendor: 'entertainment',
    role: 'book',
    when: has('entertainment'),
  },
  {
    key: 'prod_book',
    title: 'Book lighting, sound & staging',
    ws: 'production',
    at: 0.45,
    dur: 3,
    deps: ['floorplan'],
    vendor: 'production',
    role: 'book',
    requiresVenue: true,
    when: has('production'),
  },
  {
    key: 'permits',
    title: 'Apply for permits & sound permissions',
    ws: 'production',
    at: 0.4,
    dur: 14,
    deps: ['floorplan'],
    requiresVenue: true,
    when: (b, c) => c.has('permits') && needsVenue(b),
  },
  { key: 'guest_list', title: 'Consolidate guest list', ws: 'guests', at: 0.72, dur: 7, deps: ['brief'], priority: 'high' },
  { key: 'invites', title: 'Send invitations', ws: 'guests', at: 0.55, dur: 3, deps: ['guest_list'], milestone: true },
  { key: 'rsvp_close', title: 'RSVP deadline & headcount freeze', ws: 'guests', at: 0.12, dur: 1, deps: ['invites'], milestone: true },
  {
    key: 'plate',
    title: 'Confirm final headcount to caterer',
    ws: 'catering',
    at: 0.06,
    dur: 1,
    deps: ['rsvp_close'],
    vendor: 'catering',
    role: 'requires',
    when: has('catering'),
  },
  {
    key: 'access',
    title: 'Accessibility plan (step-free routes, seating, assistance)',
    ws: 'guests',
    at: 0.25,
    dur: 5,
    deps: ['floorplan'],
    requiresVenue: true,
  },
  {
    key: 'accom',
    title: 'Room block & rooming list',
    ws: 'logistics',
    at: 0.4,
    dur: 5,
    deps: ['guest_list'],
    vendor: 'accommodation',
    role: 'book',
    when: has('accommodation'),
  },
  { key: 'transport', title: 'Guest transport schedule', ws: 'logistics', at: 0.15, dur: 3, deps: ['rsvp_close'], when: has('transport') },
  { key: 'gifts', title: 'Gifts & favours procurement', ws: 'guests', at: 0.2, dur: 7, when: has('gifts') },
  {
    key: 'safety',
    title: 'Safety, first-aid & crowd-management plan',
    ws: 'production',
    at: 0.2,
    dur: 4,
    deps: ['floorplan'],
    when: (b) => ['community', 'festival', 'cultural'].includes(b.type) || b.guestCount >= 300,
  },
  {
    key: 'weather',
    title: 'Weather contingency plan',
    ws: 'production',
    at: 0.2,
    dur: 2,
    deps: ['floorplan'],
    when: (b) => b.setting !== 'indoor',
  },
  { key: 'payments', title: 'Payment schedule review with client', ws: 'finance', at: 0.5, dur: 1, deps: ['budget_ok'] },
  { key: 'ros', title: 'Draft run of show', ws: 'production', at: 0.2, dur: 3, deps: ['floorplan'] },
  { key: 'confirm', title: 'Final vendor confirmations & call times', ws: 'planning', at: 0.05, dur: 2, deps: ['ros'], priority: 'high' },
  {
    key: 'rehearsal',
    title: 'Rehearsal & technical walk-through',
    ws: 'production',
    at: 0,
    dur: 1,
    deps: ['confirm'],
    milestone: true,
    fixedOffset: -1,
  },
  { key: 'reconcile', title: 'Final reconciliation & vendor settlements', ws: 'finance', at: 0, dur: 3, milestone: true, fixedOffset: 7 },
];

function ownerFor(ws: Workstream, team: TeamMember[]): string | undefined {
  const find = (re: RegExp) => team.find((m) => re.test(`${m.role} ${m.responsibilities}`.toLowerCase()))?.id;
  const rules: Partial<Record<Workstream, RegExp>> = {
    venue: /vendor|logistic|operation|venue/,
    logistics: /logistic|vendor|travel|operation/,
    catering: /guest|hospitality|catering|f&b/,
    guests: /guest|hospitality|rsvp/,
    production: /production|technical|operation/,
    design: /design|creative|décor|decor|production/,
    entertainment: /entertain|vendor|production/,
    media: /vendor|creative|media/,
    finance: /financ|account|admin|budget/,
  };
  const re = rules[ws];
  return (re && find(re)) || team[0]?.id;
}

export function buildTasks(
  brief: EventBrief,
  cats: Set<CategoryKey>,
  team: TeamMember[],
  today: ISODate,
): { tasks: Task[]; compressed: number } {
  const profile = eventTypeProfile(brief.type);
  const lead = diffDays(today, brief.eventDate);
  const usable = Math.max(1, lead - 2);
  const span = Math.min(profile.standardLead, usable);
  const chosen = TEMPLATES.filter((t) => !t.when || t.when(brief, cats));
  const keys = new Set(chosen.map((t) => t.key));
  const ids = new Map(chosen.map((t) => [t.key, uid('t')]));
  let compressed = 0;
  const tasks = chosen.map((t) => {
    const offset = t.fixedOffset ?? -Math.round(t.at * span);
    if (t.fixedOffset === undefined && lead < profile.standardLead) compressed++;
    let due = addDays(brief.eventDate, offset);
    if (due < today) due = today;
    const venueDone = t.key.startsWith('venue_') && brief.venueStatus === 'confirmed';
    return {
      id: ids.get(t.key)!,
      title: t.title,
      workstream: t.ws,
      ownerId: ownerFor(t.ws, team),
      status: venueDone ? 'done' : 'todo',
      priority: t.priority ?? (t.milestone ? 'high' : 'medium'),
      dueDate: due,
      durationDays: t.dur,
      dependsOn: (t.deps ?? []).filter((d) => keys.has(d)).map((d) => ids.get(d)!),
      schedule: 'relative',
      offsetDays: offset,
      milestone: !!t.milestone,
      requiresVenue: !!t.requiresVenue && brief.venueStatus !== 'not_required',
      vendorCategory: t.vendor,
      vendorRole: t.role,
      notes: '',
      completedOn: venueDone ? today : undefined,
      source: 'template',
    } satisfies Task;
  });
  return { tasks, compressed };
}

export function buildRunOfShow(brief: EventBrief, team: TeamMember[]): RunItem[] {
  const items: RunItem[] = [];
  const seenArea = new Set<string>();
  const lead = team[0]?.id;
  const guestLead = team.find((m) => /guest|hospitality/i.test(m.role))?.id ?? lead;
  for (const s of brief.sessions) {
    const [h, m] = s.start.split(':').map(Number);
    const startMin = h * 60 + m;
    items.push({
      id: uid('r'),
      dayIndex: s.dayIndex,
      start: minutesToTime(startMin - 30),
      end: s.start,
      title: `Guest arrivals — ${s.name}`,
      location: 'Arrival & welcome desk',
      leadId: guestLead,
      vendorIds: [],
      setupMinutes: 0,
      setupNotes: '',
      dependsOn: [],
      bufferMinutes: 0,
      timing: 'suggested',
      status: 'planned',
      contingency: '',
      amplifiedSound: false,
    });
    const firstInArea = !seenArea.has(s.area);
    seenArea.add(s.area);
    items.push({
      id: uid('r'),
      dayIndex: s.dayIndex,
      start: s.start,
      end: s.end,
      title: s.name,
      location: s.area || 'Main area',
      leadId: lead,
      vendorIds: [],
      setupMinutes: firstInArea ? 120 : 60,
      setupNotes: firstInArea ? 'Décor, seating and technical setup.' : 'Changeover from previous session.',
      dependsOn: [],
      bufferMinutes: 15,
      timing: 'suggested',
      status: 'planned',
      contingency: s.setting === 'outdoor' ? 'Agree a covered fallback space with the venue.' : '',
      amplifiedSound: false,
    });
  }
  return items;
}

export function buildDaySettings(brief: EventBrief): DaySettings[] {
  return Array.from({ length: Math.max(1, brief.durationDays) }, (_, i) => ({
    dayIndex: i,
    soundCutoff: isIndia(brief.country) ? '22:00' : '',
  }));
}

export function briefFromIntake(d: IntakeData): EventBrief {
  return {
    name: d.name.trim(),
    type: d.type,
    customTypeLabel: d.customTypeLabel.trim(),
    city: d.city.trim(),
    country: d.country.trim() || 'India',
    venueName: d.venueName.trim(),
    venueStatus: d.venueStatus,
    eventDate: d.eventDate,
    durationDays: d.durationDays,
    sessions: buildSessions(d),
    guestCount: Math.round(d.guestCount),
    totalBudget: Math.round(d.totalBudget),
    currency: d.currency,
    style: d.style.trim(),
    themeName: '',
    colors: d.colors,
    atmosphere: d.atmosphere.trim(),
    culturalPreferences: d.culturalPreferences.trim(),
    dietary: {
      vegetarianPct: d.dietarySpecified ? d.vegetarianPct : 50,
      veganCount: d.dietarySpecified ? d.veganCount : 0,
      jainCount: d.dietarySpecified ? d.jainCount : 0,
      allergens: splitList(d.allergens),
      notes: d.dietaryNotes.trim(),
    },
    dietarySpecified: d.dietarySpecified,
    accessibility: d.accessibility,
    accessibilityNotes: d.accessibilityNotes.trim(),
    setting: d.setting,
    weatherConcerns: d.weatherConcerns.trim(),
    plannerName: d.plannerName.trim(),
    clientName: d.clientName.trim(),
    protectedCategories: d.protectedCategories,
    goals: d.goals.trim(),
    nonNegotiables: splitList(d.nonNegotiables),
    knownRisks: splitList(d.knownRisks),
  };
}

export function generatePlan(d: IntakeData, today: ISODate): EventPlan {
  const brief = briefFromIntake(d);
  const now = new Date().toISOString();
  const team: TeamMember[] = [
    {
      id: uid('m'),
      name: brief.plannerName || 'Lead planner',
      role: 'Lead planner',
      responsibilities: 'Client relationship, budget and creative sign-off',
      email: '',
    },
    ...d.team
      .filter((m) => m.name.trim())
      .map((m) => ({ id: uid('m'), name: m.name.trim(), role: m.role.trim() || 'Team member', responsibilities: '', email: '' })),
  ];
  const categories = initialCategories(brief, d.contingencyPct);
  const cats = new Set(categories.map((c) => c.key));
  const { tasks } = buildTasks(brief, cats, team, today);
  const narrative = generateNarrative(brief, today, d.contingencyPct);
  narrative.assumptions = buildAssumptions(brief, today, d.contingencyPct);
  return {
    id: uid('evt'),
    schemaVersion: 1,
    isDemo: false,
    createdAt: now,
    updatedAt: now,
    brief,
    narrative,
    budget: {
      categories,
      contingencyPct: d.contingencyPct,
      payments: [],
      scenarioOverrides: { lean: {}, balanced: {}, premium: {} },
      allowPremiumOverCeiling: false,
    },
    vendors: [],
    tasks,
    guests: [],
    runOfShow: buildRunOfShow(brief, team),
    daySettings: buildDaySettings(brief),
    themes: generateConcepts(brief, today, 0),
    themeVariant: 0,
    team,
    notes: [],
    activity: [
      {
        id: uid('a'),
        at: now,
        actor: 'system',
        module: 'brief',
        summary: `Plan generated from intake: ${tasks.length} tasks, ${categories.length} budget categories, ${brief.sessions.length} sessions.`,
      },
    ],
  };
}
