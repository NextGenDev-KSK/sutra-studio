import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { ACCESSIBILITY_OPTIONS, CATEGORY_META, EVENT_TYPES, SETTING_LABEL, VENUE_STATUS_LABEL, eventTypeProfile } from '../domain/catalog';
import { emptyIntake, validateIntake, type IntakeData, type IntakeErrors } from '../domain/generator';
import type { EventType, Setting, VenueStatus } from '../domain/types';
import { CURRENCIES, addDays, formatDate, formatMoneyCompact } from '../domain/util';
import { navigate } from '../lib/router';
import { useWorkspace } from '../store/workspace';
import { Field, Notice, toast } from '../ui/kit';
import { useToday } from './common';

const STEPS = ['Basics', 'Guests & budget', 'Style & setting', 'Needs & preferences', 'People & risks', 'Review'];
const STEP_FIELDS: (keyof IntakeData)[][] = [
  ['name', 'customTypeLabel', 'eventDate', 'durationDays', 'sessionCount'],
  ['guestCount', 'totalBudget', 'contingencyPct'],
  [],
  ['vegetarianPct', 'veganCount'],
  [],
  [],
];

export function Intake({ templateId }: { templateId?: string }) {
  const today = useToday();
  const [d, setD] = useState<IntakeData>(() => emptyIntake(today));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<IntakeErrors>({});
  const [color, setColor] = useState('#b08d57');
  const createEvent = useWorkspace((s) => s.createEvent);
  const set = <K extends keyof IntakeData>(k: K, v: IntakeData[K]) => setD((x) => ({ ...x, [k]: v }));
  const profile = eventTypeProfile(d.type);

  const check = (upTo: number) => {
    const all = validateIntake(d, today);
    const fields = STEP_FIELDS.slice(0, upTo + 1).flat();
    const relevant = Object.fromEntries(Object.entries(all).filter(([k]) => fields.includes(k as keyof IntakeData))) as IntakeErrors;
    setErrors(relevant);
    return { ok: Object.keys(relevant).length === 0, all };
  };
  const next = () => {
    if (check(step).ok) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const generate = () => {
    const all = validateIntake(d, today);
    setErrors(all);
    if (Object.keys(all).length) {
      const first = STEP_FIELDS.findIndex((f) => f.some((k) => all[k]));
      setStep(Math.max(0, first));
      toast('Some details need attention before the plan can be generated.', 'error');
      return;
    }
    const id = createEvent(d);
    toast(`Plan generated for “${d.name}”. Review the brief — every assumption is listed.`);
    navigate({ name: 'view', eventId: id, view: 'brief' });
  };
  const sample = () => {
    setD({
      ...emptyIntake(today),
      name: 'Ira turns 40 — Garden Soirée',
      type: 'birthday',
      city: 'Bengaluru',
      country: 'India',
      venueName: 'Rooftop garden (to confirm)',
      venueStatus: 'shortlisted',
      eventDate: addDays(today, 52),
      durationDays: 1,
      sessionCount: 2,
      sessionNames: 'Sunset cocktails, Dinner & dancing',
      guestCount: 85,
      totalBudget: 1_200_000,
      currency: 'INR',
      contingencyPct: 8,
      style: 'Modern garden party',
      colors: ['#F4EFE6', '#9AAA8F', '#C98F7E', '#33363A'],
      atmosphere: 'Relaxed and joyful, with great music and long-table dinner conversation.',
      dietarySpecified: true,
      vegetarianPct: 60,
      veganCount: 4,
      jainCount: 0,
      allergens: 'Peanuts',
      accessibility: ['Step-free access', 'Seating priority for elderly guests'],
      setting: 'outdoor',
      weatherConcerns: 'Possible evening showers; need a covered fallback.',
      plannerName: 'You',
      clientName: 'Ira (fictional sample client)',
      team: [{ name: 'Sam', role: 'Production coordinator' }],
      protectedCategories: ['entertainment'],
      nonNegotiables: 'Live band for the second half',
      knownRisks: 'Rooftop capacity not yet confirmed',
    });
    setErrors({});
    toast('Sample brief filled in — review each step or jump to Review.', 'info');
  };

  const err = (k: keyof IntakeData) => errors[k];

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 26 }}>Create an event</h2>
          <p>
            Answer what you know — anything missing becomes an explicit, editable assumption. Sutrā never infers culture, religion,
            ceremonies or diet from names or places.
          </p>
        </div>
        <button className="btn" onClick={sample}>
          <Wand2 /> Fill a sample brief
        </button>
      </div>
      {templateId && <Notice>To start from a saved template, use Exports & Reports → Reusable templates.</Notice>}

      <div className="intake">
        <nav className="intake-steps" aria-label="Intake steps">
          {STEPS.map((s, i) => (
            <button
              key={s}
              className={`intake-step${i < step ? ' done' : ''}`}
              aria-current={i === step ? 'step' : undefined}
              onClick={() => (i <= step || check(i - 1).ok) && setStep(i)}
            >
              <span className="n">{i < step ? <Check style={{ width: 13, height: 13 }} /> : i + 1}</span>
              {s}
            </button>
          ))}
        </nav>

        <section className="card">
          <div className="card-head">
            <h3>{STEPS[step]}</h3>
            <span className="small muted">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <div className="card-body">
            {step === 0 && (
              <div className="form-grid">
                <Field label="Event name" htmlFor="i-name" error={err('name')} className="span-2">
                  <input
                    id="i-name"
                    className="input"
                    value={d.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="e.g. Meera & Arjun’s wedding"
                    data-autofocus
                    aria-invalid={!!err('name')}
                  />
                </Field>
                <div className="span-2">
                  <div className="field-label" style={{ marginBottom: 6 }}>
                    Event type
                  </div>
                  <div className="choice-grid" role="group" aria-label="Event type">
                    {EVENT_TYPES.map((t) => (
                      <button
                        key={t.type}
                        type="button"
                        className="choice"
                        aria-pressed={d.type === t.type}
                        onClick={() =>
                          setD((x) => ({
                            ...x,
                            type: t.type as EventType,
                            guestCount:
                              x.guestCount === eventTypeProfile(x.type).defaultGuests || x.guestCount === 150
                                ? t.defaultGuests
                                : x.guestCount,
                          }))
                        }
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                {d.type === 'custom' && (
                  <Field label="Describe the event type" htmlFor="i-ctype" error={err('customTypeLabel')} className="span-2">
                    <input
                      id="i-ctype"
                      className="input"
                      value={d.customTypeLabel}
                      onChange={(e) => set('customTypeLabel', e.target.value)}
                      placeholder="e.g. Product launch dinner"
                    />
                  </Field>
                )}
                <Field label="City" htmlFor="i-city" hint="Used for cost benchmarks and seasonal guidance only.">
                  <input
                    id="i-city"
                    className="input"
                    value={d.city}
                    onChange={(e) => set('city', e.target.value)}
                    placeholder="e.g. Udaipur"
                  />
                </Field>
                <Field label="Country" htmlFor="i-country">
                  <input id="i-country" className="input" value={d.country} onChange={(e) => set('country', e.target.value)} />
                </Field>
                <Field label="Venue status" htmlFor="i-vstatus">
                  <select
                    id="i-vstatus"
                    className="select"
                    value={d.venueStatus}
                    onChange={(e) => set('venueStatus', e.target.value as VenueStatus)}
                  >
                    {Object.entries(VENUE_STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Venue name (if known)" htmlFor="i-venue">
                  <input id="i-venue" className="input" value={d.venueName} onChange={(e) => set('venueName', e.target.value)} />
                </Field>
                <Field label="Event date" htmlFor="i-date" error={err('eventDate')}>
                  <input
                    id="i-date"
                    type="date"
                    className="input"
                    min={addDays(today, 1)}
                    value={d.eventDate}
                    onChange={(e) => set('eventDate', e.target.value)}
                    aria-invalid={!!err('eventDate')}
                  />
                </Field>
                <Field label="Duration (days)" htmlFor="i-days" error={err('durationDays')}>
                  <input
                    id="i-days"
                    type="number"
                    min={1}
                    max={14}
                    className="input input-num"
                    value={d.durationDays}
                    onChange={(e) => set('durationDays', Math.round(Number(e.target.value)))}
                  />
                </Field>
                <Field
                  label="Number of sessions"
                  htmlFor="i-sess"
                  error={err('sessionCount')}
                  hint="Each gathering, ceremony or meal service."
                >
                  <input
                    id="i-sess"
                    type="number"
                    min={1}
                    max={12}
                    className="input input-num"
                    value={d.sessionCount}
                    onChange={(e) => set('sessionCount', Math.round(Number(e.target.value)))}
                  />
                </Field>
                <Field
                  label="Session names (optional, comma separated)"
                  htmlFor="i-snames"
                  hint={`If blank: ${profile.defaultSessions.join(', ')}.`}
                >
                  <input id="i-snames" className="input" value={d.sessionNames} onChange={(e) => set('sessionNames', e.target.value)} />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="form-grid">
                <Field label="Estimated guests" htmlFor="i-guests" error={err('guestCount')}>
                  <input
                    id="i-guests"
                    type="number"
                    min={1}
                    className="input input-num"
                    value={d.guestCount}
                    onChange={(e) => set('guestCount', Number(e.target.value))}
                    aria-invalid={!!err('guestCount')}
                  />
                </Field>
                <Field label="Currency" htmlFor="i-cur">
                  <select
                    id="i-cur"
                    className="select"
                    value={d.currency}
                    onChange={(e) => set('currency', e.target.value as IntakeData['currency'])}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Total budget"
                  htmlFor="i-budget"
                  error={err('totalBudget')}
                  hint={
                    d.totalBudget > 0
                      ? `= ${formatMoneyCompact(d.totalBudget, d.currency)} · ${formatMoneyCompact(d.totalBudget / Math.max(1, d.guestCount), d.currency)} per guest`
                      : undefined
                  }
                >
                  <input
                    id="i-budget"
                    type="number"
                    min={1}
                    className="input input-num"
                    value={d.totalBudget}
                    onChange={(e) => set('totalBudget', Number(e.target.value))}
                    aria-invalid={!!err('totalBudget')}
                  />
                </Field>
                <Field
                  label="Contingency reserve (%)"
                  htmlFor="i-cont"
                  error={err('contingencyPct')}
                  hint="Held on top of category budgets; 5–10% is typical."
                >
                  <input
                    id="i-cont"
                    type="number"
                    min={0}
                    max={30}
                    className="input input-num"
                    value={d.contingencyPct}
                    onChange={(e) => set('contingencyPct', Number(e.target.value))}
                  />
                </Field>
                <div className="span-2">
                  <div className="field-label" style={{ marginBottom: 6 }}>
                    Highest priorities (protected from cuts)
                  </div>
                  <div className="row-wrap">
                    {CATEGORY_META.filter((m) => profile.categories.includes(m.key)).map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        className="chip"
                        aria-pressed={d.protectedCategories.includes(m.key)}
                        onClick={() =>
                          set(
                            'protectedCategories',
                            d.protectedCategories.includes(m.key)
                              ? d.protectedCategories.filter((x) => x !== m.key)
                              : [...d.protectedCategories, m.key],
                          )
                        }
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="form-grid">
                <Field label="Style" htmlFor="i-style" hint="e.g. Contemporary heritage, minimalist, eco-conscious, fusion">
                  <input id="i-style" className="input" value={d.style} onChange={(e) => set('style', e.target.value)} />
                </Field>
                <Field label="Overall setting" htmlFor="i-setting">
                  <select id="i-setting" className="select" value={d.setting} onChange={(e) => set('setting', e.target.value as Setting)}>
                    {Object.entries(SETTING_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Desired atmosphere" htmlFor="i-atm" className="span-2">
                  <textarea
                    id="i-atm"
                    className="textarea"
                    value={d.atmosphere}
                    onChange={(e) => set('atmosphere', e.target.value)}
                    placeholder="How should guests feel?"
                  />
                </Field>
                <div className="span-2">
                  <div className="field-label" style={{ marginBottom: 6 }}>
                    Colours
                  </div>
                  <div className="swatch-input">
                    {d.colors.map((c) => (
                      <span key={c} className="swatch" style={{ background: c }} title={c}>
                        <button
                          type="button"
                          aria-label={`Remove colour ${c}`}
                          onClick={() =>
                            set(
                              'colors',
                              d.colors.filter((x) => x !== c),
                            )
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      aria-label="Pick a colour"
                      style={{ width: 40, height: 32, border: 0, background: 'none' }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={d.colors.length >= 8}
                      onClick={() => !d.colors.includes(color.toUpperCase()) && set('colors', [...d.colors, color.toUpperCase()])}
                    >
                      <Plus /> Add colour
                    </button>
                  </div>
                </div>
                <Field label="Weather or venue constraints" htmlFor="i-weather" className="span-2">
                  <input
                    id="i-weather"
                    className="input"
                    value={d.weatherConcerns}
                    onChange={(e) => set('weatherConcerns', e.target.value)}
                    placeholder="e.g. Open lawn, no indoor space for 200"
                  />
                </Field>
              </div>
            )}

            {step === 3 && (
              <div className="form-grid">
                <Field
                  label="Cultural or ceremonial preferences (optional)"
                  htmlFor="i-cult"
                  className="span-2"
                  hint="Only include what the client has told you. Leave blank and nothing will be assumed."
                >
                  <textarea
                    id="i-cult"
                    className="textarea"
                    value={d.culturalPreferences}
                    onChange={(e) => set('culturalPreferences', e.target.value)}
                  />
                </Field>
                <label className="check span-2">
                  <input type="checkbox" checked={d.dietarySpecified} onChange={(e) => set('dietarySpecified', e.target.checked)} /> The
                  client has shared the dietary mix
                </label>
                {d.dietarySpecified && (
                  <>
                    <Field label="Vegetarian share (%)" htmlFor="i-veg" error={err('vegetarianPct')}>
                      <input
                        id="i-veg"
                        type="number"
                        min={0}
                        max={100}
                        className="input input-num"
                        value={d.vegetarianPct}
                        onChange={(e) => set('vegetarianPct', Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Vegan guests" htmlFor="i-vegan" error={err('veganCount')}>
                      <input
                        id="i-vegan"
                        type="number"
                        min={0}
                        className="input input-num"
                        value={d.veganCount}
                        onChange={(e) => set('veganCount', Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Jain guests" htmlFor="i-jain">
                      <input
                        id="i-jain"
                        type="number"
                        min={0}
                        className="input input-num"
                        value={d.jainCount}
                        onChange={(e) => set('jainCount', Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Allergens (comma separated)" htmlFor="i-all">
                      <input id="i-all" className="input" value={d.allergens} onChange={(e) => set('allergens', e.target.value)} />
                    </Field>
                    <Field label="Other dietary notes" htmlFor="i-dn" className="span-2">
                      <input id="i-dn" className="input" value={d.dietaryNotes} onChange={(e) => set('dietaryNotes', e.target.value)} />
                    </Field>
                  </>
                )}
                <div className="span-2">
                  <div className="field-label" style={{ marginBottom: 6 }}>
                    Accessibility requirements
                  </div>
                  <div className="row-wrap">
                    {ACCESSIBILITY_OPTIONS.map((o) => (
                      <button
                        key={o}
                        type="button"
                        className="chip"
                        aria-pressed={d.accessibility.includes(o)}
                        onClick={() =>
                          set(
                            'accessibility',
                            d.accessibility.includes(o) ? d.accessibility.filter((x) => x !== o) : [...d.accessibility, o],
                          )
                        }
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="Accessibility notes" htmlFor="i-an" className="span-2">
                  <input
                    id="i-an"
                    className="input"
                    value={d.accessibilityNotes}
                    onChange={(e) => set('accessibilityNotes', e.target.value)}
                  />
                </Field>
              </div>
            )}

            {step === 4 && (
              <div className="form-grid">
                <Field label="Lead planner" htmlFor="i-planner">
                  <input id="i-planner" className="input" value={d.plannerName} onChange={(e) => set('plannerName', e.target.value)} />
                </Field>
                <Field label="Client" htmlFor="i-client">
                  <input id="i-client" className="input" value={d.clientName} onChange={(e) => set('clientName', e.target.value)} />
                </Field>
                <div className="span-2">
                  <div className="row-between">
                    <span className="field-label">Team & responsibilities</span>
                    <button type="button" className="btn btn-sm" onClick={() => set('team', [...d.team, { name: '', role: '' }])}>
                      <Plus /> Add person
                    </button>
                  </div>
                  <div className="stack" style={{ marginTop: 8 }}>
                    {d.team.map((m, i) => (
                      <div key={i} className="row">
                        <input
                          className="input"
                          aria-label={`Team member ${i + 1} name`}
                          placeholder="Name"
                          value={m.name}
                          onChange={(e) =>
                            set(
                              'team',
                              d.team.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            )
                          }
                        />
                        <input
                          className="input"
                          aria-label={`Team member ${i + 1} role`}
                          placeholder="Role, e.g. Vendor manager"
                          value={m.role}
                          onChange={(e) =>
                            set(
                              'team',
                              d.team.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove team member ${i + 1}`}
                          onClick={() =>
                            set(
                              'team',
                              d.team.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <Trash2 />
                        </button>
                      </div>
                    ))}
                    {!d.team.length && (
                      <div className="small muted">
                        Tasks are assigned by role keywords (vendor, guest, production, finance) or to the lead planner.
                      </div>
                    )}
                  </div>
                </div>
                <Field label="Goals (one per line)" htmlFor="i-goals" className="span-2">
                  <textarea id="i-goals" className="textarea" value={d.goals} onChange={(e) => set('goals', e.target.value)} />
                </Field>
                <Field label="Non-negotiables (one per line)" htmlFor="i-nn">
                  <textarea
                    id="i-nn"
                    className="textarea"
                    value={d.nonNegotiables}
                    onChange={(e) => set('nonNegotiables', e.target.value)}
                  />
                </Field>
                <Field label="Known risks (one per line)" htmlFor="i-risks">
                  <textarea id="i-risks" className="textarea" value={d.knownRisks} onChange={(e) => set('knownRisks', e.target.value)} />
                </Field>
              </div>
            )}

            {step === 5 && (
              <div className="stack">
                <p className="ink-2">
                  Sutrā will generate a brief, a budget fitted to {formatMoneyCompact(d.totalBudget || 0, d.currency)}, a dependency-aware
                  timeline, a suggested run of show and theme concepts. Everything stays editable.
                </p>
                <div className="facts">
                  {[
                    ['Event', d.name || '—'],
                    ['Type', d.type === 'custom' ? d.customTypeLabel || 'Custom' : profile.label],
                    ['When', d.eventDate ? `${formatDate(d.eventDate, { weekday: true })} · ${d.durationDays} day(s)` : '—'],
                    ['Where', [d.city, d.country].filter(Boolean).join(', ') || 'Not specified'],
                    ['Venue', `${d.venueName || 'TBC'} — ${VENUE_STATUS_LABEL[d.venueStatus]}`],
                    ['Guests', String(d.guestCount)],
                    ['Budget', `${formatMoneyCompact(d.totalBudget || 0, d.currency)} + ${d.contingencyPct}% contingency reserve`],
                    ['Sessions', `${d.sessionCount}${d.sessionNames ? ` · ${d.sessionNames}` : ''}`],
                    ['Dietary', d.dietarySpecified ? `${d.vegetarianPct}% vegetarian` : 'Not specified — will be an assumption'],
                    ['Accessibility', d.accessibility.join(', ') || 'Not specified — will be an assumption'],
                    ['Cultural preferences', d.culturalPreferences || 'None provided — none assumed'],
                  ].map(([k, v]) => (
                    <div className="fact" key={k}>
                      <div className="k">{k}</div>
                      <div className="v small">{v}</div>
                    </div>
                  ))}
                </div>
                {Object.keys(validateIntake(d, today)).length > 0 && (
                  <Notice tone="warn">Some required details are missing or invalid — generating will take you back to them.</Notice>
                )}
              </div>
            )}
          </div>
          <div className="card-foot row-between">
            <button className="btn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              <ArrowLeft /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <div className="row">
                <button className="btn btn-ghost" onClick={() => check(step).ok && setStep(STEPS.length - 1)}>
                  Skip to review
                </button>
                <button className="btn btn-primary" onClick={next}>
                  Continue <ArrowRight />
                </button>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={generate}>
                <Sparkles /> Generate plan
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
