import { categoryMeta, eventTypeLabel, eventTypeProfile, SETTING_LABEL } from './catalog';
import { seasonOutlook } from './season';
import type { Assumption, EventBrief, ISODate, Narrative } from './types';
import { diffDays, formatMonthYear, formatMoneyCompact, uid } from './util';

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function buildAssumptions(brief: EventBrief, today: ISODate, contingencyPct: number): Assumption[] {
  const a: Assumption[] = [];
  const add = (text: string, field?: string) => a.push({ id: uid('as'), text, field });
  const profile = eventTypeProfile(brief.type);
  const lead = diffDays(today, brief.eventDate);
  if (!brief.city.trim())
    add('City not specified — cost benchmarks use a non-metro Indian city and seasonal guidance is unavailable.', 'city');
  if (brief.venueStatus === 'searching')
    add('No venue secured yet. Venue-dependent tasks are flagged and cannot be finalised.', 'venueStatus');
  if (brief.venueStatus === 'shortlisted')
    add(
      `Venue “${brief.venueName || 'shortlisted option'}” is assumed but not contracted; venue-dependent tasks stay flagged until it is.`,
      'venueStatus',
    );
  if (!brief.culturalPreferences.trim())
    add(
      'No ceremonial or cultural requirements were provided, so none have been assumed. Add them to the brief if the hosts want any.',
      'culturalPreferences',
    );
  if (!brief.dietarySpecified)
    add(
      'Dietary mix not specified — catering assumes a mixed menu with clearly labelled vegetarian options. Confirm with the client.',
      'dietary',
    );
  if (!brief.accessibility.length)
    add(
      'No accessibility needs stated. The plan still keeps step-free routes and reserved seating as a baseline; confirm with the client.',
      'accessibility',
    );
  if (lead < profile.standardLead)
    add(
      `Lead time is ${Math.max(0, lead)} days against a typical ${profile.standardLead} for this event type — expect a compressed schedule; check that each milestone still has enough lead time.`,
      'eventDate',
    );
  if (brief.sessions.length && brief.sessions.every((s) => s.start === '19:00' || s.start === '11:00' || s.start === '18:30'))
    add('Session timings are suggestions until confirmed with the client and venue.', 'sessions');
  add(
    `Budget estimates are illustrative planning benchmarks, not market quotations, and include a ${contingencyPct}% contingency reserve.`,
    'totalBudget',
  );
  if (!brief.clientName.trim()) add('Client contact not recorded — add who approves budget and design decisions.', 'clientName');
  if (brief.currency !== 'INR' && brief.country.trim().toLowerCase() === 'india')
    add(`Budget is held in ${brief.currency}; benchmarks are converted at a fixed illustrative reference rate.`, 'currency');
  return a;
}

export function buildOpenQuestions(brief: EventBrief): string[] {
  const q: string[] = [];
  if (brief.venueStatus !== 'confirmed' && brief.venueStatus !== 'not_required')
    q.push('Which venue will the client commit to, and by when must the contract be signed?');
  if (!brief.culturalPreferences.trim())
    q.push('Are there ceremonies, rituals or customs the hosts would like included? (Nothing has been assumed.)');
  if (!brief.dietarySpecified) q.push('What is the expected dietary mix, and are there allergies we must plan around?');
  if (!brief.accessibility.length) q.push('Do any guests need step-free access, seating support, hearing or visual assistance?');
  if (brief.setting !== 'indoor') q.push('What is the agreed fallback if the weather turns for open-air sessions?');
  if (!brief.protectedCategories.length) q.push('Which one or two areas matter most to the client if trade-offs are needed?');
  q.push('Who signs off on budget changes above the contingency reserve?');
  return q.slice(0, 6);
}

function guestIdeas(brief: EventBrief): string[] {
  const t = brief.type;
  const ideas: string[] = [];
  if (t === 'wedding' || t === 'engagement') {
    ideas.push('A hospitality desk with printed and digital itineraries for every session.');
    ideas.push('A quiet lounge for elders with comfortable seating and easy access to food.');
    ideas.push('Personalised welcome notes and a local-craft keepsake in each room or at check-in.');
  } else if (t === 'birthday' || t === 'baby_shower') {
    ideas.push('An interactive corner — messages, a memory jar or a hosted activity.');
    ideas.push('A personalised photo moment that reflects the guest of honour.');
    ideas.push('Take-home favours chosen around the theme rather than generic gifts.');
  } else if (t === 'community' || t === 'festival' || t === 'cultural') {
    ideas.push('Clear wayfinding, a help desk and visible volunteers in identifiable colours.');
    ideas.push('Family-friendly zones with seating, shade and water points.');
    ideas.push('Programme boards and announcements in the languages the community uses.');
  } else {
    ideas.push('A warm welcome moment as guests arrive — drinks, music and a clear schedule.');
    ideas.push('Seating clusters that encourage conversation between groups.');
    ideas.push('A thoughtful take-home that ties back to the occasion.');
  }
  if (brief.accessibility.length)
    ideas.push('Reserved, step-free seating close to the action and a named assistance contact for guests who need help.');
  if (brief.dietarySpecified && (brief.dietary.veganCount > 0 || brief.dietary.jainCount > 0 || brief.dietary.allergens.length)) {
    ideas.push('Separately staffed dietary counters with clear labels for allergens and preferences.');
  }
  if (brief.style.trim())
    ideas.push(`Carry the “${brief.style.trim()}” style through invitations, signage and on-site stationery for a cohesive story.`);
  return ideas.slice(0, 6);
}

export function generateNarrative(brief: EventBrief, today: ISODate, contingencyPct: number, previous?: Narrative): Narrative {
  const typeLabel = eventTypeLabel(brief.type, brief.customTypeLabel);
  const when = formatMonthYear(brief.eventDate);
  const where = brief.city.trim() ? ` in ${brief.city.trim()}` : '';
  const sessions = brief.sessions.length;
  const protectedLabels = brief.protectedCategories.map((k) => categoryMeta(k)?.label.toLowerCase() ?? k);
  const outlook = seasonOutlook(brief.city, brief.country, brief.eventDate);
  const budget = formatMoneyCompact(brief.totalBudget, brief.currency);

  const visionParts = [
    `${brief.style.trim() ? `A ${brief.style.trim().replace(/^[A-Z]/, (c) => c.toLowerCase())}` : 'A thoughtfully produced'} ${typeLabel.toLowerCase()} for around ${brief.guestCount} guests${where}, ${when}.`,
  ];
  if (brief.atmosphere.trim()) visionParts.push(brief.atmosphere.trim().replace(/\.?$/, '.'));
  visionParts.push(
    `${sessions > 1 ? `Across ${sessions} sessions over ${brief.durationDays} day${brief.durationDays > 1 ? 's' : ''}` : 'Across a single, well-paced session'}, the plan aims for generous hospitality and calm, invisible logistics.`,
  );
  if (protectedLabels.length)
    visionParts.push(`Investment is weighted toward ${list(protectedLabels)}, which the client has asked us to protect.`);
  if (brief.setting !== 'indoor' && outlook.label !== 'Seasonal outlook unavailable')
    visionParts.push(
      `${outlook.label} conditions shape the design: ${outlook.notes[0].charAt(0).toLowerCase()}${outlook.notes[0].slice(1)}`,
    );

  const objectives = [
    `Deliver ${sessions > 1 ? `${sessions} seamless sessions` : 'a seamless celebration'} for ~${brief.guestCount} guests.`,
    `Hold total spend within ${budget}, including a ${contingencyPct}% contingency reserve.`,
  ];
  if (protectedLabels.length) objectives.push(`Protect quality in ${list(protectedLabels)}.`);
  objectives.push(
    brief.venueStatus === 'confirmed' || brief.venueStatus === 'not_required'
      ? 'Lock every critical vendor early and keep contracts aligned with the budget.'
      : 'Secure the venue first — it unblocks layouts, permits and production.',
  );
  objectives.push('Make every space accessible and every dietary need easy to meet.');
  for (const g of brief.goals
    .split(/\n|;/)
    .map((s) => s.trim())
    .filter(Boolean))
    objectives.push(g.replace(/\.?$/, '.'));
  for (const n of brief.nonNegotiables) objectives.push(`Non-negotiable: ${n.replace(/\.?$/, '.')}`);

  const audienceParts = [`~${brief.guestCount} guests${brief.clientName.trim() ? ` hosted by ${brief.clientName.trim()}` : ''}.`];
  if (brief.dietarySpecified) {
    const d = brief.dietary;
    const parts = [`${d.vegetarianPct}% vegetarian`];
    if (d.veganCount) parts.push(`${d.veganCount} vegan`);
    if (d.jainCount) parts.push(`${d.jainCount} Jain`);
    if (d.allergens.length) parts.push(`allergies: ${d.allergens.join(', ')}`);
    audienceParts.push(`Dietary: ${parts.join(', ')}.`);
  } else audienceParts.push('Dietary mix to be confirmed.');
  audienceParts.push(
    brief.accessibility.length ? `Accessibility: ${brief.accessibility.join(', ').toLowerCase()}.` : 'Accessibility needs to be confirmed.',
  );
  audienceParts.push(`Setting: ${SETTING_LABEL[brief.setting].toLowerCase()}.`);

  const fresh: Narrative = {
    generatedAt: new Date().toISOString(),
    vision: visionParts.join(' '),
    objectives,
    audience: audienceParts.join(' '),
    assumptions: buildAssumptions(brief, today, contingencyPct),
    openQuestions: buildOpenQuestions(brief),
    guestExperienceIdeas: guestIdeas(brief),
    edited: {},
  };
  if (!previous) return fresh;
  // Keep any section the planner edited by hand.
  const keep = previous.edited;
  return {
    ...fresh,
    vision: keep.vision ? previous.vision : fresh.vision,
    objectives: keep.objectives ? previous.objectives : fresh.objectives,
    audience: keep.audience ? previous.audience : fresh.audience,
    guestExperienceIdeas: keep.guestExperienceIdeas ? previous.guestExperienceIdeas : fresh.guestExperienceIdeas,
    openQuestions: keep.openQuestions ? previous.openQuestions : fresh.openQuestions,
    edited: { ...keep },
  };
}
