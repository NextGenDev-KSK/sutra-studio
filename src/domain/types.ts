// Core data model for Sutrā Studio. Every view reads from these records and
// every calculation (budget, schedule, run-of-show) is derived from them —
// nothing shown in the UI is a hard-coded display value.

export type ID = string;
/** Calendar date, `YYYY-MM-DD`, interpreted as a local calendar day. */
export type ISODate = string;
/** Clock time, `HH:MM` (24h). */
export type ClockTime = string;

export type EventType =
  'wedding' | 'engagement' | 'birthday' | 'anniversary' | 'baby_shower' | 'community' | 'festival' | 'cultural' | 'corporate' | 'custom';

export type CurrencyCode = 'INR' | 'USD' | 'GBP' | 'EUR' | 'AED' | 'SGD';
export type VenueStatus = 'confirmed' | 'shortlisted' | 'searching' | 'not_required';
export type Setting = 'indoor' | 'outdoor' | 'covered' | 'mixed';

export type ViewKey = 'overview' | 'brief' | 'budget' | 'timeline' | 'vendors' | 'themes' | 'guests' | 'runofshow' | 'team' | 'exports';

export interface Session {
  id: ID;
  name: string;
  /** 0-based day of the event (day 0 is the event date). */
  dayIndex: number;
  start: ClockTime;
  end: ClockTime;
  setting: Setting;
  hasMeal: boolean;
  area: string;
}

export interface DietaryProfile {
  /** Share of guests eating vegetarian, 0–100. Remainder is non-vegetarian. */
  vegetarianPct: number;
  veganCount: number;
  jainCount: number;
  allergens: string[];
  notes: string;
}

export type CategoryKey = string;

export interface EventBrief {
  name: string;
  type: EventType;
  customTypeLabel: string;
  city: string;
  country: string;
  venueName: string;
  venueStatus: VenueStatus;
  eventDate: ISODate;
  durationDays: number;
  sessions: Session[];
  guestCount: number;
  totalBudget: number;
  currency: CurrencyCode;
  style: string;
  themeName: string;
  colors: string[];
  atmosphere: string;
  /** Voluntarily provided by the planner/client. Never inferred. */
  culturalPreferences: string;
  dietary: DietaryProfile;
  dietarySpecified: boolean;
  accessibility: string[];
  accessibilityNotes: string;
  setting: Setting;
  weatherConcerns: string;
  plannerName: string;
  clientName: string;
  /** Budget categories the client wants protected from cuts. */
  protectedCategories: CategoryKey[];
  goals: string;
  nonNegotiables: string[];
  knownRisks: string[];
}

export interface Assumption {
  id: ID;
  text: string;
  /** Brief field the assumption relates to, for "edit" links. */
  field?: string;
}

export type NarrativeField = 'vision' | 'objectives' | 'audience' | 'guestExperienceIdeas' | 'openQuestions';

export interface Narrative {
  generatedAt: string;
  vision: string;
  objectives: string[];
  audience: string;
  assumptions: Assumption[];
  openQuestions: string[];
  guestExperienceIdeas: string[];
  /** Fields the planner edited by hand — kept when the brief is regenerated. */
  edited: Partial<Record<NarrativeField, boolean>>;
}

export type CostBasis = 'fixed' | 'perGuest';
export type ScenarioKey = 'lean' | 'balanced' | 'premium';

export interface BudgetCategory {
  key: CategoryKey;
  label: string;
  basis: CostBasis;
  /** Fixed total (basis=fixed) or rate per guest per unit (basis=perGuest). */
  planned: number;
  /** For perGuest: units per guest (e.g. meal services, nights). 1 for fixed. */
  units: number;
  unitLabel: string;
  notes: string;
  essential: boolean;
}

export type PaymentStatus = 'scheduled' | 'paid' | 'refunded' | 'cancelled';

export interface Payment {
  id: ID;
  vendorId: ID;
  label: string;
  amount: number;
  dueDate: ISODate;
  status: PaymentStatus;
  paidOn?: ISODate;
}

export interface BudgetState {
  categories: BudgetCategory[];
  contingencyPct: number;
  payments: Payment[];
  /** Planner edits to generated scenarios, per scenario, per category (same unit as `planned`). */
  scenarioOverrides: Record<ScenarioKey, Record<CategoryKey, number>>;
  allowPremiumOverCeiling: boolean;
}

export type VendorStatus = 'identified' | 'contacted' | 'quoted' | 'shortlisted' | 'booked' | 'completed' | 'rejected' | 'cancelled';

export interface Quote {
  basis: CostBasis;
  /** Fixed total, or rate per guest per unit. */
  amount: number;
  units: number;
  deliverables: string;
  receivedOn?: ISODate;
  validUntil?: ISODate;
}

export type VerificationLevel = 'illustrative' | 'unverified' | 'verified';

export interface Verification {
  level: VerificationLevel;
  sourceUrl?: string;
  checkedOn?: ISODate;
  note?: string;
}

export type Availability = 'unknown' | 'requested' | 'confirmed' | 'unavailable';

export interface Vendor {
  id: ID;
  name: string;
  category: CategoryKey;
  location: string;
  serviceArea: string;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  quote: Quote | null;
  availability: Availability;
  status: VendorStatus;
  preferred: boolean;
  pros: string[];
  cons: string[];
  notes: string;
  nextAction: string;
  verification: Verification;
  bookedOn?: ISODate;
  createdAt: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type Priority = 'high' | 'medium' | 'low';
export type Workstream =
  'planning' | 'venue' | 'catering' | 'design' | 'media' | 'entertainment' | 'guests' | 'logistics' | 'production' | 'finance';

export interface Task {
  id: ID;
  title: string;
  workstream: Workstream;
  ownerId?: ID;
  status: TaskStatus;
  priority: Priority;
  dueDate: ISODate;
  durationDays: number;
  dependsOn: ID[];
  /** relative: moves with the event date. pinned: a manual date the planner set. */
  schedule: 'relative' | 'pinned';
  /** Due date offset from the event date in days (negative = before). */
  offsetDays: number;
  milestone: boolean;
  requiresVenue: boolean;
  vendorCategory?: CategoryKey;
  /** book: completing this task books the category. requires: needs a booked vendor. */
  vendorRole?: 'book' | 'requires';
  notes: string;
  completedOn?: ISODate;
  source: 'template' | 'planner' | 'copilot' | 'theme';
}

export type TimingStatus = 'confirmed' | 'suggested';
export type RunStatus = 'planned' | 'ready' | 'at_risk';

export interface RunItem {
  id: ID;
  dayIndex: number;
  start: ClockTime;
  end: ClockTime;
  title: string;
  location: string;
  leadId?: ID;
  vendorIds: ID[];
  setupMinutes: number;
  setupNotes: string;
  dependsOn: ID[];
  bufferMinutes: number;
  timing: TimingStatus;
  status: RunStatus;
  contingency: string;
  amplifiedSound: boolean;
}

export interface DaySettings {
  dayIndex: number;
  /** Planner-set amplified sound cut-off (check local rules & venue policy). Empty = none. */
  soundCutoff: ClockTime | '';
}

export type RSVP = 'pending' | 'confirmed' | 'declined' | 'tentative';
export type Diet = 'vegetarian' | 'non_vegetarian' | 'vegan' | 'jain' | 'other' | 'unknown';

export interface Guest {
  id: ID;
  name: string;
  group: string;
  partySize: number;
  rsvp: RSVP;
  diet: Diet;
  allergies: string;
  accessibility: string;
  assistanceNotes: string;
  table: string;
  contact: string;
  notes: string;
}

export interface PaletteColor {
  name: string;
  hex: string;
}

export interface ThemeConcept {
  id: ID;
  name: string;
  archetype: string;
  rationale: string;
  palette: PaletteColor[];
  decor: string;
  lighting: string;
  florals: string;
  attire: string;
  food: string;
  guestExperience: string;
  photography: string;
  /** Multipliers applied to category plans when this concept is applied. */
  costFactors: Partial<Record<CategoryKey, number>>;
  practicality: number;
  logistics: string[];
  weather: string[];
  leadTimeDays: number;
  procurement: { title: string; offsetDays: number; workstream: Workstream }[];
  saved: boolean;
}

export interface TeamMember {
  id: ID;
  name: string;
  role: string;
  responsibilities: string;
  email: string;
}

export interface Note {
  id: ID;
  at: string;
  kind: 'note' | 'decision';
  title: string;
  body: string;
  authorId?: ID;
}

export type Actor = 'planner' | 'copilot' | 'system';

export interface ActivityEntry {
  id: ID;
  at: string;
  actor: Actor;
  module: ViewKey;
  summary: string;
  details?: string[];
}

export interface ScheduleChangeReport {
  at: string;
  oldDate: ISODate;
  newDate: ISODate;
  deltaDays: number;
  moved: { id: ID; title: string; from: ISODate; to: ISODate }[];
  compressed: { id: ID; title: string; wanted: ISODate; to: ISODate }[];
  preserved: { id: ID; title: string }[];
  pinned: { id: ID; title: string; date: ISODate; conflict: boolean }[];
  conflicts: string[];
  paymentsAfterEvent: { id: ID; label: string; dueDate: ISODate }[];
}

export interface EventPlan {
  id: ID;
  schemaVersion: 1;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  brief: EventBrief;
  narrative: Narrative;
  budget: BudgetState;
  vendors: Vendor[];
  tasks: Task[];
  guests: Guest[];
  runOfShow: RunItem[];
  daySettings: DaySettings[];
  themes: ThemeConcept[];
  themeVariant: number;
  appliedThemeId?: ID;
  team: TeamMember[];
  notes: Note[];
  activity: ActivityEntry[];
  lastScheduleChange?: ScheduleChangeReport;
}

export interface EventTemplate {
  id: ID;
  name: string;
  createdAt: string;
  sourceEventName: string;
  type: EventType;
  /** Plan with guests, vendors and payments removed and task progress reset. */
  plan: EventPlan;
}
