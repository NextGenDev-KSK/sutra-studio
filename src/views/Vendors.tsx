import { useMemo, useState } from 'react';
import { Copy, FlaskConical, GitCompare, Mail, Plus, Search, Star, Trash2, CheckCircle2, Sparkles } from 'lucide-react';
import { ACTIVE_QUOTE_STATUSES, BOOKED_STATUSES, quoteTotal } from '../domain/budget';
import { CATEGORY_META, VENDOR_STATUS_LABEL, VENDOR_STATUS_ORDER, categoryMeta, eventTypeLabel } from '../domain/catalog';
import { makeProposal, type PlanOp } from '../domain/ops';
import type { Availability, CostBasis, EventPlan, Vendor, VendorStatus, VerificationLevel } from '../domain/types';
import { formatDate, formatMoney, formatMoneyCompact, isValidISODate, plural, uid } from '../domain/util';
import { copyText } from '../lib/download';
import { useWorkspace } from '../store/workspace';
import { Drawer, Field, Modal, Notice, confirmDialog, toast } from '../ui/kit';
import { VendorStatusBadge, VerificationBadge, useToday, useUI } from './common';
import { ProposalPreview } from './ProposalPreview';

const AVAIL_LABEL: Record<Availability, string> = {
  unknown: 'Not asked',
  requested: 'Requested',
  confirmed: 'Confirmed for date',
  unavailable: 'Unavailable',
};

export function VendorHub({ plan }: { plan: EventPlan }) {
  const [cat, setCat] = useState<string>('all');
  const [status, setStatus] = useState<VendorStatus | 'active' | 'all'>('active');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [comparing, setComparing] = useState(false);
  const [statusChange, setStatusChange] = useState<{ vendor: Vendor; status: VendorStatus } | null>(null);
  const [requesting, setRequesting] = useState<Vendor | null>(null);
  const setPreferred = useWorkspace((s) => s.setPreferred);
  const openCopilot = useUI((s) => s.openCopilot);
  const guests = plan.brief.guestCount;
  const cur = plan.brief.currency;

  const cats = useMemo(() => {
    const keys = new Set([...plan.budget.categories.map((c) => c.key), ...plan.vendors.map((v) => v.category)]);
    return [...keys].map((k) => ({
      key: k,
      label: categoryMeta(k)?.vendorLabel ?? plan.budget.categories.find((c) => c.key === k)?.label ?? k,
      count: plan.vendors.filter((v) => v.category === k).length,
    }));
  }, [plan]);

  const list = plan.vendors.filter((v) => {
    if (cat !== 'all' && v.category !== cat) return false;
    if (status === 'active' && v.status === 'rejected') return false;
    if (status !== 'active' && status !== 'all' && v.status !== status) return false;
    if (q.trim() && !`${v.name} ${v.description} ${v.location}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });
  const grouped = cats.map((c) => ({ ...c, vendors: list.filter((v) => v.category === c.key) })).filter((g) => g.vendors.length);
  const illustrative = plan.vendors.filter((v) => v.verification.level === 'illustrative').length;

  const blank = (): Vendor => ({
    id: uid('v'),
    name: '',
    category: cat !== 'all' ? cat : (plan.budget.categories[0]?.key ?? 'venue'),
    location: plan.brief.city,
    serviceArea: '',
    contactName: '',
    phone: '',
    email: '',
    website: '',
    description: '',
    quote: null,
    availability: 'unknown',
    status: 'identified',
    preferred: false,
    pros: [],
    cons: [],
    notes: '',
    nextAction: 'Request a quotation',
    verification: { level: 'unverified' },
    createdAt: new Date().toISOString(),
  });

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 26 }}>Vendor Hub</h2>
          <p>
            Track every vendor from first contact to booking. Quotations recalculate at the current guest count ({guests}) and flow straight
            into the Budget Lab forecast.
          </p>
        </div>
        <div className="row-wrap">
          <button className="btn btn-gold" onClick={() => openCopilot('Compare two vendor quotations.')}>
            <Sparkles /> Compare with co-pilot
          </button>
          <button className="btn btn-primary" onClick={() => setEditing(blank())}>
            <Plus /> Add vendor
          </button>
        </div>
      </div>

      <Notice tone="info" icon={<FlaskConical />}>
        <strong>No live marketplace is connected.</strong>{' '}
        {illustrative
          ? `${plural(illustrative, 'vendor')} in this event ${illustrative > 1 ? 'are' : 'is an'} illustrative demo record${illustrative > 1 ? 's' : ''} — fictional businesses with no contact details, ratings or verified prices. `
          : ''}
        Vendors you add are marked “not verified” until you record a source URL and the date you checked it.
      </Notice>

      <div className="row-wrap" role="group" aria-label="Filter by category">
        <button className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
          All <span className="chip-count">{plan.vendors.length}</span>
        </button>
        {cats.map((c) => (
          <button key={c.key} className="chip" aria-pressed={cat === c.key} onClick={() => setCat(c.key)}>
            {c.label} <span className="chip-count">{c.count}</span>
          </button>
        ))}
      </div>
      <div className="row-between">
        <div className="row-wrap">
          <div className="input-affix" style={{ width: 260 }}>
            <span className="affix">
              <Search style={{ width: 14, height: 14 }} />
            </span>
            <input
              className="input input-sm"
              placeholder="Search vendors"
              aria-label="Search vendors"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <label className="sr-only" htmlFor="v-status">
            Status
          </label>
          <select
            id="v-status"
            className="select input-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            style={{ width: 170 }}
          >
            <option value="active">Active (hide rejected)</option>
            <option value="all">All statuses</option>
            {VENDOR_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {VENDOR_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="row-wrap">
          <span className="small muted">{selected.length ? `${selected.length} selected` : 'Tick two or three vendors to compare'}</span>
          <button className="btn btn-sm" disabled={selected.length < 2} onClick={() => setComparing(true)}>
            <GitCompare /> Compare
          </button>
          {selected.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected([])}>
              Clear
            </button>
          )}
        </div>
      </div>

      {grouped.length === 0 && (
        <div className="card card-pad muted" style={{ textAlign: 'center' }}>
          No vendors match.{' '}
          <button className="link-btn" onClick={() => setEditing(blank())}>
            Add a vendor
          </button>
        </div>
      )}
      {grouped.map((g) => {
        const line = plan.budget.categories.find((c) => c.key === g.key);
        return (
          <section className="card" key={g.key} aria-label={g.label}>
            <div className="card-head">
              <div>
                <h3>{g.label}</h3>
                <div className="sub">
                  {plan.vendors.some((v) => v.category === g.key && BOOKED_STATUSES.has(v.status)) ? 'Booked' : 'Not booked yet'}
                  {line &&
                    ` · planned ${formatMoneyCompact(line.basis === 'perGuest' ? line.planned * guests * line.units : line.planned, cur)}`}
                </div>
              </div>
            </div>
            {g.vendors.map((v) => {
              const total = v.quote ? quoteTotal(v.quote, guests) : null;
              const checked = selected.includes(v.id);
              return (
                <div className="vendor-card" key={v.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={`Select ${v.name} to compare`}
                    onChange={() => setSelected((s) => (checked ? s.filter((x) => x !== v.id) : s.length >= 3 ? s : [...s, v.id]))}
                    style={{ marginTop: 4, width: 16, height: 16, accentColor: 'var(--forest)' }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <button className="vendor-name" onClick={() => setEditing(v)}>
                      {v.name}
                    </button>
                    {v.preferred && (
                      <span className="badge badge-gold" style={{ marginLeft: 8 }}>
                        <Star /> Preferred quote
                      </span>
                    )}
                    <div className="vendor-meta">
                      <VendorStatusBadge status={v.status} />
                      <VerificationBadge vendor={v} />
                      <span className="badge badge-outline">Availability: {AVAIL_LABEL[v.availability]}</span>
                    </div>
                    <div className="small ink-2" style={{ marginTop: 6 }}>
                      {v.quote?.deliverables || v.description || 'No details yet.'}
                    </div>
                    {v.nextAction && (
                      <div className="small" style={{ marginTop: 4 }}>
                        <span className="muted">Next:</span> {v.nextAction}
                      </div>
                    )}
                    <div className="row-wrap" style={{ marginTop: 8 }}>
                      {!BOOKED_STATUSES.has(v.status) && v.status !== 'rejected' && v.status !== 'cancelled' && (
                        <button
                          className="btn btn-xs btn-primary"
                          disabled={!v.quote}
                          title={v.quote ? undefined : 'Add a quotation before booking'}
                          onClick={() => setStatusChange({ vendor: v, status: 'booked' })}
                        >
                          <CheckCircle2 /> Mark booked
                        </button>
                      )}
                      {(v.status === 'identified' || v.status === 'contacted') && (
                        <button className="btn btn-xs" onClick={() => setRequesting(v)}>
                          <Mail /> Draft quote request
                        </button>
                      )}
                      {ACTIVE_QUOTE_STATUSES.has(v.status) && v.quote && (
                        <button
                          className="btn btn-xs"
                          onClick={() => {
                            setPreferred(v.id);
                            toast(
                              v.preferred
                                ? `${v.name} is no longer preferred.`
                                : `${v.name} is now the preferred quote — forecast updated.`,
                            );
                          }}
                        >
                          <Star /> {v.preferred ? 'Unprefer' : 'Prefer quote'}
                        </button>
                      )}
                      {BOOKED_STATUSES.has(v.status) && (
                        <button className="btn btn-xs btn-danger" onClick={() => setStatusChange({ vendor: v, status: 'cancelled' })}>
                          Record cancellation
                        </button>
                      )}
                      <label className="sr-only" htmlFor={`st-${v.id}`}>
                        Change status of {v.name}
                      </label>
                      <select
                        id={`st-${v.id}`}
                        className="select input-sm"
                        value={v.status}
                        style={{ width: 150, minHeight: 26, fontSize: 12 }}
                        onChange={(e) => {
                          const next = e.target.value as VendorStatus;
                          if (next !== v.status) setStatusChange({ vendor: v, status: next });
                        }}
                      >
                        {VENDOR_STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {VENDOR_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="vendor-price">
                    <div className="p">{total === null ? <span className="muted">No quote</span> : formatMoneyCompact(total, cur)}</div>
                    {v.quote && (
                      <div className="tiny muted">
                        {v.quote.basis === 'perGuest' ? `${formatMoney(v.quote.amount, cur)}/guest × ${v.quote.units}` : 'fixed'}
                      </div>
                    )}
                    {v.verification.level === 'illustrative' && v.quote && <div className="tiny muted">demo quotation</div>}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      {editing && <VendorEditor plan={plan} vendor={editing} onClose={() => setEditing(null)} />}
      {comparing && <CompareModal plan={plan} ids={selected} onClose={() => setComparing(false)} />}
      {statusChange && (
        <StatusChangeModal plan={plan} vendor={statusChange.vendor} status={statusChange.status} onClose={() => setStatusChange(null)} />
      )}
      {requesting && <QuoteRequestModal plan={plan} vendor={requesting} onClose={() => setRequesting(null)} />}
    </div>
  );
}

function StatusChangeModal({
  plan,
  vendor,
  status,
  onClose,
}: {
  plan: EventPlan;
  vendor: Vendor;
  status: VendorStatus;
  onClose: () => void;
}) {
  const applyProposal = useWorkspace((s) => s.applyProposal);
  const undoLast = useWorkspace((s) => s.undoLast);
  const scheduled = plan.budget.payments.filter((p) => p.vendorId === vendor.id && p.status === 'scheduled').length;
  const [cancelPayments, setCancelPayments] = useState(true);
  const ops: PlanOp[] = useMemo(() => {
    const o: PlanOp[] = [{ op: 'setVendorStatus', vendorId: vendor.id, status }];
    if ((status === 'cancelled' || status === 'rejected') && scheduled && cancelPayments)
      o.push({ op: 'cancelVendorPayments', vendorId: vendor.id });
    return o;
  }, [vendor.id, status, scheduled, cancelPayments]);
  if (status === vendor.status) return null;
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`${vendor.name}: ${VENDOR_STATUS_LABEL[vendor.status]} → ${VENDOR_STATUS_LABEL[status]}`}
      subtitle="Review what this changes across the budget, timeline and run of show. Sutrā does not contact the vendor."
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${status === 'cancelled' ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={() => {
              applyProposal(
                makeProposal({
                  title: `${vendor.name} → ${VENDOR_STATUS_LABEL[status]}`,
                  summary: '',
                  reason: 'Planner changed vendor status.',
                  ops,
                  tradeoffs: [],
                  assumptions: [],
                }),
                ops,
                'planner',
                'vendors',
              );
              toast(`${vendor.name} is now ${VENDOR_STATUS_LABEL[status].toLowerCase()}.`, 'success', {
                label: 'Undo',
                onClick: () => undoLast(),
              });
              onClose();
            }}
          >
            Confirm change
          </button>
        </>
      }
    >
      {status === 'booked' && !vendor.quote && (
        <Notice tone="warn">This vendor has no quotation — committed spend will be zero until you add one.</Notice>
      )}
      {(status === 'cancelled' || status === 'rejected') && scheduled > 0 && (
        <label className="check" style={{ marginBottom: 10 }}>
          <input type="checkbox" checked={cancelPayments} onChange={(e) => setCancelPayments(e.target.checked)} /> Also cancel{' '}
          {plural(scheduled, 'scheduled payment')} (paid amounts stay recorded)
        </label>
      )}
      <ProposalPreview plan={plan} ops={ops} />
    </Modal>
  );
}

function QuoteRequestModal({ plan, vendor, onClose }: { plan: EventPlan; vendor: Vendor; onClose: () => void }) {
  const upsert = useWorkspace((s) => s.upsertVendor);
  const label = categoryMeta(vendor.category)?.label.toLowerCase() ?? vendor.category;
  const sessions = plan.brief.sessions.map((s) => `• ${s.name} — Day ${s.dayIndex + 1}, ${s.start}–${s.end} (${s.area})`).join('\n');
  const text = `Hello${vendor.contactName ? ` ${vendor.contactName}` : ''},

We're planning a ${eventTypeLabel(plan.brief.type, plan.brief.customTypeLabel).toLowerCase()} in ${plan.brief.city || 'our city'} on ${formatDate(plan.brief.eventDate, { weekday: true })}${plan.brief.durationDays > 1 ? ` (${plan.brief.durationDays} days)` : ''} for about ${plan.brief.guestCount} guests, and would love a quotation for ${label}.

Sessions:
${sessions}

Style: ${plan.brief.style || 'to be discussed'}.${plan.brief.accessibility.length ? `\nAccessibility: ${plan.brief.accessibility.join(', ')}.` : ''}

Could you share availability for the date, an itemised quotation (inclusive of taxes), what is included, payment terms and the validity of the quote?

Thank you,
${plan.brief.plannerName || 'The planning team'}`;
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`Quotation request — ${vendor.name}`}
      subtitle="Sutrā doesn’t send messages. Copy this into your email or messaging app, then mark the vendor as contacted."
      footer={
        <>
          <button
            className="btn"
            onClick={async () => toast((await copyText(text)) ? 'Copied to clipboard.' : 'Copy failed — select the text manually.', 'info')}
          >
            <Copy /> Copy text
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              upsert({
                ...vendor,
                status: vendor.status === 'identified' ? 'contacted' : vendor.status,
                availability: 'requested',
                nextAction: 'Await quotation',
              });
              toast(`${vendor.name} marked as contacted.`);
              onClose();
            }}
          >
            Mark as contacted
          </button>
        </>
      }
    >
      <textarea className="textarea" readOnly value={text} rows={16} aria-label="Quotation request text" />
    </Modal>
  );
}

function CompareModal({ plan, ids, onClose }: { plan: EventPlan; ids: string[]; onClose: () => void }) {
  const vendors = ids.map((id) => plan.vendors.find((v) => v.id === id)).filter((v): v is Vendor => !!v);
  const setPreferred = useWorkspace((s) => s.setPreferred);
  const guests = plan.brief.guestCount;
  const cur = plan.brief.currency;
  const totals = vendors.map((v) => (v.quote ? quoteTotal(v.quote, guests) : null));
  const valid = totals.filter((t): t is number => t !== null);
  const min = valid.length ? Math.min(...valid) : null;
  const rows: [string, (v: Vendor, i: number) => React.ReactNode][] = [
    ['Category', (v) => categoryMeta(v.category)?.label ?? v.category],
    ['Status', (v) => <VendorStatusBadge status={v.status} />],
    [
      'Quote total',
      (_v, i) =>
        totals[i] === null ? (
          <span className="muted">No quote</span>
        ) : (
          <span className="strong num">
            {formatMoney(totals[i]!, cur)}
            {totals[i] === min && valid.length > 1 && (
              <span className="badge badge-ok" style={{ marginLeft: 6 }}>
                Lowest
              </span>
            )}
          </span>
        ),
    ],
    ['Per guest', (_v, i) => (totals[i] === null ? '—' : formatMoney(totals[i]! / Math.max(1, guests), cur))],
    [
      'Difference',
      (_v, i) => (totals[i] === null || min === null ? '—' : totals[i] === min ? '—' : `+${formatMoneyCompact(totals[i]! - min, cur)}`),
    ],
    [
      'Basis',
      (v) =>
        v.quote ? (v.quote.basis === 'perGuest' ? `${formatMoney(v.quote.amount, cur)} per guest × ${v.quote.units}` : 'Fixed') : '—',
    ],
    ['Included', (v) => v.quote?.deliverables || '—'],
    [
      'Advantages',
      (v) =>
        v.pros.length ? (
          <ul className="bullets">
            {v.pros.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          '—'
        ),
    ],
    [
      'Watch-outs',
      (v) =>
        v.cons.length ? (
          <ul className="bullets">
            {v.cons.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          '—'
        ),
    ],
    ['Availability', (v) => AVAIL_LABEL[v.availability]],
    ['Verification', (v) => <VerificationBadge vendor={v} long />],
  ];
  const mixed = new Set(vendors.map((v) => v.category)).size > 1;
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Compare vendors"
      subtitle={`Quotations recalculated at ${guests} guests. Confirm inclusions, taxes and availability in writing before deciding.`}
      footer={
        <button className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      {mixed && (
        <div style={{ marginBottom: 10 }}>
          <Notice tone="warn">These vendors are in different categories, so totals aren’t like-for-like.</Notice>
        </div>
      )}
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
        <table className="table compare-table">
          <thead>
            <tr>
              <th />
              {vendors.map((v) => (
                <th key={v.id} style={{ whiteSpace: 'normal' }}>
                  {v.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, render]) => (
              <tr key={label}>
                <td className="strong small">{label}</td>
                {vendors.map((v, i) => (
                  <td key={v.id} className="small">
                    {render(v, i)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td />
              {vendors.map((v) => (
                <td key={v.id}>
                  {ACTIVE_QUOTE_STATUSES.has(v.status) && v.quote && !v.preferred ? (
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        setPreferred(v.id);
                        toast(`${v.name} set as preferred — forecast updated.`);
                      }}
                    >
                      <Star /> Prefer this quote
                    </button>
                  ) : v.preferred ? (
                    <span className="badge badge-gold">
                      <Star /> Preferred
                    </span>
                  ) : null}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function VendorEditor({ plan, vendor, onClose }: { plan: EventPlan; vendor: Vendor; onClose: () => void }) {
  const isNew = !plan.vendors.some((v) => v.id === vendor.id);
  const [d, setD] = useState<Vendor>(structuredClone(vendor));
  const [hasQuote, setHasQuote] = useState(!!vendor.quote);
  const [error, setError] = useState('');
  const upsert = useWorkspace((s) => s.upsertVendor);
  const remove = useWorkspace((s) => s.removeVendor);
  const today = useToday();
  const set = <K extends keyof Vendor>(k: K, v: Vendor[K]) => setD((x) => ({ ...x, [k]: v }));
  const quote = d.quote ?? { basis: 'fixed' as CostBasis, amount: 0, units: 1, deliverables: '', receivedOn: today };
  const setQuote = (patch: Partial<typeof quote>) => setD((x) => ({ ...x, quote: { ...quote, ...patch } }));
  const isDemo = vendor.verification.level === 'illustrative';
  const total = hasQuote ? quoteTotal(quote, plan.brief.guestCount) : 0;

  const save = () => {
    if (d.name.trim().length < 2) return setError('Vendor name is required.');
    if (hasQuote && !(quote.amount > 0)) return setError('Quotation amount must be greater than zero (or untick “Quotation received”).');
    if (hasQuote && quote.basis === 'perGuest' && !(quote.units > 0)) return setError('Units per guest must be at least 1.');
    if (d.verification.level === 'verified') {
      if (!/^https?:\/\/\S+\.\S+/.test(d.verification.sourceUrl ?? '')) return setError('Verified vendors need a source URL (http/https).');
      if (!isValidISODate(d.verification.checkedOn ?? '') || (d.verification.checkedOn ?? '') > today)
        return setError('Record the date you checked the source (today or earlier).');
    }
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return setError('Email address looks invalid.');
    if (d.website && !/^https?:\/\//.test(d.website)) return setError('Website should start with http:// or https://');
    const next: Vendor = {
      ...d,
      name: d.name.trim(),
      quote: hasQuote ? quote : null,
      status: hasQuote && (d.status === 'identified' || d.status === 'contacted') ? 'quoted' : d.status,
    };
    if (!plan.budget.categories.some((c) => c.key === next.category))
      toast(
        `“${categoryMeta(next.category)?.label ?? next.category}” has no allocation yet — it appears in the Budget Lab as an unallocated line so this vendor’s costs are still counted.`,
        'info',
      );
    upsert(next);
    toast(isNew ? 'Vendor added.' : 'Vendor saved — budget recalculated.');
    onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      wide
      title={isNew ? 'Add vendor' : d.name}
      subtitle={
        isDemo
          ? 'Illustrative demo vendor — fictional, not verified.'
          : 'Only record details you have confirmed with the vendor or a reliable source.'
      }
      footer={
        <>
          {!isNew && (
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: `Remove ${vendor.name}?`,
                    body: 'Payments to this vendor stay recorded. You can undo this.',
                    confirmLabel: 'Remove',
                    danger: true,
                  })
                ) {
                  remove(vendor.id);
                  onClose();
                }
              }}
            >
              <Trash2 /> Remove
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save vendor
          </button>
        </>
      }
    >
      <div className="stack-lg">
        {!isNew && (
          <div className="row-wrap">
            <VendorStatusBadge status={d.status} />
            <VerificationBadge vendor={d} long />
          </div>
        )}
        <div className="form-grid">
          <Field label="Vendor name" htmlFor="vn" className="span-2">
            <input id="vn" className="input" value={d.name} onChange={(e) => set('name', e.target.value)} data-autofocus />
          </Field>
          <Field label="Category" htmlFor="vc">
            <select id="vc" className="select" value={d.category} onChange={(e) => set('category', e.target.value)}>
              {[...new Set([...plan.budget.categories.map((c) => c.key), ...CATEGORY_META.map((c) => c.key)])].map((k) => (
                <option key={k} value={k}>
                  {categoryMeta(k)?.vendorLabel ?? plan.budget.categories.find((c) => c.key === k)?.label ?? k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="vs">
            <select
              id="vs"
              className="select"
              value={d.status}
              onChange={(e) => set('status', e.target.value as VendorStatus)}
              disabled={!isNew}
              title={isNew ? undefined : 'Use the status control on the vendor card to review consequences'}
            >
              {VENDOR_STATUS_ORDER.filter((s) => (isNew ? !BOOKED_STATUSES.has(s) && s !== 'cancelled' : true)).map((s) => (
                <option key={s} value={s}>
                  {VENDOR_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location" htmlFor="vl">
            <input id="vl" className="input" value={d.location} onChange={(e) => set('location', e.target.value)} />
          </Field>
          <Field label="Service area" htmlFor="va">
            <input id="va" className="input" value={d.serviceArea} onChange={(e) => set('serviceArea', e.target.value)} />
          </Field>
          <Field label="Contact name" htmlFor="vcn">
            <input
              id="vcn"
              className="input"
              value={d.contactName}
              onChange={(e) => set('contactName', e.target.value)}
              disabled={isDemo}
            />
          </Field>
          <Field label="Phone" htmlFor="vp">
            <input
              id="vp"
              className="input"
              value={d.phone}
              onChange={(e) => set('phone', e.target.value)}
              disabled={isDemo}
              placeholder={isDemo ? 'None — fictional business' : ''}
            />
          </Field>
          <Field label="Email" htmlFor="ve">
            <input
              id="ve"
              className="input"
              type="email"
              value={d.email}
              onChange={(e) => set('email', e.target.value)}
              disabled={isDemo}
            />
          </Field>
          <Field label="Website" htmlFor="vw">
            <input
              id="vw"
              className="input"
              value={d.website}
              onChange={(e) => set('website', e.target.value)}
              disabled={isDemo}
              placeholder="https://"
            />
          </Field>
          <Field label="Availability for the date" htmlFor="vav">
            <select
              id="vav"
              className="select"
              value={d.availability}
              onChange={(e) => set('availability', e.target.value as Availability)}
            >
              {Object.entries(AVAIL_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Next action" htmlFor="vna">
            <input id="vna" className="input" value={d.nextAction} onChange={(e) => set('nextAction', e.target.value)} />
          </Field>
          <Field label="Service description" htmlFor="vd" className="span-2">
            <textarea id="vd" className="textarea" value={d.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </div>

        <div className="card card-pad">
          <label className="check">
            <input type="checkbox" checked={hasQuote} onChange={(e) => setHasQuote(e.target.checked)} /> <strong>Quotation received</strong>
          </label>
          {hasQuote && (
            <div className="form-grid" style={{ marginTop: 12 }}>
              <Field label="Pricing basis" htmlFor="qb">
                <select id="qb" className="select" value={quote.basis} onChange={(e) => setQuote({ basis: e.target.value as CostBasis })}>
                  <option value="fixed">Fixed total</option>
                  <option value="perGuest">Per guest</option>
                </select>
              </Field>
              <Field
                label={quote.basis === 'perGuest' ? `Rate per guest (${plan.brief.currency})` : `Total (${plan.brief.currency})`}
                htmlFor="qa"
                hint={`= ${formatMoney(total, plan.brief.currency)} at ${plan.brief.guestCount} guests`}
              >
                <input
                  id="qa"
                  className="input input-num"
                  type="number"
                  min={0}
                  value={quote.amount}
                  onChange={(e) => setQuote({ amount: Number(e.target.value) })}
                />
              </Field>
              {quote.basis === 'perGuest' && (
                <Field label="Units per guest (e.g. meal services)" htmlFor="qu">
                  <input
                    id="qu"
                    className="input input-num"
                    type="number"
                    min={1}
                    value={quote.units}
                    onChange={(e) => setQuote({ units: Number(e.target.value) })}
                  />
                </Field>
              )}
              <Field label="Received on" htmlFor="qr">
                <input
                  id="qr"
                  type="date"
                  className="input"
                  value={quote.receivedOn ?? ''}
                  onChange={(e) => setQuote({ receivedOn: e.target.value || undefined })}
                />
              </Field>
              <Field label="Valid until" htmlFor="qv">
                <input
                  id="qv"
                  type="date"
                  className="input"
                  value={quote.validUntil ?? ''}
                  onChange={(e) => setQuote({ validUntil: e.target.value || undefined })}
                />
              </Field>
              <Field label="Included deliverables" htmlFor="qd" className="span-2">
                <textarea
                  id="qd"
                  className="textarea"
                  value={quote.deliverables}
                  onChange={(e) => setQuote({ deliverables: e.target.value })}
                />
              </Field>
              <label className="check span-2">
                <input type="checkbox" checked={d.preferred} onChange={(e) => set('preferred', e.target.checked)} /> Preferred quotation —
                use it as the category forecast until someone is booked
              </label>
            </div>
          )}
        </div>

        <div className="form-grid">
          <Field label="Advantages (one per line)" htmlFor="vpro">
            <textarea
              id="vpro"
              className="textarea"
              value={d.pros.join('\n')}
              onChange={(e) =>
                set(
                  'pros',
                  e.target.value
                    .split('\n')
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
            />
          </Field>
          <Field label="Watch-outs (one per line)" htmlFor="vcon">
            <textarea
              id="vcon"
              className="textarea"
              value={d.cons.join('\n')}
              onChange={(e) =>
                set(
                  'cons',
                  e.target.value
                    .split('\n')
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
            />
          </Field>
          <Field label="Notes" htmlFor="vnotes" className="span-2">
            <textarea id="vnotes" className="textarea" value={d.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>

        <div className="card card-pad">
          <h3 style={{ marginBottom: 8 }}>Verification</h3>
          {isDemo ? (
            <Notice tone="info">
              This is a fictional demo business, so it can’t be verified. Add a real vendor to record verified details.
            </Notice>
          ) : (
            <div className="form-grid">
              <Field label="Level" htmlFor="vvl">
                <select
                  id="vvl"
                  className="select"
                  value={d.verification.level}
                  onChange={(e) => set('verification', { ...d.verification, level: e.target.value as VerificationLevel })}
                >
                  <option value="unverified">Not verified (vendor-claimed / planner-entered)</option>
                  <option value="verified">Verified against a source</option>
                </select>
              </Field>
              {d.verification.level === 'verified' && (
                <>
                  <Field label="Source URL" htmlFor="vsu">
                    <input
                      id="vsu"
                      className="input"
                      value={d.verification.sourceUrl ?? ''}
                      onChange={(e) => set('verification', { ...d.verification, sourceUrl: e.target.value })}
                      placeholder="https://"
                    />
                  </Field>
                  <Field label="Checked on" htmlFor="vco">
                    <input
                      id="vco"
                      type="date"
                      className="input"
                      max={today}
                      value={d.verification.checkedOn ?? ''}
                      onChange={(e) => set('verification', { ...d.verification, checkedOn: e.target.value })}
                    />
                  </Field>
                  <Field label="What was verified" htmlFor="vvn">
                    <input
                      id="vvn"
                      className="input"
                      value={d.verification.note ?? ''}
                      onChange={(e) => set('verification', { ...d.verification, note: e.target.value })}
                      placeholder="e.g. business registration and address"
                    />
                  </Field>
                </>
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="field-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </Drawer>
  );
}
