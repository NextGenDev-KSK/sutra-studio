import { DIET_LABEL, RSVP_LABEL } from './catalog';
import { parseCSV, toCSV } from './csv';
import type { Diet, Guest, RSVP } from './types';
import { uid } from './util';

export interface GuestSummary {
  parties: number;
  invited: number;
  confirmed: number;
  declined: number;
  pending: number;
  tentative: number;
  /** confirmed + 70% of awaiting + 50% of tentative — a planning heuristic. */
  projected: number;
  diet: Record<Diet, number>;
  accessibilityParties: number;
  allergyParties: number;
  groups: { name: string; people: number; confirmed: number }[];
}

export const PROJECTION_RULE = 'Projected attendance = attending + 70% of those yet to reply + 50% of tentative replies.';

export function summarizeGuests(guests: Guest[]): GuestSummary {
  const diet: Record<Diet, number> = { vegetarian: 0, non_vegetarian: 0, vegan: 0, jain: 0, other: 0, unknown: 0 };
  let invited = 0,
    confirmed = 0,
    declined = 0,
    pending = 0,
    tentative = 0,
    accessibilityParties = 0,
    allergyParties = 0;
  const groups = new Map<string, { people: number; confirmed: number }>();
  for (const g of guests) {
    const n = Math.max(1, Math.round(g.partySize || 1));
    invited += n;
    if (g.rsvp === 'confirmed') confirmed += n;
    else if (g.rsvp === 'declined') declined += n;
    else if (g.rsvp === 'tentative') tentative += n;
    else pending += n;
    if (g.rsvp !== 'declined') diet[g.diet] += n;
    if (g.accessibility.trim()) accessibilityParties++;
    if (g.allergies.trim()) allergyParties++;
    const key = g.group.trim() || 'Ungrouped';
    const cur = groups.get(key) ?? { people: 0, confirmed: 0 };
    cur.people += n;
    if (g.rsvp === 'confirmed') cur.confirmed += n;
    groups.set(key, cur);
  }
  return {
    parties: guests.length,
    invited,
    confirmed,
    declined,
    pending,
    tentative,
    projected: Math.round(confirmed + pending * 0.7 + tentative * 0.5),
    diet,
    accessibilityParties,
    allergyParties,
    groups: [...groups.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.people - a.people),
  };
}

const HEADERS = [
  'Name',
  'Group',
  'Party size',
  'RSVP',
  'Diet',
  'Allergies',
  'Accessibility',
  'Assistance notes',
  'Table',
  'Contact',
  'Notes',
];

export function guestsToCSV(guests: Guest[]): string {
  return toCSV(
    HEADERS,
    guests.map((g) => [
      g.name,
      g.group,
      g.partySize,
      RSVP_LABEL[g.rsvp],
      DIET_LABEL[g.diet],
      g.allergies,
      g.accessibility,
      g.assistanceNotes,
      g.table,
      g.contact,
      g.notes,
    ]),
  );
}

export interface GuestImportResult {
  guests: Guest[];
  errors: string[];
  skipped: number;
}

function matchEnum<T extends string>(value: string, labels: Record<T, string>, aliases: Record<string, T>, fallback: T): T | null {
  const v = value.trim().toLowerCase();
  if (!v) return fallback;
  for (const [key, label] of Object.entries(labels) as [T, string][]) {
    if (v === key || v === label.toLowerCase()) return key;
  }
  return aliases[v] ?? null;
}

const RSVP_ALIASES: Record<string, RSVP> = {
  yes: 'confirmed',
  attending: 'confirmed',
  accepted: 'confirmed',
  no: 'declined',
  maybe: 'tentative',
  awaiting: 'pending',
  invited: 'pending',
  '': 'pending',
};
const DIET_ALIASES: Record<string, Diet> = {
  veg: 'vegetarian',
  'non-veg': 'non_vegetarian',
  nonveg: 'non_vegetarian',
  'non veg': 'non_vegetarian',
  'not stated': 'unknown',
  none: 'unknown',
};

export function guestsFromCSV(text: string): GuestImportResult {
  const errors: string[] = [];
  let rows: string[][];
  try {
    rows = parseCSV(text);
  } catch (e) {
    return { guests: [], errors: [(e as Error).message], skipped: 0 };
  }
  if (!rows.length) return { guests: [], errors: ['The file is empty.'], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const nameIdx = col('name');
  if (nameIdx < 0)
    return { guests: [], errors: ['Missing a “Name” column. Export a guest list from Sutrā to see the expected format.'], skipped: 0 };
  const get = (r: string[], name: string) => {
    const i = col(name);
    return i >= 0 ? (r[i] ?? '').trim().replace(/^'(?=[=+\-@])/, '') : '';
  };
  const guests: Guest[] = [];
  let skipped = 0;
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const name = get(r, 'Name');
    if (!name) {
      skipped++;
      errors.push(`Row ${line}: missing name — skipped.`);
      return;
    }
    const sizeRaw = get(r, 'Party size');
    const size = sizeRaw ? Number(sizeRaw) : 1;
    if (!Number.isInteger(size) || size < 1 || size > 50) {
      skipped++;
      errors.push(`Row ${line}: party size “${sizeRaw}” must be a whole number between 1 and 50 — skipped.`);
      return;
    }
    const rsvp = matchEnum(get(r, 'RSVP'), RSVP_LABEL, RSVP_ALIASES, 'pending');
    const diet = matchEnum(get(r, 'Diet'), DIET_LABEL, DIET_ALIASES, 'unknown');
    if (!rsvp) errors.push(`Row ${line}: unknown RSVP “${get(r, 'RSVP')}” — set to “Awaiting reply”.`);
    if (!diet) errors.push(`Row ${line}: unknown diet “${get(r, 'Diet')}” — set to “Not stated”.`);
    guests.push({
      id: uid('g'),
      name: name.slice(0, 120),
      group: get(r, 'Group').slice(0, 80),
      partySize: size,
      rsvp: rsvp ?? 'pending',
      diet: diet ?? 'unknown',
      allergies: get(r, 'Allergies').slice(0, 200),
      accessibility: get(r, 'Accessibility').slice(0, 200),
      assistanceNotes: get(r, 'Assistance notes').slice(0, 300),
      table: get(r, 'Table').slice(0, 40),
      contact: get(r, 'Contact').slice(0, 120),
      notes: get(r, 'Notes').slice(0, 500),
    });
  });
  if (!guests.length && !errors.length) errors.push('No guest rows found below the header.');
  return { guests, errors, skipped };
}
