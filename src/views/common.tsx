import { useMemo } from 'react';
import { create } from 'zustand';
import { BadgeCheck, CircleDashed, FlaskConical, ShieldAlert } from 'lucide-react';
import { getInsights } from '../domain/insights';
import { VENDOR_STATUS_LABEL } from '../domain/catalog';
import type { CurrencyCode, EventPlan, Vendor, VendorStatus } from '../domain/types';
import { formatMoney, formatMoneyCompact, todayISO } from '../domain/util';
import type { CopilotStatus } from '../copilot/provider';

export function useToday() {
  return todayISO();
}

/** Shared, cached insights for a plan version (see getInsights). */
export function useInsights(plan: EventPlan) {
  const today = useToday();
  return useMemo(() => getInsights(plan, today), [plan, today]);
}

interface UIState {
  sidebarOpen: boolean;
  copilotOpen: boolean;
  copilotDraft: string;
  copilotStatus: CopilotStatus;
  setSidebar: (v: boolean) => void;
  openCopilot: (draft?: string) => void;
  closeCopilot: () => void;
  setDraft: (v: string) => void;
  setStatus: (s: CopilotStatus) => void;
}

export const useUI = create<UIState>((set) => ({
  sidebarOpen: false,
  copilotOpen: false,
  copilotDraft: '',
  copilotStatus: { available: false, checked: false },
  setSidebar: (v) => set({ sidebarOpen: v }),
  openCopilot: (draft) => set((s) => ({ copilotOpen: true, copilotDraft: draft ?? s.copilotDraft })),
  closeCopilot: () => set({ copilotOpen: false }),
  setDraft: (v) => set({ copilotDraft: v }),
  setStatus: (s) => set({ copilotStatus: s }),
}));

export function Money({
  value,
  currency,
  compact = true,
  signed,
  className,
}: {
  value: number;
  currency: CurrencyCode;
  compact?: boolean;
  signed?: boolean;
  className?: string;
}) {
  const body = compact ? formatMoneyCompact(Math.abs(value), currency) : formatMoney(Math.abs(value), currency);
  const sign = signed ? (Math.round(value) > 0 ? '+' : Math.round(value) < 0 ? '−' : '') : value < 0 ? '−' : '';
  return (
    <span className={`num ${className ?? ''}`} title={formatMoney(value, currency)}>
      {sign}
      {body}
    </span>
  );
}

const VENDOR_TONE: Record<VendorStatus, string> = {
  identified: 'badge-outline',
  contacted: 'badge-info',
  quoted: 'badge-gold',
  shortlisted: 'badge-gold',
  booked: 'badge-ok',
  completed: 'badge-ok',
  rejected: '',
  cancelled: 'badge-danger',
};

export function VendorStatusBadge({ status }: { status: VendorStatus }) {
  return <span className={`badge ${VENDOR_TONE[status]}`}>{VENDOR_STATUS_LABEL[status]}</span>;
}

export function VerificationBadge({ vendor, long }: { vendor: Vendor; long?: boolean }) {
  const v = vendor.verification;
  if (v.level === 'verified') {
    return (
      <span
        className="badge badge-ok"
        title={`Verified${v.checkedOn ? ` on ${v.checkedOn}` : ''}${v.sourceUrl ? ` · ${v.sourceUrl}` : ''}`}
      >
        <BadgeCheck /> Verified{long && v.checkedOn ? ` · ${v.checkedOn}` : ''}
      </span>
    );
  }
  if (v.level === 'illustrative') {
    return (
      <span className="badge badge-demo" title="Fictional business created for the demo. Not verified; no contact details exist.">
        <FlaskConical /> {long ? 'Illustrative demo vendor — not verified' : 'Illustrative · not verified'}
      </span>
    );
  }
  return (
    <span className="badge badge-outline" title="Entered by the planning team. Details have not been verified against a source.">
      <ShieldAlert /> {long ? 'Planner-entered — not verified' : 'Not verified'}
    </span>
  );
}

export function IllustrativeTag({ children = 'Illustrative estimate' }: { children?: string }) {
  return (
    <span className="badge badge-outline" title="Planning benchmark, not a market quotation.">
      <CircleDashed /> {children}
    </span>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#284a3b" />
      <path d="M42 20c-3-4-16-5-18 2-2 8 18 8 16 17-2 7-15 7-19 1" fill="none" stroke="#d4b46a" strokeWidth="4" strokeLinecap="round" />
      <circle cx="21" cy="40" r="3" fill="#d4b46a" />
      <circle cx="42" cy="20" r="2.2" fill="#e8c9c3" />
    </svg>
  );
}

/** Lightweight jaali-inspired lattice used as a decorative backdrop. */
export function JaaliPattern({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <pattern id="jaali" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M20 2 L38 20 L20 38 L2 20 Z" fill="none" stroke="#e9d9ad" strokeWidth="1.2" />
          <circle cx="20" cy="20" r="6" fill="none" stroke="#e9d9ad" strokeWidth="1.2" />
          <circle cx="0" cy="0" r="3" fill="#e9d9ad" />
          <circle cx="40" cy="0" r="3" fill="#e9d9ad" />
          <circle cx="0" cy="40" r="3" fill="#e9d9ad" />
          <circle cx="40" cy="40" r="3" fill="#e9d9ad" />
        </pattern>
      </defs>
      <circle cx="100" cy="100" r="98" fill="url(#jaali)" />
    </svg>
  );
}
