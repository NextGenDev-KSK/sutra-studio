import type {
  CategoryKey,
  CostBasis,
  CurrencyCode,
  Diet,
  EventType,
  Priority,
  RSVP,
  ScenarioKey,
  Setting,
  TaskStatus,
  VendorStatus,
  VenueStatus,
  ViewKey,
  Workstream,
} from './types';

// ---------------------------------------------------------------------------
// Budget categories and ILLUSTRATIVE benchmark rates.
//
// Rates are planning heuristics in INR for a reference event (≈150 guests,
// one day, a non-metro Indian city, "wedding" scale). They are NOT market
// quotations and the UI always labels them as illustrative estimates.
// ---------------------------------------------------------------------------

export type UnitsRule = 'one' | 'mealSessions' | 'nights';

/** How a fixed-cost benchmark scales with the event's shape. */
export type FixedScaling = 'event' | 'perDay' | 'perSession';

export interface CategoryMeta {
  key: CategoryKey;
  label: string;
  basis: CostBasis;
  units: UnitsRule;
  unitLabel: string;
  scaling: FixedScaling;
  /** Scales with guest count (fixed costs only): rate × (guests/150)^exp. */
  guestExponent: number;
  essential: boolean;
  vendorLabel: string;
  tiers: Record<ScenarioKey, number>;
  leanTradeoff: string;
  premiumUpgrade: string;
  description: string;
}

export const CATEGORY_META: CategoryMeta[] = [
  {
    key: 'venue',
    label: 'Venue',
    basis: 'fixed',
    units: 'one',
    unitLabel: '',
    scaling: 'perDay',
    guestExponent: 0.5,
    essential: true,
    vendorLabel: 'Venues',
    tiers: { lean: 250_000, balanced: 500_000, premium: 900_000 },
    leanTradeoff: 'Fewer exclusive-use hours and a less central location; tighter load-in windows.',
    premiumUpgrade: 'Exclusive use of a landmark property with multiple spaces and an indoor fallback.',
    description: 'Hire, exclusive use, venue staff and in-house facilities.',
  },
  {
    key: 'catering',
    label: 'Catering',
    basis: 'perGuest',
    units: 'mealSessions',
    unitLabel: 'meal service',
    scaling: 'event',
    guestExponent: 0,
    essential: true,
    vendorLabel: 'Caterers',
    tiers: { lean: 1_100, balanced: 2_000, premium: 3_500 },
    leanTradeoff: 'Buffet-led service with fewer live counters and a simpler dessert spread.',
    premiumUpgrade: 'Chef-led live counters, plated courses for key moments and specialty dessert stations.',
    description: 'Food and non-alcoholic beverages per guest per meal service.',
  },
  {
    key: 'decor',
    label: 'Décor & florals',
    basis: 'fixed',
    units: 'one',
    unitLabel: '',
    scaling: 'perSession',
    guestExponent: 0.4,
    essential: true,
    vendorLabel: 'Decorators & florists',
    tiers: { lean: 180_000, balanced: 350_000, premium: 700_000 },
    leanTradeoff: 'Focus décor on two hero spaces; more greenery and textiles, fewer imported flowers.',
    premiumUpgrade: 'Bespoke installations in every space, abundant seasonal florals and custom fabrication.',
    description: 'Design, florals, props, fabrication and installation.',
  },
  {
    key: 'photography',
    label: 'Photo & film',
    basis: 'fixed',
    units: 'one',
    unitLabel: '',
    scaling: 'perDay',
    guestExponent: 0.15,
    essential: true,
    vendorLabel: 'Photographers & videographers',
    tiers: { lean: 100_000, balanced: 220_000, premium: 450_000 },
    leanTradeoff: 'Smaller crew, highlights film instead of a full documentary edit.',
    premiumUpgrade: 'Larger candid crew, cinematic film, same-day edit and heirloom albums.',
    description: 'Photography, videography, editing and albums.',
  },
  {
    key: 'entertainment',
    label: 'Entertainment',
    basis: 'fixed',
    units: 'one',
    unitLabel: '',
    scaling: 'perSession',
    guestExponent: 0.2,
    essential: false,
    vendorLabel: 'Entertainment & performers',
    tiers: { lean: 40_000, balanced: 100_000, premium: 260_000 },
    leanTradeoff: 'One live act plus a DJ; fewer performance sets.',
    premiumUpgrade: 'Headline performers, choreography support and curated acts per session.',
    description: 'Live music, DJs, performers, choreography and MCs.',
  },
  {
    key: 'production',
    label: 'Light, sound & staging',
    basis: 'fixed',
    units: 'one',
    unitLabel: '',
    scaling: 'perSession',
    guestExponent: 0.4,
    essential: true,
    vendorLabel: 'Lighting, sound & staging',
    tiers: { lean: 50_000, balanced: 110_000, premium: 260_000 },
    leanTradeoff: 'Standard PA and wash lighting; minimal staging and no special effects.',
    premiumUpgrade: 'Architectural lighting design, line-array sound and custom staging.',
    description: 'Technical production, power, staging, structures and crew.',
  },
  {
    key: 'accommodation',
    label: 'Accommodation',
    basis: 'perGuest',
    units: 'nights',
    unitLabel: 'night',
    scaling: 'event',
    guestExponent: 0,
    essential: false,
    vendorLabel: 'Hotels & stays',
    tiers: { lean: 900, balanced: 1_900, premium: 4_000 },
    leanTradeoff: 'Room blocks in nearby business hotels; host only immediate family and elders.',
    premiumUpgrade: 'Heritage or luxury room blocks for all outstation guests, near the venue.',
    description: 'Averaged across all guests (assumes roughly half are outstation, twin-sharing).',
  },
  {
    key: 'transport',
    label: 'Transport',
    basis: 'perGuest',
    units: 'one',
    unitLabel: '',
    scaling: 'event',
    guestExponent: 0,
    essential: false,
    vendorLabel: 'Transport',
    tiers: { lean: 350, balanced: 750, premium: 1_600 },
    leanTradeoff: 'Shared shuttles on fixed loops only.',
    premiumUpgrade: 'On-call cars for elders and VIPs plus timed airport and rail transfers.',
    description: 'Guest shuttles, transfers and vendor logistics.',
  },
  {
    key: 'attire',
    label: 'Styling & attire',
    basis: 'fixed',
    units: 'one',
    unitLabel: '',
    scaling: 'event',
    guestExponent: 0,
    essential: false,
    vendorLabel: 'Makeup & styling',
    tiers: { lean: 40_000, balanced: 110_000, premium: 280_000 },
    leanTradeoff: 'Styling for the hosts only; outfits sourced by the client directly.',
    premiumUpgrade: 'Dedicated styling team per session and outfit coordination for the family.',
    description: 'Planner-coordinated styling, makeup and attire services.',
  },
  {
    key: 'printing',
    label: 'Invitations & print',
    basis: 'perGuest',
    units: 'one',
    unitLabel: '',
    scaling: 'event',
    guestExponent: 0,
    essential: false,
    vendorLabel: 'Printing & stationery',
    tiers: { lean: 60, balanced: 180, premium: 550 },
    leanTradeoff: 'Digital invitations with printed signage only.',
    premiumUpgrade: 'Letterpress or handmade invitation suites and printed on-site stationery.',
    description: 'Invitations, signage, menus and on-site print.',
  },
  {
    key: 'gifts',
    label: 'Gifts & favours',
    basis: 'perGuest',
    units: 'one',
    unitLabel: '',
    scaling: 'event',
    guestExponent: 0,
    essential: false,
    vendorLabel: 'Gifts & specialty',
    tiers: { lean: 200, balanced: 550, premium: 1_400 },
    leanTradeoff: 'One consumable favour per household rather than per guest.',
    premiumUpgrade: 'Curated welcome hampers with local crafts for every guest.',
    description: 'Welcome hampers, favours and return gifts.',
  },
  {
    key: 'staffing',
    label: 'Staffing & security',
    basis: 'fixed',
    units: 'one',
    unitLabel: '',
    scaling: 'perDay',
    guestExponent: 0.6,
    essential: true,
    vendorLabel: 'Staffing & security',
    tiers: { lean: 30_000, balanced: 60_000, premium: 120_000 },
    leanTradeoff: 'Leaner hospitality desk; venue staff cover ushering.',
    premiumUpgrade: 'Dedicated hospitality concierge, ushers per space and guest-relations team.',
    description: 'Event staff, ushers, hospitality desk and security.',
  },
  {
    key: 'permits',
    label: 'Permits & licences',
    basis: 'fixed',
    units: 'one',
    unitLabel: '',
    scaling: 'event',
    guestExponent: 0.2,
    essential: true,
    vendorLabel: 'Permits',
    tiers: { lean: 15_000, balanced: 25_000, premium: 40_000 },
    leanTradeoff: 'Only mandatory permissions; no buffer for expedited processing.',
    premiumUpgrade: 'Specialist liaison for permissions and expedited processing.',
    description: 'Sound, police, fire, music licensing and municipal permissions (verify locally).',
  },
  {
    key: 'accessibility',
    label: 'Accessibility',
    basis: 'fixed',
    units: 'one',
    unitLabel: '',
    scaling: 'event',
    guestExponent: 0.3,
    essential: true,
    vendorLabel: 'Accessibility services',
    tiers: { lean: 20_000, balanced: 40_000, premium: 80_000 },
    leanTradeoff: 'Temporary ramps and reserved seating only.',
    premiumUpgrade: 'Step-free routes everywhere, buggy shuttles, hearing loops and assistance staff.',
    description: 'Ramps, accessible seating and transport, assistance staff and aids.',
  },
];

export const CATEGORY_KEYS = CATEGORY_META.map((c) => c.key);

export function categoryMeta(key: CategoryKey): CategoryMeta | undefined {
  return CATEGORY_META.find((c) => c.key === key);
}

/** Keywords the co-pilot uses to recognise categories in natural language. */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  venue: ['venue', 'hall', 'location', 'property', 'haveli', 'banquet'],
  catering: ['catering', 'caterer', 'food', 'menu', 'meal', 'plate', 'kitchen', 'dining'],
  decor: ['decor', 'décor', 'decorator', 'decoration', 'florist', 'floral', 'flowers', 'design'],
  photography: ['photo', 'photography', 'photographer', 'video', 'videography', 'film', 'camera', 'album'],
  entertainment: ['entertainment', 'music', 'band', 'dj', 'performer', 'performance', 'choreograph', 'dance'],
  production: ['lighting', 'sound', 'staging', 'stage', 'production', 'av', 'audio', 'tent', 'structure'],
  accommodation: ['accommodation', 'hotel', 'rooms', 'stay', 'room block'],
  transport: ['transport', 'shuttle', 'cars', 'transfer', 'bus', 'travel'],
  attire: ['attire', 'styling', 'makeup', 'make-up', 'stylist', 'outfit', 'clothing'],
  printing: ['print', 'printing', 'invitation', 'invite', 'stationery', 'signage'],
  gifts: ['gift', 'gifts', 'favour', 'favor', 'hamper'],
  staffing: ['staff', 'staffing', 'security', 'usher', 'hospitality desk'],
  permits: ['permit', 'permits', 'licence', 'license', 'permission'],
  accessibility: ['accessibility', 'accessible', 'wheelchair', 'ramp'],
};

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface EventTypeProfile {
  type: EventType;
  label: string;
  /** Multiplier on fixed-cost benchmarks relative to a wedding. */
  fixedScale: number;
  /** Multiplier on per-guest benchmarks relative to a wedding. */
  perGuestScale: number;
  categories: CategoryKey[];
  /** Typical planning lead time in days. */
  standardLead: number;
  defaultSessions: string[];
  defaultGuests: number;
}

const ALL = CATEGORY_KEYS;

export const EVENT_TYPES: EventTypeProfile[] = [
  {
    type: 'wedding',
    label: 'Wedding',
    fixedScale: 1,
    perGuestScale: 1,
    categories: ALL,
    standardLead: 240,
    defaultSessions: ['Welcome gathering', 'Ceremony', 'Reception dinner'],
    defaultGuests: 200,
  },
  {
    type: 'engagement',
    label: 'Engagement',
    fixedScale: 0.55,
    perGuestScale: 0.85,
    categories: [
      'venue',
      'catering',
      'decor',
      'photography',
      'entertainment',
      'production',
      'attire',
      'printing',
      'gifts',
      'staffing',
      'accessibility',
    ],
    standardLead: 120,
    defaultSessions: ['Engagement ceremony', 'Dinner celebration'],
    defaultGuests: 120,
  },
  {
    type: 'anniversary',
    label: 'Anniversary',
    fixedScale: 0.45,
    perGuestScale: 0.8,
    categories: [
      'venue',
      'catering',
      'decor',
      'photography',
      'entertainment',
      'production',
      'printing',
      'gifts',
      'staffing',
      'accessibility',
    ],
    standardLead: 75,
    defaultSessions: ['Anniversary dinner'],
    defaultGuests: 80,
  },
  {
    type: 'birthday',
    label: 'Birthday',
    fixedScale: 0.3,
    perGuestScale: 0.7,
    categories: [
      'venue',
      'catering',
      'decor',
      'photography',
      'entertainment',
      'production',
      'printing',
      'gifts',
      'staffing',
      'accessibility',
    ],
    standardLead: 45,
    defaultSessions: ['Birthday celebration'],
    defaultGuests: 60,
  },
  {
    type: 'baby_shower',
    label: 'Baby shower',
    fixedScale: 0.25,
    perGuestScale: 0.65,
    categories: ['venue', 'catering', 'decor', 'photography', 'entertainment', 'printing', 'gifts', 'accessibility'],
    standardLead: 40,
    defaultSessions: ['Baby shower gathering'],
    defaultGuests: 50,
  },
  {
    type: 'community',
    label: 'Community gathering',
    fixedScale: 0.3,
    perGuestScale: 0.45,
    categories: [
      'venue',
      'catering',
      'decor',
      'production',
      'entertainment',
      'staffing',
      'permits',
      'printing',
      'transport',
      'accessibility',
    ],
    standardLead: 90,
    defaultSessions: ['Community gathering'],
    defaultGuests: 300,
  },
  {
    type: 'festival',
    label: 'Festival celebration',
    fixedScale: 0.45,
    perGuestScale: 0.5,
    categories: [
      'venue',
      'catering',
      'decor',
      'production',
      'entertainment',
      'photography',
      'staffing',
      'permits',
      'printing',
      'transport',
      'accessibility',
    ],
    standardLead: 120,
    defaultSessions: ['Festival evening'],
    defaultGuests: 400,
  },
  {
    type: 'cultural',
    label: 'Cultural event',
    fixedScale: 0.4,
    perGuestScale: 0.55,
    categories: [
      'venue',
      'catering',
      'decor',
      'production',
      'entertainment',
      'photography',
      'staffing',
      'permits',
      'printing',
      'accessibility',
    ],
    standardLead: 90,
    defaultSessions: ['Programme', 'Reception'],
    defaultGuests: 250,
  },
  {
    type: 'corporate',
    label: 'Corporate celebration',
    fixedScale: 0.5,
    perGuestScale: 0.9,
    categories: [
      'venue',
      'catering',
      'decor',
      'production',
      'entertainment',
      'photography',
      'transport',
      'accommodation',
      'printing',
      'gifts',
      'staffing',
      'accessibility',
    ],
    standardLead: 75,
    defaultSessions: ['Welcome & programme', 'Dinner'],
    defaultGuests: 150,
  },
  {
    type: 'custom',
    label: 'Custom event',
    fixedScale: 0.4,
    perGuestScale: 0.7,
    categories: [
      'venue',
      'catering',
      'decor',
      'photography',
      'entertainment',
      'production',
      'printing',
      'gifts',
      'staffing',
      'accessibility',
    ],
    standardLead: 75,
    defaultSessions: ['Main session'],
    defaultGuests: 100,
  },
];

export function eventTypeProfile(type: EventType): EventTypeProfile {
  return EVENT_TYPES.find((t) => t.type === type) ?? EVENT_TYPES[EVENT_TYPES.length - 1];
}

export function eventTypeLabel(type: EventType, custom?: string): string {
  if (type === 'custom' && custom?.trim()) return custom.trim();
  return eventTypeProfile(type).label;
}

// ---------------------------------------------------------------------------
// Places — used only for cost indices and seasonal guidance, never to infer
// anyone's culture, religion or preferences.
// ---------------------------------------------------------------------------

export type RegionKey =
  | 'rajasthan'
  | 'tamil_nadu'
  | 'kerala'
  | 'karnataka'
  | 'maharashtra'
  | 'goa'
  | 'delhi_ncr'
  | 'punjab'
  | 'west_bengal'
  | 'gujarat'
  | 'telangana'
  | 'uttarakhand'
  | 'uttar_pradesh'
  | 'india_other'
  | 'international';

const CITY_REGION: Record<string, RegionKey> = {
  jaipur: 'rajasthan',
  udaipur: 'rajasthan',
  jodhpur: 'rajasthan',
  jaisalmer: 'rajasthan',
  pushkar: 'rajasthan',
  bikaner: 'rajasthan',
  chennai: 'tamil_nadu',
  madurai: 'tamil_nadu',
  coimbatore: 'tamil_nadu',
  puducherry: 'tamil_nadu',
  pondicherry: 'tamil_nadu',
  mahabalipuram: 'tamil_nadu',
  kochi: 'kerala',
  cochin: 'kerala',
  thiruvananthapuram: 'kerala',
  trivandrum: 'kerala',
  kozhikode: 'kerala',
  alleppey: 'kerala',
  alappuzha: 'kerala',
  munnar: 'kerala',
  kumarakom: 'kerala',
  bengaluru: 'karnataka',
  bangalore: 'karnataka',
  mysuru: 'karnataka',
  mysore: 'karnataka',
  coorg: 'karnataka',
  mangaluru: 'karnataka',
  mumbai: 'maharashtra',
  pune: 'maharashtra',
  nashik: 'maharashtra',
  lonavala: 'maharashtra',
  nagpur: 'maharashtra',
  goa: 'goa',
  panaji: 'goa',
  panjim: 'goa',
  delhi: 'delhi_ncr',
  'new delhi': 'delhi_ncr',
  gurugram: 'delhi_ncr',
  gurgaon: 'delhi_ncr',
  noida: 'delhi_ncr',
  faridabad: 'delhi_ncr',
  amritsar: 'punjab',
  chandigarh: 'punjab',
  ludhiana: 'punjab',
  kolkata: 'west_bengal',
  darjeeling: 'west_bengal',
  shantiniketan: 'west_bengal',
  ahmedabad: 'gujarat',
  surat: 'gujarat',
  vadodara: 'gujarat',
  rajkot: 'gujarat',
  hyderabad: 'telangana',
  secunderabad: 'telangana',
  rishikesh: 'uttarakhand',
  dehradun: 'uttarakhand',
  mussoorie: 'uttarakhand',
  nainital: 'uttarakhand',
  lucknow: 'uttar_pradesh',
  agra: 'uttar_pradesh',
  varanasi: 'uttar_pradesh',
};

const METROS = new Set([
  'mumbai',
  'delhi',
  'new delhi',
  'gurugram',
  'gurgaon',
  'noida',
  'bengaluru',
  'bangalore',
  'hyderabad',
  'chennai',
  'kolkata',
  'pune',
]);
const DESTINATIONS = new Set([
  'udaipur',
  'jaipur',
  'jodhpur',
  'jaisalmer',
  'goa',
  'panaji',
  'kochi',
  'kumarakom',
  'alleppey',
  'munnar',
  'rishikesh',
  'mussoorie',
  'coorg',
  'pushkar',
]);

export function isIndia(country: string): boolean {
  const c = country.trim().toLowerCase();
  return c === '' || c === 'india' || c === 'in' || c === 'bharat';
}

export function regionFor(city: string, country: string): RegionKey {
  if (!isIndia(country)) return 'international';
  return CITY_REGION[city.trim().toLowerCase()] ?? 'india_other';
}

export function cityCostFactor(city: string, country: string): number {
  if (!isIndia(country)) return 1;
  const c = city.trim().toLowerCase();
  if (METROS.has(c)) return 1.15;
  if (DESTINATIONS.has(c)) return 1.1;
  return 1;
}

/** Illustrative INR per unit of currency — used only to express benchmarks. */
export const REFERENCE_FX: Record<CurrencyCode, number> = { INR: 1, USD: 84, GBP: 107, EUR: 91, AED: 22.9, SGD: 62 };
/** Rough cost-of-events index for markets outside India (illustrative). */
export const INTERNATIONAL_COST_INDEX = 2.4;

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

export const VIEW_LABELS: Record<ViewKey, string> = {
  overview: 'Overview',
  brief: 'Event Brief',
  budget: 'Budget Lab',
  timeline: 'Timeline',
  vendors: 'Vendor Hub',
  themes: 'Theme Studio',
  guests: 'Guest Operations',
  runofshow: 'Run of Show',
  team: 'Team & Tasks',
  exports: 'Exports & Reports',
};

export const VENUE_STATUS_LABEL: Record<VenueStatus, string> = {
  confirmed: 'Confirmed',
  shortlisted: 'Shortlisted — not contracted',
  searching: 'Still searching',
  not_required: 'Not required (e.g. home or client-provided)',
};

export const SETTING_LABEL: Record<Setting, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor (open air)',
  covered: 'Outdoor, covered structure',
  mixed: 'Indoor + outdoor',
};

export const VENDOR_STATUS_ORDER: VendorStatus[] = [
  'identified',
  'contacted',
  'quoted',
  'shortlisted',
  'booked',
  'completed',
  'rejected',
  'cancelled',
];

export const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
  identified: 'Identified',
  contacted: 'Contacted',
  quoted: 'Quote received',
  shortlisted: 'Shortlisted',
  booked: 'Booked',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

export const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export const WORKSTREAMS: { key: Workstream; label: string }[] = [
  { key: 'planning', label: 'Planning & admin' },
  { key: 'venue', label: 'Venue' },
  { key: 'catering', label: 'Food & beverage' },
  { key: 'design', label: 'Design & décor' },
  { key: 'media', label: 'Photo & film' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'guests', label: 'Guests & hospitality' },
  { key: 'logistics', label: 'Travel & logistics' },
  { key: 'production', label: 'Production' },
  { key: 'finance', label: 'Finance' },
];

export function workstreamLabel(w: Workstream): string {
  return WORKSTREAMS.find((x) => x.key === w)?.label ?? w;
}

export const RSVP_LABEL: Record<RSVP, string> = {
  pending: 'Awaiting reply',
  confirmed: 'Attending',
  declined: 'Declined',
  tentative: 'Tentative',
};

export const DIET_LABEL: Record<Diet, string> = {
  vegetarian: 'Vegetarian',
  non_vegetarian: 'Non-vegetarian',
  vegan: 'Vegan',
  jain: 'Jain',
  other: 'Other / special',
  unknown: 'Not stated',
};

export const SCENARIO_LABEL: Record<ScenarioKey, string> = { lean: 'Lean', balanced: 'Balanced', premium: 'Premium' };

export const SCENARIO_BLURB: Record<ScenarioKey, string> = {
  lean: 'Essentials first, affordable alternatives everywhere else.',
  balanced: 'Quality where the client cares most, value elsewhere.',
  premium: 'Upgraded experiences within the stated ceiling.',
};

export const ACCESSIBILITY_OPTIONS = [
  'Step-free access',
  'Wheelchair users attending',
  'Seating priority for elderly guests',
  'Hearing support (loop / captions)',
  'Low-vision support (large print)',
  'Quiet space / sensory-friendly area',
  'Accessible restrooms',
  'Accessible transport',
];
