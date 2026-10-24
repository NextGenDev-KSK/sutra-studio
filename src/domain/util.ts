import type { ClockTime, CurrencyCode, ISODate } from './types';

// ---------- ids ----------

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/** Deterministic PRNG (mulberry32) for reproducible demo data. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- dates (calendar-day arithmetic in UTC to avoid DST drift) ----------

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function toUTC(date: ISODate): number {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

function fromUTC(ms: number): ISODate {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + Math.round(days) * 86_400_000);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function monthIndex(date: ISODate): number {
  return new Date(toUTC(date)).getUTCMonth();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDate(date: ISODate, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!isValidISODate(date)) return '—';
  const d = new Date(toUTC(date));
  const parts = [`${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`];
  if (opts.year !== false) parts[0] += ` ${d.getUTCFullYear()}`;
  return opts.weekday ? `${WEEKDAYS[d.getUTCDay()]}, ${parts[0]}` : parts[0];
}

export function formatMonthYear(date: ISODate): string {
  const d = new Date(toUTC(date));
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function weekdayIndex(date: ISODate): number {
  return new Date(toUTC(date)).getUTCDay();
}

export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days} days`;
  return `${-days} days ago`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- clock times ----------

export function isValidTime(value: unknown): value is ClockTime {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function timeToMinutes(t: ClockTime): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): ClockTime {
  const norm = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`;
}

// ---------- money ----------

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string; locale: string }[] = [
  { code: 'INR', label: 'Indian rupee (₹)', symbol: '₹', locale: 'en-IN' },
  { code: 'USD', label: 'US dollar ($)', symbol: '$', locale: 'en-US' },
  { code: 'GBP', label: 'British pound (£)', symbol: '£', locale: 'en-GB' },
  { code: 'EUR', label: 'Euro (€)', symbol: '€', locale: 'en-IE' },
  { code: 'AED', label: 'UAE dirham (AED)', symbol: 'AED', locale: 'en-AE' },
  { code: 'SGD', label: 'Singapore dollar (S$)', symbol: 'S$', locale: 'en-SG' },
];

export function currencyMeta(code: CurrencyCode) {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/** Full amount, e.g. ₹75,00,000 (Indian digit grouping for INR). */
export function formatMoney(amount: number, currency: CurrencyCode): string {
  const meta = currencyMeta(currency);
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(safe));
}

/** Compact amount, e.g. ₹12.5 L, ₹1.2 Cr, $45.2K. */
export function formatMoneyCompact(amount: number, currency: CurrencyCode): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const sign = safe < 0 ? '−' : '';
  const abs = Math.abs(safe);
  const meta = currencyMeta(currency);
  const sym = meta.symbol.length > 1 && meta.symbol !== 'S$' ? `${meta.symbol} ` : meta.symbol;
  const trim = (n: number, digits: number) =>
    n
      .toFixed(digits)
      .replace(/\.0+$/, '')
      .replace(/(\.\d*[1-9])0+$/, '$1');
  if (currency === 'INR') {
    if (abs >= 1e7) return `${sign}${sym}${trim(abs / 1e7, 2)} Cr`;
    if (abs >= 1e5) return `${sign}${sym}${trim(abs / 1e5, 2)} L`;
    return `${sign}${formatMoney(abs, currency)}`;
  }
  if (abs >= 1e6) return `${sign}${sym}${trim(abs / 1e6, 2)}M`;
  if (abs >= 1e4) return `${sign}${sym}${trim(abs / 1e3, 1)}K`;
  return `${sign}${formatMoney(abs, currency)}`;
}

export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event'
  );
}
