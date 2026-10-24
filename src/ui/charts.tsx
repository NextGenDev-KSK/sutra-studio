import { useRef, useState, type ReactNode } from 'react';

// Charts follow one rule set: single-hue magnitude bars, status colours only
// when they mean over/under budget, a solid hairline for reference values,
// visible values beside every bar (tooltips enhance, never gate).

interface TooltipState {
  x: number;
  y: number;
  title: string;
  rows: [string, string][];
}

function useTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TooltipState | null>(null);
  const show = (e: { clientX: number; clientY: number } | null, target: HTMLElement, title: string, rows: [string, string][]) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const t = target.getBoundingClientRect();
    const x = e ? e.clientX - box.left : t.left - box.left + t.width / 2;
    const y = (e ? e.clientY : t.top) - box.top;
    setTip({ x: Math.max(90, Math.min(box.width - 90, x)), y, title, rows });
  };
  const node = tip ? (
    <div className="viz-tooltip" style={{ left: tip.x, top: tip.y }} role="presentation">
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{tip.title}</div>
      {tip.rows.map(([k, v]) => (
        <div className="tt-row" key={k}>
          <span>{k}</span>
          <span className="tt-value">{v}</span>
        </div>
      ))}
    </div>
  ) : null;
  return { ref, show, hide: () => setTip(null), node };
}

export interface BulletRow {
  key: string;
  label: string;
  value: number;
  marker?: number;
  tone?: 'warn' | 'danger';
  display: string;
  tooltip: [string, string][];
}

/** Horizontal bars (forecast) with an optional reference marker (planned). */
export function BulletChart({
  rows,
  legend,
  ariaLabel,
}: {
  rows: BulletRow[];
  legend?: { bar: string; marker?: string };
  ariaLabel: string;
}) {
  const tt = useTooltip();
  const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.marker ?? 0))) * 1.04;
  return (
    <div className="viz" ref={tt.ref} role="img" aria-label={ariaLabel}>
      {legend && (
        <div className="viz-legend" aria-hidden="true">
          <span className="viz-key">
            <span className="viz-swatch" style={{ background: 'var(--viz-1)' }} />
            {legend.bar}
          </span>
          {legend.marker && (
            <span className="viz-key">
              <span className="viz-tick" />
              {legend.marker}
            </span>
          )}
          <span className="viz-key">
            <span className="viz-swatch" style={{ background: '#b7791f' }} />
            Over allocation
          </span>
        </div>
      )}
      {rows.map((r) => (
        <div
          className="bullet-row"
          key={r.key}
          tabIndex={0}
          onPointerMove={(e) => tt.show(e, e.currentTarget, r.label, r.tooltip)}
          onPointerLeave={tt.hide}
          onFocus={(e) => tt.show(null, e.currentTarget.querySelector('.bullet-track') as HTMLElement, r.label, r.tooltip)}
          onBlur={tt.hide}
        >
          <span className="bullet-label" title={r.label}>
            {r.label}
          </span>
          <span className="bullet-track">
            {[0.25, 0.5, 0.75].map((g) => (
              <span key={g} className="grid-line" style={{ left: `${g * 100}%` }} />
            ))}
            <span className={`bar${r.tone ? ` ${r.tone}` : ''}`} style={{ width: `${Math.max(0.5, (r.value / max) * 100)}%` }} />
            {r.marker !== undefined && r.marker > 0 && <span className="mark" style={{ left: `calc(${(r.marker / max) * 100}% - 1px)` }} />}
          </span>
          <span className="bullet-value">{r.display}</span>
        </div>
      ))}
      {tt.node}
    </div>
  );
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  display: string;
}

/** Part-to-whole bar with a 2px surface gap between segments and a labelled legend. */
export function StackBar({ segments, ariaLabel }: { segments: Segment[]; ariaLabel: string }) {
  const tt = useTooltip();
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div className="viz" ref={tt.ref}>
      <div className="stackbar" role="img" aria-label={ariaLabel}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span
              key={s.key}
              style={{ flex: s.value, background: s.color }}
              onPointerMove={(e) =>
                tt.show(e, e.currentTarget, s.label, [
                  ['Count', s.display],
                  ['Share', `${total ? Math.round((s.value / total) * 100) : 0}%`],
                ])
              }
              onPointerLeave={tt.hide}
            />
          ))}
      </div>
      <div className="stack-legend">
        {segments.map((s) => (
          <span className="viz-key" key={s.key}>
            <span className="viz-swatch" style={{ background: s.color }} />
            <span className="ink-2">{s.label}</span>
            <span className="strong num">{s.display}</span>
          </span>
        ))}
      </div>
      {tt.node}
    </div>
  );
}

/** Scenario totals against the budget ceiling (solid hairline reference). */
export function ScenarioBars({
  rows,
  ceiling,
  format,
}: {
  rows: { key: string; label: string; total: number; active: boolean }[];
  ceiling: number;
  format: (n: number) => string;
}) {
  const tt = useTooltip();
  const max = Math.max(ceiling, ...rows.map((r) => r.total)) * 1.08;
  const cx = (ceiling / max) * 100;
  return (
    <div className="viz" ref={tt.ref} role="img" aria-label={`Scenario totals compared with the ${format(ceiling)} ceiling`}>
      <div className="scenario-bars">
        {rows.map((r) => (
          <div
            className="scenario-bar-row"
            key={r.key}
            tabIndex={0}
            onPointerMove={(e) =>
              tt.show(e, e.currentTarget, r.label, [
                ['Total', format(r.total)],
                ['vs ceiling', `${r.total > ceiling ? '+' : '−'}${format(Math.abs(r.total - ceiling))}`],
              ])
            }
            onPointerLeave={tt.hide}
            onFocus={(e) => tt.show(null, e.currentTarget, r.label, [['Total', format(r.total)]])}
            onBlur={tt.hide}
          >
            <span className={r.active ? 'strong' : 'ink-2'}>{r.label}</span>
            <span className="scenario-track">
              <span className={`bar${r.active ? ' active' : ''}`} style={{ width: `${(r.total / max) * 100}%` }} />
              <span className="ceiling" style={{ left: `${cx}%` }} />
            </span>
            <span className="num" style={{ textAlign: 'right' }}>
              {format(r.total)}
            </span>
          </div>
        ))}
      </div>
      <div className="scenario-bar-row" aria-hidden="true" style={{ marginTop: 2 }}>
        <span />
        <span style={{ position: 'relative', height: 14 }}>
          <span
            className="ceiling-label"
            style={{ position: 'absolute', left: `${cx}%`, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
          >
            Ceiling {format(ceiling)}
          </span>
        </span>
        <span />
      </div>
      {tt.node}
    </div>
  );
}

export function Dots({ value, max = 5, label }: { value: number; max?: number; label: string }): ReactNode {
  return (
    <span className="dots" role="img" aria-label={`${label}: ${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < value ? 'on' : ''} />
      ))}
    </span>
  );
}
