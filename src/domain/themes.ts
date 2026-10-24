import { eventTypeLabel, regionFor, type RegionKey } from './catalog';
import { seasonOutlook } from './season';
import type { EventBrief, EventType, ISODate, PaletteColor, ThemeConcept, Workstream } from './types';
import { diffDays } from './util';

// Regional craft references are design vocabulary chosen from the event's
// location. They are offered as one option among several and never imply
// anything about the hosts' culture, religion or traditions.
interface RegionCraft {
  crafts: string;
  textiles: string;
  flowers: string;
  food: string;
  architecture: string;
}

const CRAFT: Record<RegionKey, RegionCraft> = {
  rajasthan: {
    crafts: 'block-printed cotton, mirror-work and blue pottery',
    textiles: 'leheriya and hand block prints',
    flowers: 'marigold, rose and bougainvillea',
    food: 'regional thali stations alongside contemporary live counters',
    architecture: 'courtyards, arches and jharokha-style frames',
  },
  tamil_nadu: {
    crafts: 'polished brass, kolam floor art and banana-leaf details',
    textiles: 'handloom cotton with silk accents',
    flowers: 'jasmine strands, marigold and lotus',
    food: 'banana-leaf service and a filter-coffee cart',
    architecture: 'pillared verandahs and courtyards',
  },
  kerala: {
    crafts: 'coir, brass and carved wood',
    textiles: 'off-white handloom with gold borders',
    flowers: 'jasmine, orchids and woven coconut-leaf craft',
    food: 'leaf-served regional meals and coastal counters',
    architecture: 'sloping tiled roofs and inner courtyards',
  },
  karnataka: {
    crafts: 'lacquered Channapatna woodcraft and rosewood details',
    textiles: 'Ilkal and silk accents',
    flowers: 'jasmine, roses and estate greenery',
    food: 'regional breakfast and dosa counters',
    architecture: 'garden lawns and colonnades',
  },
  maharashtra: {
    crafts: 'Warli line art and terracotta',
    textiles: 'Paithani-inspired borders',
    flowers: 'marigold and tuberose',
    food: 'coastal and regional counters',
    architecture: 'wada-style courtyards',
  },
  goa: {
    crafts: 'painted tiles, rattan and driftwood',
    textiles: 'breezy cottons and linens',
    flowers: 'frangipani, bougainvillea and palms',
    food: 'coastal grills and fresh-catch or garden counters',
    architecture: 'verandahs, chapel-white walls and beaches',
  },
  delhi_ncr: {
    crafts: 'jaali screens, brass and marble inlay',
    textiles: 'chikankari and zari accents',
    flowers: 'roses, tuberose and carnations',
    food: 'street-food lanes and tandoor counters',
    architecture: 'arches, lawns and courtyards',
  },
  punjab: {
    crafts: 'phulkari embroidery, brass and woven charpai seating',
    textiles: 'phulkari and handloom',
    flowers: 'marigold, roses and mustard-yellow accents',
    food: 'dhaba-style counters and lassi bars',
    architecture: 'farm lawns and courtyards',
  },
  west_bengal: {
    crafts: 'kantha embroidery, terracotta and shola-pith craft',
    textiles: 'kantha and handloom cotton',
    flowers: 'tuberose, lotus and marigold',
    food: 'regional sweets and seasonal counters',
    architecture: 'colonial verandahs and courtyards',
  },
  gujarat: {
    crafts: 'bandhani, mirror-work and Kutch embroidery',
    textiles: 'bandhani and patola-inspired accents',
    flowers: 'marigold and roses',
    food: 'thali and farsan counters',
    architecture: 'pol-style courtyards and stepwell geometry',
  },
  telangana: {
    crafts: 'Pochampally ikat and bidri metalwork',
    textiles: 'ikat weaves',
    flowers: 'jasmine and roses',
    food: 'slow-cooked dum counters and regional sweets',
    architecture: 'arches and palace courtyards',
  },
  uttarakhand: {
    crafts: 'pine wood, aipan folk art and wool throws',
    textiles: 'handspun wool and cotton',
    flowers: 'rhododendron and wildflowers',
    food: 'hill-style seasonal counters',
    architecture: 'riverside and hill-view lawns',
  },
  uttar_pradesh: {
    crafts: 'chikankari, zardozi accents and marble inlay',
    textiles: 'chikankari',
    flowers: 'roses and marigold',
    food: 'slow-cooked regional counters',
    architecture: 'arched pavilions and gardens',
  },
  india_other: {
    crafts: 'handloom, brass and terracotta from local artisans',
    textiles: 'local handloom',
    flowers: 'seasonal local flowers',
    food: 'regional counters featuring local favourites',
    architecture: 'the venue’s most characterful spaces',
  },
  international: {
    crafts: 'local artisans and materials',
    textiles: 'natural linens',
    flowers: 'seasonal local flowers',
    food: 'a menu shaped by the hosts’ preferences',
    architecture: 'the venue’s most characterful spaces',
  },
};

interface ConceptContext {
  brief: EventBrief;
  craft: RegionCraft;
  region: RegionKey;
  daysToEvent: number;
  outdoor: boolean;
  monsoon: boolean;
  heat: boolean;
  cold: boolean;
  affluence: number;
  typeLabel: string;
  formal: boolean;
  playful: boolean;
}

function attireFor(ctx: ConceptContext, mood: string): string {
  const t = ctx.brief.type;
  if (t === 'community' || t === 'festival')
    return `No dress code required; suggest comfortable ${mood} wear and flat-friendly footwear for open grounds.`;
  if (ctx.playful) return `Optional ${mood} dress code on the invitation — keep it fun and easy to follow.`;
  if (t === 'corporate') return `Smart ${mood} — share a palette note on the invitation so photos feel cohesive.`;
  return `Suggested ${mood} dress code per session, shared as a palette note on the invitation; the hosts decide outfits and any traditional attire.`;
}

function weatherNotes(ctx: ConceptContext, extra: string[] = []): string[] {
  const out: string[] = [];
  const outlook = seasonOutlook(ctx.brief.city, ctx.brief.country, ctx.brief.eventDate);
  if (ctx.outdoor && ctx.monsoon) out.push('Monsoon-season date: every open-air element needs a covered fallback and dry walkways.');
  if (ctx.outdoor && ctx.heat) out.push('Hot season: shift outdoor moments after sunset; choose heat-hardy flowers.');
  if (ctx.outdoor && ctx.cold) out.push('Cool evenings: plan heaters, throws and covered lounges for night sessions.');
  if (!ctx.outdoor) out.push('Indoor setting: check ceiling heights, rigging points and fire-safety rules for installations.');
  out.push(...extra);
  if (!out.length) out.push(outlook.notes[0] ?? 'Keep a simple rain plan for any open-air moment.');
  return out;
}

function leadNote(ctx: ConceptContext, leadTime: number): string[] {
  return ctx.daysToEvent < leadTime
    ? [`Lead time is tight: this concept typically needs ~${leadTime} days of procurement; ${Math.max(0, ctx.daysToEvent)} remain.`]
    : [];
}

type Builder = (ctx: ConceptContext) => Omit<ThemeConcept, 'id' | 'saved'>;

const proc = (title: string, offsetDays: number, workstream: Workstream) => ({ title, offsetDays, workstream });

const BUILDERS: Record<string, Builder> = {
  heritage: (ctx) => {
    const palette: PaletteColor[] = [
      { name: 'Ivory', hex: '#F3EAD8' },
      { name: 'Marigold', hex: '#D9932B' },
      { name: 'Terracotta', hex: '#B5603F' },
      { name: 'Deep green', hex: '#2F5141' },
      { name: 'Antique gold', hex: '#B08D57' },
    ];
    return {
      name: 'Contemporary Heritage',
      archetype: 'heritage',
      rationale: `A refined take on local craft for a ${ctx.typeLabel.toLowerCase()} in ${ctx.brief.city || 'your city'}: ${ctx.craft.crafts}, edited with restraint so it feels current rather than costume.`,
      palette,
      decor: `Frame ${ctx.craft.architecture} with ${ctx.craft.textiles} drapes, low seating clusters and hand-crafted props; one hero installation per space rather than décor everywhere.`,
      lighting:
        'Warm 2700K ambient light, brass lanterns and candle clusters (LED where open flames are restricted); uplight architectural details after sunset.',
      florals: `${ctx.craft.flowers[0].toUpperCase()}${ctx.craft.flowers.slice(1)} in loose, textural arrangements; strands and urlis instead of foam-based structures.`,
      attire: attireFor(ctx, 'festive heritage'),
      food: `${ctx.craft.food[0].toUpperCase()}${ctx.craft.food.slice(1)}, with clearly labelled dietary counters.`,
      guestExperience:
        'A welcome ritual of cool drinks and a hand-written itinerary; an artisan corner where guests watch a craft demonstration; curated keepsakes from local makers.',
      photography:
        'Golden-hour portraits framed by architecture, detail shots of textiles and hands, candid documentary coverage of family moments.',
      costFactors: { decor: 1.05, gifts: 1.05 },
      practicality: ctx.daysToEvent < 60 ? 3 : 4,
      logistics: ['Artisan textiles need 6–8 weeks; confirm quantities early.', ...leadNote(ctx, 60)],
      weather: weatherNotes(ctx),
      leadTimeDays: 60,
      procurement: [
        proc('Commission artisan textiles & printed linens', -60, 'design'),
        proc('Finalise craft installations with décor studio', -35, 'design'),
      ],
    };
  },
  minimal: (ctx) => ({
    name: 'Modern Minimal',
    archetype: 'minimal',
    rationale:
      'Clean lines, a quiet palette and a few confident gestures — ideal when the venue has character of its own and the budget should go to food, people and photography.',
    palette: [
      { name: 'Chalk', hex: '#F5F2EC' },
      { name: 'Stone', hex: '#CFC6B8' },
      { name: 'Sage', hex: '#9AAA8F' },
      { name: 'Charcoal', hex: '#33363A' },
      { name: 'Brushed brass', hex: '#B39A6B' },
    ],
    decor:
      'Monochrome table runners, sculptural single-stem arrangements, linen drapes and generous negative space; signage in one elegant typeface.',
    lighting: 'Soft wash lighting with pin-spots on tables and florals; avoid colour-changing effects.',
    florals: 'White and green seasonal blooms with foliage — fewer stems, more structure.',
    attire: attireFor(ctx, 'tonal, pastel or ivory'),
    food: 'Plated or family-style courses for the key meal; a tight menu with one signature dish per session and clearly separated dietary options.',
    guestExperience: 'An unhurried flow with fewer transitions, a calm lounge for elders, and a single memorable moment per session.',
    photography: 'Editorial portraits against plain textures; negative-space compositions; muted colour grade.',
    costFactors: { decor: 0.85, production: 0.95, printing: 0.9 },
    practicality: 5,
    logistics: ['Rental-heavy inventory is quick to source.', 'Requires precise styling — brief vendors with a visual spec sheet.'],
    weather: weatherNotes(ctx),
    leadTimeDays: 30,
    procurement: [proc('Sign off minimalist décor spec & rental inventory', -30, 'design')],
  }),
  eco: (ctx) => ({
    name: 'Eco-conscious Garden',
    archetype: 'eco',
    rationale:
      'A lower-footprint celebration that still feels abundant: living plants, rental décor, local seasonal flowers and zero single-use plastic.',
    palette: [
      { name: 'Linen', hex: '#EFE8DA' },
      { name: 'Moss', hex: '#6E7F4F' },
      { name: 'Leaf', hex: '#9DB17C' },
      { name: 'Clay', hex: '#B98563' },
      { name: 'Sunflower', hex: '#E2B33C' },
    ],
    decor:
      'Potted plants that guests or a nursery take home, rental furniture, reusable fabric and wood signage; no foam, thermocol or plastic backdrops.',
    lighting: 'Warm festoon lighting and LED lanterns on efficient power; daylight-led scheduling for daytime sessions.',
    florals: `Local seasonal flowers (${ctx.craft.flowers}) bought by weight; arrangements composted after the event.`,
    attire: attireFor(ctx, 'handloom or re-worn favourite'),
    food: 'Seasonal, locally sourced menu sized to RSVPs; refill stations instead of bottled water; a surplus-food plan with a verified local partner.',
    guestExperience:
      'Digital invitations and RSVPs, a seed-paper or plant keepsake, waste-segregation stations staffed by volunteers, carpool or shuttle encouragement.',
    photography: 'Natural light, greenery-framed portraits, candid storytelling of the low-waste details.',
    costFactors: { decor: 0.9, printing: 0.4, gifts: 0.9 },
    practicality: 4,
    logistics: [
      'Needs vendors willing to commit to a no-plastic brief.',
      'Plan the post-event plant handover and compost pickup.',
      ...leadNote(ctx, 45),
    ],
    weather: weatherNotes(ctx, ctx.outdoor ? ['Living plants need shade and watering on hot days.'] : []),
    leadTimeDays: 45,
    procurement: [
      proc('Confirm rental décor & potted-plant suppliers', -45, 'design'),
      proc('Brief all vendors on zero single-use plastic', -30, 'planning'),
      proc('Identify and verify a surplus-food redistribution partner', -14, 'catering'),
    ],
  }),
  grandeur: (ctx) => ({
    name: 'Jewel-toned Grandeur',
    archetype: 'grandeur',
    rationale:
      'Rich colour, abundant florals and dramatic scale for clients who want a celebratory, maximal atmosphere — balanced with careful logistics.',
    palette: [
      { name: 'Ruby', hex: '#8E1F2F' },
      { name: 'Emerald', hex: '#1F5F4A' },
      { name: 'Sapphire', hex: '#23406B' },
      { name: 'Gold leaf', hex: '#C49A3A' },
      { name: 'Ivory', hex: '#F4ECDC' },
    ],
    decor: `Layered velvet and silk drapes, statement entrance installations and a custom-built stage; nods to ${ctx.craft.textiles} in table linens.`,
    lighting: 'Chandeliers and crystal accents with theatrical uplighting; programmed lighting cues for entrances.',
    florals: 'Abundant florals in deep jewel tones with gold accents — book bulk orders early and plan cold storage.',
    attire: attireFor(ctx, 'jewel-toned'),
    food: 'Grand buffet with live chef stations and a separate dessert pavilion; dedicated dietary counters with their own staff.',
    guestExperience: 'Choreographed entrances, a lounge with live musicians, personalised welcome hampers.',
    photography: 'Wide architectural frames showing scale, dramatic lighting portraits, a dedicated video crew for entrances.',
    costFactors: { decor: 1.3, production: 1.1, attire: 1.1 },
    practicality: ctx.brief.guestCount > 400 ? 2 : 3,
    logistics: [
      'Large installations need long setup windows — check venue load-in rules.',
      'Bulk floral orders need cold storage.',
      ...leadNote(ctx, 75),
    ],
    weather: weatherNotes(ctx, ctx.heat ? ['Heavy fabrics and dense florals suffer in heat — prefer indoor or evening settings.'] : []),
    leadTimeDays: 75,
    procurement: [
      proc('Commission custom stage & entrance fabrication', -75, 'design'),
      proc('Place bulk floral order with cold storage', -30, 'design'),
    ],
  }),
  fusion: (ctx) => ({
    name: 'Fusion Soirée',
    archetype: 'fusion',
    rationale:
      'An Indo-contemporary evening atmosphere — cocktail-style layouts, metallic accents and a curated music journey that moves from acoustic to dance floor.',
    palette: [
      { name: 'Midnight', hex: '#1E2A3A' },
      { name: 'Champagne', hex: '#E6D3B3' },
      { name: 'Rose gold', hex: '#C98F7E' },
      { name: 'Teal', hex: '#2E6E6E' },
      { name: 'Pearl', hex: '#F3EFE8' },
    ],
    decor: 'Lounge clusters, high-top tables, mirrored and metallic surfaces with occasional handcrafted textile panels for warmth.',
    lighting: 'Moody low light with warm pin-spots, a feature bar glow and a lit dance floor.',
    florals: 'Sculptural arrangements mixing orchids and local blooms; minimal greenery walls as photo backdrops.',
    attire: attireFor(ctx, 'Indo-western cocktail'),
    food: 'Small plates and passed bites, a few hero live counters and a mocktail/cocktail bar (as the hosts prefer), with clear dietary tags.',
    guestExperience: 'A curated set list, a live sketch artist or photo moment, late-night snacks for the after-party.',
    photography: 'Flash-lit candid frames, cinematic slow-motion on the dance floor, styled portraits at the bar.',
    costFactors: { decor: 1.1, production: 1.15, entertainment: 1.1 },
    practicality: 4,
    logistics: ['Requires strong sound and lighting crews — confirm power load.', ...leadNote(ctx, 45)],
    weather: weatherNotes(ctx),
    leadTimeDays: 45,
    procurement: [
      proc('Design lounge layouts & book furniture rentals', -40, 'design'),
      proc('Finalise music journey & technical rider', -25, 'entertainment'),
    ],
  }),
  pavilion: (ctx) => ({
    name: 'Weather-ready Pavilion',
    archetype: 'pavilion',
    rationale: `Designed around the ${ctx.monsoon ? 'monsoon' : ctx.heat ? 'heat' : 'season'}: an elegant covered pavilion keeps the open-air feel without the weather risk.`,
    palette: [
      { name: 'Canvas', hex: '#EDE6D6' },
      { name: 'Monsoon grey', hex: '#8B95A1' },
      { name: 'Eucalyptus', hex: '#7FA392' },
      { name: 'Brass', hex: '#B08D57' },
      { name: 'Terracotta', hex: '#B5603F' },
    ],
    decor:
      'A weatherproof structure with roll-up side walls, raised flooring, rugs and planters; décor that survives humidity (no paper or untreated fabric).',
    lighting: 'Festoon canopies inside the structure, warm uplighting on the side walls, rated outdoor fixtures.',
    florals: 'Hardy tropical foliage and humidity-tolerant blooms; arrangements set on weighted bases.',
    attire: attireFor(ctx, 'light, breathable'),
    food: 'Covered buffet lines with heat lamps or chilled counters as needed; hot beverage or cooling-drink stations.',
    guestExperience: 'Covered walkways from cars to seats, umbrella or fan concierge, a cosy lounge corner.',
    photography: 'Portraits under the canopy lights, rain-kissed detail shots, a backup indoor portrait spot.',
    costFactors: { production: 1.35, decor: 0.95 },
    practicality: 5,
    logistics: ['Structure needs venue approval and a 1–2 day build window.', 'Confirm ground conditions and drainage.'],
    weather: weatherNotes(ctx, ['Set a go/no-go weather checkpoint 48 hours before each open-air session.']),
    leadTimeDays: 30,
    procurement: [
      proc('Book weatherproof structure & raised flooring', -30, 'production'),
      proc('Weather go/no-go checkpoint', -2, 'production'),
    ],
  }),
  playful: (ctx) => ({
    name: ctx.brief.type === 'baby_shower' ? 'Soft Garden Party' : 'Playful Celebration',
    archetype: 'playful',
    rationale: `Light-hearted and personal for a ${ctx.typeLabel.toLowerCase()}: interactive corners, a cheerful palette and food that’s easy to enjoy while mingling.`,
    palette: [
      { name: 'Butter', hex: '#F6E3A3' },
      { name: 'Peach', hex: '#F2B8A0' },
      { name: 'Mint', hex: '#BFE0CF' },
      { name: 'Sky', hex: '#A9C8E8' },
      { name: 'Cocoa', hex: '#6B4E3D' },
    ],
    decor: 'Activity stations, a personalised photo wall, picnic-style seating zones and handmade signage.',
    lighting: 'Daylight-led with fairy lights or lanterns for evening.',
    florals: 'Bright seasonal blooms in jars and bud vases — easy to take home.',
    attire: attireFor(ctx, 'colourful, comfortable'),
    food: 'Grazing tables, a build-your-own dessert bar and child-friendly options clearly separated from allergen-free choices.',
    guestExperience: 'Games or a hosted activity, a memory jar or message board, take-home favours.',
    photography: 'Candid, colourful coverage; a self-serve instant-photo corner.',
    costFactors: { decor: 0.95, entertainment: 1.1 },
    practicality: 5,
    logistics: ['Plan supervision and safety for any children’s activities.'],
    weather: weatherNotes(ctx),
    leadTimeDays: 21,
    procurement: [proc('Book activity hosts & rentals', -21, 'entertainment')],
  }),
};

function orderFor(type: EventType, ctx: ConceptContext): string[] {
  const order: string[] = [];
  if (ctx.outdoor && (ctx.monsoon || ctx.heat)) order.push('pavilion');
  if (type === 'birthday' || type === 'baby_shower') order.push('playful');
  order.push('heritage');
  if (ctx.affluence >= 1.15) order.push('grandeur');
  order.push('minimal', 'eco', 'fusion');
  if (!order.includes('grandeur')) order.push('grandeur');
  if (!order.includes('pavilion') && ctx.outdoor) order.push('pavilion');
  if (!order.includes('playful') && (type === 'anniversary' || type === 'community' || type === 'custom')) order.push('playful');
  return order;
}

export function themeContext(brief: EventBrief, today: ISODate): ConceptContext {
  const region = regionFor(brief.city, brief.country);
  const outlook = seasonOutlook(brief.city, brief.country, brief.eventDate);
  const outdoor = brief.setting !== 'indoor' || brief.sessions.some((s) => s.setting !== 'indoor');
  // Affluence: stated budget against a reference spend per guest for the event type.
  const refPerGuest = 25_000 * (brief.currency === 'INR' ? 1 : 1 / 30);
  const affluence = brief.guestCount > 0 ? brief.totalBudget / (brief.guestCount * refPerGuest) : 1;
  return {
    brief,
    craft: CRAFT[region],
    region,
    daysToEvent: diffDays(today, brief.eventDate),
    outdoor,
    monsoon: outlook.monsoon,
    heat: outlook.heatRisk === 'high',
    cold: outlook.coldEvenings,
    affluence,
    typeLabel: eventTypeLabel(brief.type, brief.customTypeLabel),
    formal: ['wedding', 'engagement', 'corporate', 'anniversary'].includes(brief.type),
    playful: ['birthday', 'baby_shower'].includes(brief.type),
  };
}

/** Generate four concepts; `variant` rotates which archetypes lead. */
export function generateConcepts(brief: EventBrief, today: ISODate, variant = 0): ThemeConcept[] {
  const ctx = themeContext(brief, today);
  const order = orderFor(brief.type, ctx);
  const start = (variant * 2) % order.length;
  const picked: string[] = [];
  for (let i = 0; i < order.length && picked.length < 4; i++) picked.push(order[(start + i) % order.length]);
  const access = brief.accessibility.length
    ? ['Accessibility: keep décor off step-free routes, light every pathway well and include seating with arm rests in each space.']
    : [];
  return picked.map((key) => {
    const built = BUILDERS[key](ctx);
    return { ...built, logistics: [...built.logistics, ...access], id: `theme_${key}`, saved: false };
  });
}

export function personalisationInputs(brief: EventBrief, today: ISODate): string[] {
  const ctx = themeContext(brief, today);
  const outlook = seasonOutlook(brief.city, brief.country, brief.eventDate);
  const inputs = [
    ctx.typeLabel,
    `${brief.guestCount} guests`,
    brief.city || 'City not set',
    outlook.label,
    brief.setting === 'indoor'
      ? 'Indoor'
      : brief.setting === 'outdoor'
        ? 'Open-air'
        : brief.setting === 'covered'
          ? 'Covered outdoor'
          : 'Indoor + outdoor',
    ctx.affluence >= 1.15 ? 'Generous budget per guest' : ctx.affluence < 0.6 ? 'Lean budget per guest' : 'Moderate budget per guest',
    `${Math.max(0, ctx.daysToEvent)} days lead time`,
  ];
  if (brief.accessibility.length) inputs.push('Accessibility needs noted');
  if (brief.style) inputs.push(`Style: ${brief.style}`);
  return inputs;
}
