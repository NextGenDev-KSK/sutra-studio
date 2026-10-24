import { generateNarrative } from './brief';
import { generateConcepts } from './themes';
import type { Diet, EventPlan, Guest, ISODate, RSVP, RunItem, Task, Vendor } from './types';
import { addDays, seededRandom } from './util';

// ---------------------------------------------------------------------------
// Demonstration workspace. Every person, business, quotation and figure here
// is FICTIONAL and labelled as illustrative in the UI. Dates are relative to
// the day the demo is created so the countdown and statuses stay sensible.
// ---------------------------------------------------------------------------

export const DEMO_DAYS_OUT = 120;

const ILLUSTRATIVE = {
  level: 'illustrative' as const,
  note: 'Illustrative demo vendor — not verified. No contact details are provided because this business is fictional.',
};

export function createDemoPlan(today: ISODate, id = 'evt_demo'): EventPlan {
  const E = addDays(today, DEMO_DAYS_OUT);
  const at = (offsetFromEvent: number) => addDays(E, offsetFromEvent);
  const ago = (days: number) => addDays(today, -days);
  const now = new Date().toISOString();

  const team = [
    {
      id: 'm_meera',
      name: 'Meera Iyer',
      role: 'Lead planner',
      responsibilities: 'Client relationship, creative direction, budget sign-off',
      email: '',
    },
    {
      id: 'm_rohan',
      name: 'Rohan Desai',
      role: 'Vendor & logistics manager',
      responsibilities: 'Sourcing, contracts, travel and accommodation',
      email: '',
    },
    {
      id: 'm_aisha',
      name: 'Aisha Khan',
      role: 'Guest experience lead',
      responsibilities: 'Guest list, RSVPs, hospitality desk, accessibility',
      email: '',
    },
    {
      id: 'm_dev',
      name: 'Dev Malhotra',
      role: 'Production manager',
      responsibilities: 'Run of show, décor installs, sound & lighting, permits',
      email: '',
    },
    {
      id: 'm_nisha',
      name: 'Nisha Verma',
      role: 'Finance & admin coordinator',
      responsibilities: 'Payments, invoices and documentation',
      email: '',
    },
  ];

  const sessions = [
    {
      id: 's_mehendi',
      name: 'Mehendi afternoon',
      dayIndex: 0,
      start: '12:00',
      end: '16:30',
      setting: 'outdoor' as const,
      hasMeal: true,
      area: 'Courtyard',
    },
    {
      id: 's_sangeet',
      name: 'Sangeet evening',
      dayIndex: 0,
      start: '19:00',
      end: '22:30',
      setting: 'indoor' as const,
      hasMeal: true,
      area: 'Durbar Hall',
    },
    {
      id: 's_ceremony',
      name: 'Wedding ceremony',
      dayIndex: 1,
      start: '10:00',
      end: '13:00',
      setting: 'outdoor' as const,
      hasMeal: true,
      area: 'Courtyard',
    },
    {
      id: 's_reception',
      name: 'Reception dinner',
      dayIndex: 1,
      start: '19:30',
      end: '23:30',
      setting: 'outdoor' as const,
      hasMeal: true,
      area: 'Lawn',
    },
  ];

  const brief: EventPlan['brief'] = {
    name: 'Aanya & Kabir · Jaipur Wedding',
    type: 'wedding',
    customTypeLabel: '',
    city: 'Jaipur',
    country: 'India',
    venueName: 'Haveli Aravalli Estate (demo)',
    venueStatus: 'shortlisted',
    eventDate: E,
    durationDays: 2,
    sessions,
    guestCount: 180,
    totalBudget: 8_000_000,
    currency: 'INR',
    style: 'Contemporary heritage',
    themeName: '',
    colors: ['#F4EBDD', '#D9932B', '#C7807A', '#2F5141', '#B08D57'],
    atmosphere:
      'Candle-lit courtyards, live classical-fusion music and unhurried, generous hospitality that feels intimate for 180 guests.',
    culturalPreferences:
      'The families have asked for four gatherings: a Mehendi afternoon, a Sangeet evening, the wedding ceremony and a reception dinner. Ceremony rituals and officiant details will be confirmed directly with both families.',
    dietary: {
      vegetarianPct: 70,
      veganCount: 6,
      jainCount: 14,
      allergens: ['Tree nuts', 'Gluten'],
      notes: 'Separate live counter for Jain meals; nut-free dessert labels.',
    },
    dietarySpecified: true,
    accessibility: [
      'Step-free access',
      'Wheelchair users attending',
      'Seating priority for elderly guests',
      'Low-vision support (large print)',
    ],
    accessibilityNotes: 'Three wheelchair users confirmed; grandparents on both sides need short walking distances.',
    setting: 'mixed',
    weatherConcerns: 'February evenings can be cool — heaters and a covered fallback for the reception lawn.',
    plannerName: 'Meera Iyer',
    clientName: 'Aanya Mehra & Kabir Rao (fictional)',
    protectedCategories: ['photography', 'catering'],
    goals: 'Keep every session feeling intimate despite 180 guests',
    nonNegotiables: [
      'Candid photo & film team with heritage-venue experience',
      'Separate Jain and vegan counters',
      'Step-free access to every ceremony space',
    ],
    knownRisks: ['Families may add guests late', 'Out-of-town guests arriving across two days'],
  };

  const vendors: Vendor[] = [
    v(
      'v_venue1',
      'Haveli Aravalli Estate (demo)',
      'venue',
      'shortlisted',
      true,
      {
        basis: 'fixed',
        amount: 1_450_000,
        units: 1,
        deliverables: 'Exclusive use for 2 days: courtyard, Durbar Hall and lawn; in-house power backup; 10 rooms for the families.',
      },
      ['Three distinct spaces for four sessions', 'Indoor Durbar Hall as weather fallback'],
      ['Contract not yet signed', 'Load-in only after 08:00'],
      'Sign contract & pay 30% advance',
    ),
    v(
      'v_venue2',
      'Lakeside Bagh Gardens (demo)',
      'venue',
      'quoted',
      false,
      { basis: 'fixed', amount: 1_280_000, units: 1, deliverables: 'Lawn and pavilion for 2 days; external generator required.' },
      ['Lower hire cost', 'Beautiful lake views for photos'],
      ['No indoor space for 180 guests', '35 minutes from the hotel cluster'],
      'Hold as backup until contract signed',
    ),
    v(
      'v_cat1',
      'Marigold Kitchen Co. (demo)',
      'catering',
      'booked',
      false,
      {
        basis: 'perGuest',
        amount: 2_450,
        units: 4,
        deliverables: 'Four meal services, live counters, separate Jain kitchen, service staff.',
      },
      ['Separate Jain kitchen', 'Strong tasting feedback from both families'],
      ['Per-plate price above allocation'],
      'Share final menus by T-60 days',
    ),
    v(
      'v_cat2',
      'Thali & Twine Caterers (demo)',
      'catering',
      'rejected',
      false,
      { basis: 'perGuest', amount: 2_100, units: 4, deliverables: 'Four meal services, buffet format.' },
      ['Lower per-plate price'],
      ['No separate Jain kitchen'],
      'Closed — not selected',
    ),
    v(
      'v_dec1',
      'Kesar Décor Studio (demo)',
      'decor',
      'booked',
      false,
      {
        basis: 'fixed',
        amount: 1_180_000,
        units: 1,
        deliverables: 'Design and installation for all four sessions, florals, props, entrance installation.',
      },
      ['Heritage-venue experience', 'In-house fabrication'],
      ['Slightly above allocation'],
      'Approve layout per space',
    ),
    v(
      'v_dec2',
      'Jaal & Bloom Florals (demo)',
      'decor',
      'shortlisted',
      false,
      { basis: 'fixed', amount: 1_040_000, units: 1, deliverables: 'Florals and décor for all sessions; fabrication outsourced.' },
      ['Lower quote', 'Strong floral work'],
      ['Fabrication outsourced', 'Availability for the date unconfirmed'],
      'Keep warm as a backup',
    ),
    v(
      'v_pho1',
      'Frame & Fable Studio (demo)',
      'photography',
      'booked',
      false,
      {
        basis: 'fixed',
        amount: 560_000,
        units: 1,
        deliverables: '4-person candid photo + cinematic film crew, 2 days, same-day edit, two albums.',
      },
      ['Heritage-venue portfolio', 'Same-day edit'],
      [],
      'Share shot list by T-30 days',
    ),
    v(
      'v_pho2',
      'Lightbox Weddings (demo)',
      'photography',
      'quoted',
      false,
      { basis: 'fixed', amount: 420_000, units: 1, deliverables: '2-person photo + video, 2 days, highlights film.' },
      ['Lower price'],
      ['Smaller crew', 'No same-day edit'],
      'Closed once Frame & Fable booked',
    ),
    v(
      'v_ent1',
      'Raga Collective (demo)',
      'entertainment',
      'shortlisted',
      false,
      {
        basis: 'fixed',
        amount: 180_000,
        units: 1,
        deliverables: 'Live classical-fusion trio for Mehendi and reception (2 × 2-hour sets).',
      },
      ['Acoustic sets suit the courtyard'],
      ['Needs a green room'],
      'Confirm set times',
    ),
    v(
      'v_ent2',
      'Sangeet Choreography Lab (demo)',
      'entertainment',
      'quoted',
      false,
      { basis: 'fixed', amount: 110_000, units: 1, deliverables: 'Six family choreography sessions plus show-night coordination.' },
      ['Flexible rehearsal schedule'],
      [],
      'Decide by T-90 days',
    ),
    v(
      'v_prod1',
      'Lumen Stagecraft (demo)',
      'production',
      'contacted',
      false,
      null,
      [],
      [],
      'Awaiting quotation for light, sound & staging',
    ),
    v(
      'v_acc1',
      'Pink City Heritage Hotel (demo)',
      'accommodation',
      'quoted',
      true,
      { basis: 'fixed', amount: 780_000, units: 1, deliverables: 'Room block: 50 rooms × 2 nights, breakfast included.' },
      ['Walking distance to the venue'],
      ['Release date 30 days before the event'],
      'Confirm rooming list by T-45 days',
    ),
    v('v_tr1', 'Amber Fleet Travels (demo)', 'transport', 'identified', false, null, [], [], 'Request quotation for shuttles & transfers'),
    v(
      'v_mua1',
      'Kohl & Comb Styling (demo)',
      'attire',
      'shortlisted',
      false,
      {
        basis: 'fixed',
        amount: 195_000,
        units: 1,
        deliverables: 'Styling and makeup for the couple and immediate family across four sessions.',
      },
      ['Travels with a 4-person team'],
      [],
      'Trial session',
    ),
    v(
      'v_print1',
      'Paper Lantern Press (demo)',
      'printing',
      'booked',
      false,
      { basis: 'perGuest', amount: 280, units: 1, deliverables: 'Invitation suite, signage and menus.' },
      ['Handmade paper'],
      [],
      'Proofs approved',
    ),
  ];
  vendors.find((x) => x.id === 'v_cat1')!.bookedOn = ago(20);
  vendors.find((x) => x.id === 'v_dec1')!.bookedOn = ago(12);
  vendors.find((x) => x.id === 'v_pho1')!.bookedOn = ago(35);
  vendors.find((x) => x.id === 'v_print1')!.bookedOn = ago(8);

  const T = (
    id: string,
    title: string,
    workstream: Task['workstream'],
    offset: number,
    status: Task['status'],
    owner: string,
    duration: number,
    deps: string[] = [],
    extra: Partial<Task> = {},
  ): Task => ({
    id,
    title,
    workstream,
    ownerId: owner,
    status,
    priority: extra.priority ?? (extra.milestone ? 'high' : 'medium'),
    dueDate: at(offset),
    durationDays: duration,
    dependsOn: deps,
    schedule: 'relative',
    offsetDays: offset,
    milestone: false,
    requiresVenue: false,
    notes: '',
    source: 'template',
    ...extra,
    completedOn: status === 'done' ? (extra.completedOn ?? at(offset)) : undefined,
  });

  const tasks: Task[] = [
    T('t01', 'Client discovery & brief sign-off', 'planning', -200, 'done', 'm_meera', 7, [], { milestone: true }),
    T('t02', 'Budget framework approved by families', 'finance', -185, 'done', 'm_nisha', 5, ['t01'], { milestone: true }),
    T('t03', 'Planning team & responsibilities confirmed', 'planning', -180, 'done', 'm_meera', 2, ['t01']),
    T('t04', 'Shortlist heritage venues', 'venue', -170, 'done', 'm_rohan', 10, ['t02']),
    T('t05', 'Venue site visits with both families', 'venue', -150, 'done', 'm_meera', 7, ['t04']),
    T('t06', 'Sign venue contract & pay advance', 'venue', -117, 'in_progress', 'm_rohan', 5, ['t05'], {
      milestone: true,
      priority: 'high',
      vendorCategory: 'venue',
      vendorRole: 'book',
      notes: 'Venue has a second enquiry for the same dates — they will hold until the due date.',
    }),
    T('t07', 'Venue floor plan & capacity sign-off', 'venue', -95, 'todo', 'm_dev', 7, ['t06'], { requiresVenue: true }),
    T('t08', 'Obtain event & sound permissions', 'production', -45, 'todo', 'm_dev', 21, ['t06'], {
      requiresVenue: true,
      priority: 'high',
    }),
    T('t09', 'Caterer tastings & selection', 'catering', -135, 'done', 'm_meera', 14, ['t02']),
    T('t10', 'Book caterer & pay advance', 'catering', -125, 'done', 'm_rohan', 3, ['t09'], {
      vendorCategory: 'catering',
      vendorRole: 'book',
      completedOn: ago(20),
    }),
    T('t11', 'Finalise menus per session (incl. Jain & vegan counters)', 'catering', -60, 'todo', 'm_aisha', 10, ['t10'], {
      requiresVenue: true,
      vendorCategory: 'catering',
      vendorRole: 'requires',
    }),
    T('t12', 'Final menu tasting with families', 'catering', -30, 'todo', 'm_meera', 1, ['t11']),
    T('t14', 'Moodboard & creative direction sign-off', 'design', -140, 'done', 'm_meera', 10, ['t01']),
    T('t15', 'Book décor studio', 'design', -128, 'done', 'm_rohan', 3, ['t14'], {
      vendorCategory: 'decor',
      vendorRole: 'book',
      completedOn: ago(12),
    }),
    T('t16', 'Décor layout for each space', 'design', -80, 'todo', 'm_dev', 14, ['t07', 't15'], {
      requiresVenue: true,
      vendorCategory: 'decor',
      vendorRole: 'requires',
    }),
    T('t17', 'Floral order & sourcing plan', 'design', -40, 'todo', 'm_dev', 7, ['t16'], {
      vendorCategory: 'decor',
      vendorRole: 'requires',
    }),
    T('t18', 'Décor install schedule & load-in plan', 'production', -14, 'todo', 'm_dev', 5, ['t16'], {
      requiresVenue: true,
      vendorCategory: 'decor',
      vendorRole: 'requires',
    }),
    T('t19', 'Book photo & film team', 'media', -145, 'done', 'm_rohan', 5, ['t02'], {
      vendorCategory: 'photography',
      vendorRole: 'book',
      completedOn: ago(35),
    }),
    T('t20', 'Shot list & family groupings', 'media', -30, 'todo', 'm_aisha', 5, ['t19'], {
      vendorCategory: 'photography',
      vendorRole: 'requires',
    }),
    T('t21', 'Shortlist live music & choreographer', 'entertainment', -110, 'in_progress', 'm_rohan', 10, ['t02']),
    T('t22', 'Book entertainment', 'entertainment', -90, 'todo', 'm_rohan', 5, ['t21'], {
      vendorCategory: 'entertainment',
      vendorRole: 'book',
    }),
    T('t23', 'Sangeet rehearsal schedule', 'entertainment', -21, 'todo', 'm_aisha', 2, ['t22'], {
      vendorCategory: 'entertainment',
      vendorRole: 'requires',
    }),
    T('t24', 'Collect lighting & sound quotations', 'production', -112, 'in_progress', 'm_dev', 10, [], { vendorCategory: 'production' }),
    T('t25', 'Book light, sound & staging', 'production', -85, 'todo', 'm_dev', 5, ['t24', 't06'], {
      requiresVenue: true,
      vendorCategory: 'production',
      vendorRole: 'book',
    }),
    T('t26', 'Technical rehearsal & sound check', 'production', -1, 'todo', 'm_dev', 1, ['t25', 't18'], {
      milestone: true,
      vendorCategory: 'production',
      vendorRole: 'requires',
    }),
    T('t27', 'Consolidate guest lists from both families', 'guests', -124, 'in_progress', 'm_aisha', 10, ['t01'], {
      priority: 'high',
      notes: 'Waiting on the second family’s list.',
    }),
    T('t28', 'Send invitations (print + digital)', 'guests', -100, 'todo', 'm_aisha', 5, ['t27'], {
      milestone: true,
      vendorCategory: 'printing',
      vendorRole: 'requires',
    }),
    T('t29', 'RSVP deadline & headcount freeze', 'guests', -21, 'todo', 'm_aisha', 1, ['t28'], { milestone: true }),
    T('t13', 'Confirm final plate guarantee to caterer', 'catering', -10, 'todo', 'm_nisha', 2, ['t29'], {
      priority: 'high',
      vendorCategory: 'catering',
      vendorRole: 'requires',
    }),
    T('t30', 'Room block & rooming list', 'logistics', -45, 'todo', 'm_rohan', 7, ['t27'], {
      vendorCategory: 'accommodation',
      vendorRole: 'book',
    }),
    T('t31', 'Airport & rail transfer schedule', 'logistics', -20, 'todo', 'm_rohan', 5, ['t30'], { vendorCategory: 'transport' }),
    T('t32', 'Accessibility plan (ramps, shuttles, seating)', 'guests', -35, 'todo', 'm_aisha', 7, ['t07'], { requiresVenue: true }),
    T('t33', 'Welcome hampers & gifts procurement', 'guests', -25, 'todo', 'm_nisha', 10),
    T('t34', 'Payment schedule review with families', 'finance', -119, 'todo', 'm_nisha', 1, ['t02'], { priority: 'high' }),
    T('t36', 'Ceremony walk-through with families', 'planning', -1, 'todo', 'm_meera', 1, ['t26'], { milestone: true }),
    T('t35', 'Final reconciliation & vendor settlements', 'finance', 7, 'todo', 'm_nisha', 5, [], { milestone: true }),
  ];

  const run: RunItem[] = [
    R('r01', 0, '10:00', '12:00', 'Guest arrivals & welcome desk', 'Lobby', 'm_aisha', [], {
      timing: 'confirmed',
      contingency: 'Open a second desk at the gate if arrivals bunch up.',
    }),
    R('r02', 0, '12:00', '16:30', 'Mehendi afternoon with lunch', 'Courtyard', 'm_meera', ['v_cat1', 'v_dec1', 'v_ent1'], {
      setupMinutes: 150,
      setupNotes: 'Low seating, shade sails, mehendi artist stations.',
      timing: 'confirmed',
      contingency: 'Shade umbrellas and misting fans on standby; move lunch to the Durbar Hall verandah if wind picks up.',
    }),
    R('r03', 0, '17:00', '18:30', 'Sangeet sound check & rehearsal', 'Durbar Hall', 'm_dev', ['v_prod1'], {
      amplifiedSound: true,
      setupMinutes: 0,
    }),
    R('r04', 0, '19:00', '22:30', 'Sangeet evening & dinner', 'Durbar Hall', 'm_aisha', ['v_cat1', 'v_ent2', 'v_prod1'], {
      setupMinutes: 30,
      dependsOn: ['r03'],
      amplifiedSound: true,
      contingency: 'Hard stop for amplified music to be agreed with the venue.',
    }),
    R('r05', 1, '08:00', '09:30', 'Ceremony décor finishing', 'Courtyard', 'm_dev', ['v_dec1'], { timing: 'confirmed' }),
    R('r06', 1, '10:00', '13:00', 'Wedding ceremony', 'Courtyard', 'm_meera', ['v_dec1', 'v_pho1'], {
      setupMinutes: 30,
      dependsOn: ['r05'],
      timing: 'confirmed',
      contingency: 'Ceremony run-sheet to be confirmed with both families.',
    }),
    R('r07', 1, '13:00', '14:30', 'Wedding lunch', 'Durbar Hall', 'm_aisha', ['v_cat1'], { timing: 'confirmed', bufferMinutes: 0 }),
    R('r08', 1, '16:30', '18:30', 'Family portraits on the lawn', 'Lawn', 'm_meera', ['v_pho1'], {
      contingency: 'Move portraits to the Courtyard arches if the lawn is being set.',
    }),
    R('r09', 1, '19:30', '23:30', 'Reception dinner', 'Lawn', 'm_meera', ['v_cat1', 'v_dec1', 'v_ent1', 'v_prod1'], {
      setupMinutes: 180,
      setupNotes: 'Lighting rig, heaters, lounge furniture and stage.',
      amplifiedSound: false,
      contingency: 'Amplified music ends 22:00; acoustic set afterwards. Covered fallback: Durbar Hall.',
    }),
  ];

  const plan: EventPlan = {
    id,
    schemaVersion: 1,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    brief,
    narrative: generateNarrative(brief, today, 6),
    budget: {
      contingencyPct: 6,
      categories: [
        cat('venue', 'Venue', 'fixed', 1_400_000, 1, '', 'Two-day exclusive hire of a heritage property.', true),
        cat('catering', 'Catering', 'perGuest', 2_300, 4, 'meal service', 'Four meal services; separate Jain & vegan counters.', true),
        cat('decor', 'Décor & florals', 'fixed', 1_150_000, 1, '', 'Four sessions across three spaces.', true),
        cat('photography', 'Photo & film', 'fixed', 550_000, 1, '', 'Candid photo + film crew, two days.', true),
        cat('entertainment', 'Entertainment', 'fixed', 320_000, 1, '', 'Live music and Sangeet choreography.', false),
        cat('production', 'Light, sound & staging', 'fixed', 420_000, 1, '', 'Sangeet stage, reception lighting, heaters.', true),
        cat(
          'accommodation',
          'Accommodation',
          'perGuest',
          2_200,
          2,
          'night',
          'Averaged across all guests (≈50% outstation, twin-sharing).',
          false,
        ),
        cat('transport', 'Transport', 'perGuest', 900, 1, '', 'Shuttles and airport/rail transfers.', false),
        cat('attire', 'Styling & attire', 'fixed', 240_000, 1, '', 'Styling and makeup coordinated by the studio.', false),
        cat('printing', 'Invitations & print', 'perGuest', 300, 1, '', 'Invitation suite, signage and menus.', false),
        cat('gifts', 'Gifts & favours', 'perGuest', 850, 1, '', 'Welcome hampers with local crafts.', false),
        cat('staffing', 'Staffing & security', 'fixed', 140_000, 1, '', 'Hospitality desk, ushers and security for two days.', true),
        cat('permits', 'Permits & licences', 'fixed', 45_000, 1, '', 'Sound and event permissions (verify locally).', true),
        cat('accessibility', 'Accessibility', 'fixed', 70_000, 1, '', 'Ramps, buggy shuttle and assistance staff.', true),
      ],
      payments: [
        { id: 'p01', vendorId: 'v_cat1', label: 'Advance (30%)', amount: 529_200, dueDate: ago(20), status: 'paid', paidOn: ago(20) },
        { id: 'p02', vendorId: 'v_cat1', label: 'Second instalment (40%)', amount: 705_600, dueDate: at(-30), status: 'scheduled' },
        { id: 'p03', vendorId: 'v_cat1', label: 'Final balance (30%)', amount: 529_200, dueDate: at(-3), status: 'scheduled' },
        { id: 'p04', vendorId: 'v_dec1', label: 'Advance (40%)', amount: 472_000, dueDate: ago(12), status: 'paid', paidOn: ago(12) },
        { id: 'p05', vendorId: 'v_dec1', label: 'Balance (60%)', amount: 708_000, dueDate: at(-7), status: 'scheduled' },
        { id: 'p06', vendorId: 'v_pho1', label: 'Advance (50%)', amount: 280_000, dueDate: ago(35), status: 'paid', paidOn: ago(35) },
        { id: 'p07', vendorId: 'v_pho1', label: 'Balance on album delivery', amount: 280_000, dueDate: at(14), status: 'scheduled' },
        { id: 'p08', vendorId: 'v_print1', label: 'Full payment', amount: 50_400, dueDate: ago(8), status: 'paid', paidOn: ago(8) },
      ],
      scenarioOverrides: { lean: {}, balanced: {}, premium: {} },
      allowPremiumOverCeiling: false,
    },
    vendors,
    tasks,
    guests: demoGuests(),
    runOfShow: run,
    daySettings: [
      { dayIndex: 0, soundCutoff: '22:00' },
      { dayIndex: 1, soundCutoff: '22:00' },
    ],
    themes: generateConcepts(brief, today, 0),
    themeVariant: 0,
    team,
    notes: [
      {
        id: 'n1',
        at: new Date(Date.now() - 20 * 864e5).toISOString(),
        kind: 'decision',
        title: 'Caterer: Marigold Kitchen chosen over Thali & Twine',
        body: 'A separate Jain kitchen was the deciding factor; per-plate price is ₹350 higher than the alternative.',
        authorId: 'm_meera',
      },
      {
        id: 'n2',
        at: new Date(Date.now() - 9 * 864e5).toISOString(),
        kind: 'decision',
        title: 'Reception on the lawn with Durbar Hall as covered fallback',
        body: 'Approved by both families after the site visit.',
        authorId: 'm_meera',
      },
      {
        id: 'n3',
        at: new Date(Date.now() - 4 * 864e5).toISOString(),
        kind: 'note',
        title: 'Acoustic music during the ceremony',
        body: 'Families prefer acoustic music during the ceremony; amplified sound only at the Sangeet and reception.',
        authorId: 'm_aisha',
      },
    ],
    activity: [
      {
        id: 'a1',
        at: now,
        actor: 'system',
        module: 'overview',
        summary: 'Demo workspace created with illustrative data. Every vendor, guest and figure is fictional.',
      },
    ],
  };
  plan.narrative.vision =
    'A contemporary heritage wedding for 180 guests in Jaipur: candle-lit courtyards, live classical-fusion music and generous, unhurried hospitality that makes a two-day celebration feel intimate. Investment is weighted toward photo & film and catering — the two areas the families asked us to protect — while décor focuses on three hero spaces rather than ornamenting everything. Cool February evenings shape the reception: heaters, warm lighting and a covered fallback in the Durbar Hall.';
  plan.narrative.edited = { vision: true };
  return plan;

  function v(
    vid: string,
    name: string,
    category: string,
    status: Vendor['status'],
    preferred: boolean,
    quote: Vendor['quote'],
    pros: string[],
    cons: string[],
    nextAction: string,
  ): Vendor {
    return {
      id: vid,
      name,
      category,
      location: 'Jaipur',
      serviceArea: 'Jaipur and surrounding region',
      contactName: '',
      phone: '',
      email: '',
      website: '',
      description: quote?.deliverables ?? 'Quotation not yet received.',
      quote: quote ? { ...quote, receivedOn: ago(30) } : null,
      availability: status === 'booked' ? 'confirmed' : status === 'identified' ? 'unknown' : 'requested',
      status,
      preferred,
      pros,
      cons,
      notes: 'Illustrative demo record.',
      nextAction,
      verification: { ...ILLUSTRATIVE },
      createdAt: now,
    };
  }
}

function cat(
  key: string,
  label: string,
  basis: 'fixed' | 'perGuest',
  planned: number,
  units: number,
  unitLabel: string,
  notes: string,
  essential: boolean,
) {
  return { key, label, basis, planned, units, unitLabel, notes, essential };
}

function R(
  id: string,
  dayIndex: number,
  start: string,
  end: string,
  title: string,
  location: string,
  leadId: string,
  vendorIds: string[],
  extra: Partial<RunItem> = {},
): RunItem {
  return {
    id,
    dayIndex,
    start,
    end,
    title,
    location,
    leadId,
    vendorIds,
    setupMinutes: 0,
    setupNotes: '',
    dependsOn: [],
    bufferMinutes: 15,
    timing: 'suggested',
    status: 'planned',
    contingency: '',
    amplifiedSound: false,
    ...extra,
  };
}

const FIRST = [
  'Arjun',
  'Priya',
  'Kavya',
  'Rahul',
  'Sneha',
  'Vikram',
  'Ananya',
  'Farhan',
  'Zoya',
  'Harpreet',
  'Gurleen',
  'Joseph',
  'Maria',
  'Lakshmi',
  'Karthik',
  'Divya',
  'Siddharth',
  'Ishaan',
  'Meghna',
  'Tenzin',
  'Rohit',
  'Neha',
  'Aditya',
  'Sana',
  'Imran',
  'Pooja',
  'Varun',
  'Nikhil',
  'Shreya',
  'Aarav',
  'Riya',
  'Naveen',
  'Fatima',
  'Ritu',
  'Anil',
  'Deepa',
  'Kunal',
  'Leela',
  'Omar',
  'Tara',
];
const LAST = [
  'Sharma',
  'Iyer',
  'Menon',
  'Kapoor',
  'Singh',
  'Fernandes',
  'D’Souza',
  'Reddy',
  'Nair',
  'Banerjee',
  'Patel',
  'Shah',
  'Joshi',
  'Gupta',
  'Qureshi',
  'Gill',
  'Bhatia',
  'Mukherjee',
  'Pillai',
  'Rao',
  'Naidu',
  'Thomas',
  'Kulkarni',
  'Deshpande',
  'Chopra',
  'Sethi',
  'Ali',
  'Bose',
  'Mehta',
  'Varghese',
];
const GROUPS = ['Aanya’s family', 'Kabir’s family', 'Friends of the couple', 'Family friends', 'Colleagues'];

function pick<T>(rnd: () => number, list: T[]): T {
  return list[Math.floor(rnd() * list.length)];
}

function weighted<T>(rnd: () => number, entries: [T, number][]): T {
  const r = rnd();
  let acc = 0;
  for (const [v, w] of entries) {
    acc += w;
    if (r <= acc) return v;
  }
  return entries[entries.length - 1][0];
}

/** Fictional guest households. Diet values are simulated RSVP answers, not inferred from names. */
export function demoGuests(): Guest[] {
  const rnd = seededRandom(2027);
  const guests: Guest[] = [];
  const used = new Set<string>();
  for (let i = 0; i < 82; i++) {
    let name: string;
    do name = `${pick(rnd, FIRST)} ${pick(rnd, LAST)}`;
    while (used.has(name));
    used.add(name);
    const party = weighted(rnd, [
      [1, 0.25],
      [2, 0.45],
      [3, 0.15],
      [4, 0.15],
    ]);
    const rsvp = weighted<RSVP>(rnd, [
      ['confirmed', 0.55],
      ['pending', 0.33],
      ['declined', 0.08],
      ['tentative', 0.04],
    ]);
    const diet = weighted<Diet>(rnd, [
      ['vegetarian', 0.56],
      ['non_vegetarian', 0.3],
      ['jain', 0.06],
      ['vegan', 0.04],
      ['unknown', 0.04],
    ]);
    const allergies = rnd() < 0.08 ? pick(rnd, ['Tree nuts', 'Gluten', 'Dairy', 'Shellfish']) : '';
    let accessibility = '';
    let assistance = '';
    if (i === 3 || i === 17 || i === 41) {
      accessibility = 'Wheelchair user';
      assistance = 'Step-free seating near the aisle; buggy shuttle from the drop-off.';
    } else if (rnd() < 0.08) {
      accessibility = 'Elderly — short walking distances';
      assistance = 'Reserved seating with arm rests.';
    }
    guests.push({
      id: `g${String(i + 1).padStart(3, '0')}`,
      name: party > 1 ? `${name} + ${party - 1}` : name,
      group: pick(rnd, GROUPS),
      partySize: party,
      rsvp,
      diet,
      allergies,
      accessibility,
      assistanceNotes: assistance,
      table: rsvp === 'confirmed' ? `T${1 + Math.floor(rnd() * 18)}` : '',
      contact: '',
      notes: '',
    });
  }
  return guests;
}
