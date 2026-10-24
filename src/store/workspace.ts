import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { generateNarrative } from '../domain/brief';
import { categoryMeta } from '../domain/catalog';
import { createDemoPlan } from '../domain/demo';
import { generatePlan, type IntakeData } from '../domain/generator';
import { EventPlanSchema, makeTemplate, planFromTemplate, withFreshIdentity, type TemplateOverrides } from '../domain/io';
import { applyOps, applyVendorStatus, type PlanOp, type Proposal } from '../domain/ops';
import { generateConcepts } from '../domain/themes';
import { rescheduleForEventDate } from '../domain/timeline';
import type {
  Actor,
  BudgetCategory,
  EventPlan,
  EventTemplate,
  Guest,
  NarrativeField,
  Note,
  Payment,
  RunItem,
  ScenarioKey,
  Task,
  TeamMember,
  Vendor,
  VendorStatus,
  ViewKey,
} from '../domain/types';
import { deepClone, todayISO, uid } from '../domain/util';
import type { CopilotMessage } from '../copilot/types';

export const STORAGE_KEY = 'sutra-studio:workspace';
const CORRUPT_KEY = 'sutra-studio:unreadable-backup';

// ---------------------------------------------------------------------------
// Storage status lives in its own store so storage callbacks never recurse.
// ---------------------------------------------------------------------------

interface StorageStatus {
  ok: boolean;
  message?: string;
}
export const useStorageStatus = create<StorageStatus>(() => ({ ok: true }));

const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      const raw = localStorage.getItem(name);
      if (raw === null) return null;
      JSON.parse(raw);
      return raw;
    } catch {
      try {
        const raw = localStorage.getItem(name);
        if (raw !== null) localStorage.setItem(CORRUPT_KEY, raw);
      } catch {
        /* storage unavailable */
      }
      useStorageStatus.setState({
        ok: true,
        message:
          'Saved data could not be read, so a fresh demo workspace was loaded. A copy of the unreadable data was kept in this browser.',
      });
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
      if (!useStorageStatus.getState().ok) useStorageStatus.setState({ ok: true, message: undefined });
    } catch {
      useStorageStatus.setState({
        ok: false,
        message: 'Changes are not being saved — browser storage is full or blocked. Export a backup to keep your work.',
      });
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

// ---------------------------------------------------------------------------

export interface UndoEntry {
  eventId: string;
  label: string;
  snapshot: EventPlan;
  at: string;
}

interface PersistedState {
  events: Record<string, EventPlan>;
  order: string[];
  activeEventId: string | null;
  templates: EventTemplate[];
  welcomeDismissed: boolean;
}

export interface WorkspaceState extends PersistedState {
  undo: UndoEntry[];
  copilot: Record<string, CopilotMessage[]>;

  // workspace
  seedDemo: () => string;
  openDemo: () => string;
  resetDemo: () => string;
  createEvent: (intake: IntakeData) => string;
  switchEvent: (id: string) => void;
  deleteEvent: (id: string) => void;
  duplicateEvent: (id: string) => string | null;
  importPlan: (plan: EventPlan) => string;
  dismissWelcome: () => void;
  undoLast: () => UndoEntry | null;

  // generic edit
  edit: (summary: string, module: ViewKey, recipe: (p: EventPlan) => void | string[], opts?: { undo?: string; actor?: Actor }) => void;

  // brief
  updateBrief: (patch: Partial<EventPlan['brief']>, summary?: string) => void;
  changeEventDate: (date: string) => void;
  regenerateNarrative: () => void;
  updateNarrative: (field: NarrativeField, value: string | string[]) => void;

  // budget
  updateCategory: (key: string, patch: Partial<BudgetCategory>) => void;
  addCategory: (label: string, basis: BudgetCategory['basis']) => void;
  removeCategory: (key: string) => void;
  setScenarioOverride: (scenario: ScenarioKey, key: string, value: number | null) => void;
  resetScenario: (scenario: ScenarioKey) => void;
  adoptScenario: (scenario: ScenarioKey, rates: Record<string, number>) => void;
  upsertPayment: (payment: Payment) => void;
  removePayment: (id: string) => void;

  // vendors
  upsertVendor: (vendor: Vendor) => void;
  removeVendor: (id: string) => void;
  setVendorStatus: (id: string, status: VendorStatus) => string[];
  setPreferred: (id: string) => void;

  // tasks
  upsertTask: (task: Task) => void;
  removeTask: (id: string) => void;
  setTaskStatus: (id: string, status: Task['status']) => void;
  dismissScheduleReport: () => void;

  // guests
  upsertGuest: (g: Guest) => void;
  removeGuest: (id: string) => void;
  importGuests: (guests: Guest[], mode: 'append' | 'replace') => void;

  // run of show
  upsertRunItem: (r: RunItem) => void;
  removeRunItem: (id: string) => void;
  setSoundCutoff: (dayIndex: number, cutoff: string) => void;

  // themes
  regenerateThemes: () => void;
  toggleSaveTheme: (id: string) => void;

  // team & notes
  upsertMember: (m: TeamMember) => void;
  removeMember: (id: string) => void;
  addNote: (note: Omit<Note, 'id' | 'at'>) => void;
  removeNote: (id: string) => void;

  // co-pilot & proposals
  appendCopilot: (eventId: string, msg: CopilotMessage) => void;
  setProposalState: (eventId: string, msgId: string, state: CopilotMessage['proposalState']) => void;
  applyProposal: (proposal: Proposal, ops: PlanOp[], actor: Actor, module: ViewKey) => string[];

  // templates
  saveTemplate: (name: string) => void;
  deleteTemplate: (id: string) => void;
  createFromTemplate: (templateId: string, o: TemplateOverrides) => string | null;
}

const nowISO = () => new Date().toISOString();

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => {
      const activeId = () => get().activeEventId;

      const commit = (eventId: string, next: EventPlan, undoLabel?: string, previous?: EventPlan) => {
        set((s) => ({
          events: { ...s.events, [eventId]: next },
          undo: undoLabel && previous ? [{ eventId, label: undoLabel, snapshot: previous, at: nowISO() }, ...s.undo].slice(0, 15) : s.undo,
        }));
      };

      const edit: WorkspaceState['edit'] = (summary, module, recipe, opts = {}) => {
        const id = activeId();
        if (!id) return;
        const cur = get().events[id];
        if (!cur) return;
        const draft = deepClone(cur);
        const details = recipe(draft) || undefined;
        draft.updatedAt = nowISO();
        draft.activity = [
          {
            id: uid('a'),
            at: nowISO(),
            actor: opts.actor ?? 'planner',
            module,
            summary,
            details: details && details.length ? details : undefined,
          },
          ...draft.activity,
        ].slice(0, 400);
        commit(id, draft, opts.undo, cur);
      };

      const addEvent = (plan: EventPlan) => {
        set((s) => ({
          events: { ...s.events, [plan.id]: plan },
          order: [plan.id, ...s.order.filter((x) => x !== plan.id)],
          activeEventId: plan.id,
        }));
        return plan.id;
      };

      return {
        events: {},
        order: [],
        activeEventId: null,
        templates: [],
        welcomeDismissed: false,
        undo: [],
        copilot: {},

        seedDemo: () => addEvent(createDemoPlan(todayISO())),
        openDemo: () => {
          const demo = get().order.find((id) => get().events[id]?.isDemo);
          if (demo) {
            set({ activeEventId: demo });
            return demo;
          }
          return addEvent(createDemoPlan(todayISO()));
        },
        resetDemo: () => {
          const s = get();
          const demoIds = s.order.filter((id) => s.events[id]?.isDemo);
          const events = { ...s.events };
          for (const id of demoIds) delete events[id];
          const fresh = createDemoPlan(todayISO());
          events[fresh.id] = fresh;
          set({
            events,
            order: [fresh.id, ...s.order.filter((id) => !demoIds.includes(id))],
            activeEventId: fresh.id,
            undo: s.undo.filter((u) => !demoIds.includes(u.eventId)),
            copilot: Object.fromEntries(Object.entries(s.copilot).filter(([k]) => !demoIds.includes(k))),
          });
          return fresh.id;
        },
        createEvent: (intake) => addEvent(generatePlan(intake, todayISO())),
        switchEvent: (id) => {
          if (get().events[id]) set({ activeEventId: id });
        },
        deleteEvent: (id) => {
          const s = get();
          const events = { ...s.events };
          delete events[id];
          const order = s.order.filter((x) => x !== id);
          set({
            events,
            order,
            activeEventId: s.activeEventId === id ? (order[0] ?? null) : s.activeEventId,
            undo: s.undo.filter((u) => u.eventId !== id),
          });
        },
        duplicateEvent: (id) => {
          const src = get().events[id];
          if (!src) return null;
          const copy = withFreshIdentity(src, ' (copy)');
          copy.activity = [
            { id: uid('a'), at: nowISO(), actor: 'system', module: 'overview', summary: `Duplicated from “${src.brief.name}”.` },
            ...copy.activity,
          ];
          return addEvent(copy);
        },
        importPlan: (plan) => {
          const fresh = withFreshIdentity(plan);
          fresh.activity = [
            { id: uid('a'), at: nowISO(), actor: 'system', module: 'exports', summary: 'Imported from a backup file.' },
            ...fresh.activity,
          ];
          return addEvent(fresh);
        },
        dismissWelcome: () => set({ welcomeDismissed: true }),
        undoLast: () => {
          const [entry, ...rest] = get().undo;
          if (!entry || !get().events[entry.eventId]) {
            set({ undo: rest });
            return null;
          }
          const restored = deepClone(entry.snapshot);
          restored.activity = [
            { id: uid('a'), at: nowISO(), actor: 'planner', module: 'overview', summary: `Undid: ${entry.label}` },
            ...restored.activity,
          ];
          set((s) => ({ events: { ...s.events, [entry.eventId]: restored }, undo: rest, activeEventId: entry.eventId }));
          return entry;
        },

        edit,

        updateBrief: (patch, summary) =>
          edit(
            summary ?? `Updated event brief (${Object.keys(patch).join(', ')})`,
            'brief',
            (p) => {
              Object.assign(p.brief, patch);
            },
            { undo: summary ?? 'brief edit' },
          ),
        changeEventDate: (date) =>
          edit(
            `Moved event date to ${date}`,
            'timeline',
            (p) => {
              const { tasks, report } = rescheduleForEventDate(p, date, todayISO());
              p.tasks = tasks;
              p.brief.eventDate = date;
              p.lastScheduleChange = report;
              return [
                `${report.moved.length} tasks rescheduled`,
                `${report.preserved.length} completed tasks preserved`,
                ...report.conflicts,
              ];
            },
            { undo: 'event date change' },
          ),
        regenerateNarrative: () =>
          edit(
            'Regenerated the brief narrative (hand-edited sections kept)',
            'brief',
            (p) => {
              p.narrative = generateNarrative(p.brief, todayISO(), p.budget.contingencyPct, p.narrative);
            },
            { undo: 'brief regeneration' },
          ),
        updateNarrative: (field, value) =>
          edit(`Edited the brief: ${field}`, 'brief', (p) => {
            if (field === 'vision' || field === 'audience') p.narrative[field] = String(value);
            else p.narrative[field] = (Array.isArray(value) ? value : String(value).split('\n')).map((x) => x.trim()).filter(Boolean);
            p.narrative.edited = { ...p.narrative.edited, [field]: true };
          }),

        updateCategory: (key, patch) =>
          edit(
            `Updated budget category ${key}`,
            'budget',
            (p) => {
              const c = p.budget.categories.find((x) => x.key === key);
              if (c) Object.assign(c, patch);
            },
            { undo: 'budget edit' },
          ),
        addCategory: (label, basis) =>
          edit(`Added budget category “${label}”`, 'budget', (p) => {
            let key = `custom_${label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .slice(0, 24)}`;
            while (p.budget.categories.some((c) => c.key === key)) key += '_';
            p.budget.categories.push({
              key,
              label,
              basis,
              planned: 0,
              units: 1,
              unitLabel: '',
              notes: 'Planner-defined category.',
              essential: false,
            });
          }),
        removeCategory: (key) =>
          edit(
            `Removed budget category ${categoryMeta(key)?.label ?? key}`,
            'budget',
            (p) => {
              p.budget.categories = p.budget.categories.filter((c) => c.key !== key);
              p.brief.protectedCategories = p.brief.protectedCategories.filter((k) => k !== key);
            },
            { undo: 'category removal' },
          ),
        setScenarioOverride: (scenario, key, value) =>
          edit(`Edited ${scenario} scenario: ${key}`, 'budget', (p) => {
            const o = { ...p.budget.scenarioOverrides[scenario] };
            if (value === null) delete o[key];
            else o[key] = value;
            p.budget.scenarioOverrides[scenario] = o;
          }),
        resetScenario: (scenario) =>
          edit(`Reset ${scenario} scenario edits`, 'budget', (p) => {
            p.budget.scenarioOverrides[scenario] = {};
          }),
        adoptScenario: (scenario, rates) =>
          edit(
            `Adopted the ${scenario} scenario as the working plan`,
            'budget',
            (p) => {
              const changes: string[] = [];
              for (const c of p.budget.categories) {
                if (rates[c.key] !== undefined && rates[c.key] !== c.planned) {
                  changes.push(`${c.label}: ${c.planned} → ${rates[c.key]}`);
                  c.planned = rates[c.key];
                }
              }
              return changes;
            },
            { undo: `adopting ${scenario} scenario` },
          ),
        upsertPayment: (payment) =>
          edit(
            `Saved payment “${payment.label}”`,
            'budget',
            (p) => {
              const i = p.budget.payments.findIndex((x) => x.id === payment.id);
              if (i >= 0) p.budget.payments[i] = payment;
              else p.budget.payments.push(payment);
            },
            { undo: 'payment edit' },
          ),
        removePayment: (id) =>
          edit(
            'Removed a payment',
            'budget',
            (p) => {
              p.budget.payments = p.budget.payments.filter((x) => x.id !== id);
            },
            { undo: 'payment removal' },
          ),

        upsertVendor: (vendor) =>
          edit(
            `Saved vendor ${vendor.name}`,
            'vendors',
            (p) => {
              const i = p.vendors.findIndex((x) => x.id === vendor.id);
              if (i >= 0) p.vendors[i] = vendor;
              else p.vendors.push(vendor);
              if (vendor.preferred)
                for (const o of p.vendors) if (o.category === vendor.category && o.id !== vendor.id) o.preferred = false;
            },
            { undo: 'vendor edit' },
          ),
        removeVendor: (id) =>
          edit(
            'Removed a vendor',
            'vendors',
            (p) => {
              const v = p.vendors.find((x) => x.id === id);
              p.vendors = p.vendors.filter((x) => x.id !== id);
              p.runOfShow.forEach((r) => (r.vendorIds = r.vendorIds.filter((x) => x !== id)));
              return v ? [`Removed ${v.name}; payments to this vendor were kept for the record.`] : [];
            },
            { undo: 'vendor removal' },
          ),
        setVendorStatus: (id, status) => {
          let log: string[] = [];
          edit(
            'Changed vendor status',
            'vendors',
            (p) => {
              log = applyVendorStatus(p, id, status, todayISO());
              return log;
            },
            { undo: 'vendor status change' },
          );
          return log;
        },
        setPreferred: (id) =>
          edit(
            'Changed preferred quotation',
            'vendors',
            (p) => {
              const v = p.vendors.find((x) => x.id === id);
              if (!v) return;
              const makePreferred = !v.preferred;
              for (const o of p.vendors) if (o.category === v.category) o.preferred = makePreferred && o.id === id;
              return [`${v.name} ${makePreferred ? 'is now' : 'is no longer'} the preferred quotation.`];
            },
            { undo: 'preferred quotation change' },
          ),

        upsertTask: (task) =>
          edit(
            `Saved task “${task.title}”`,
            'timeline',
            (p) => {
              const i = p.tasks.findIndex((x) => x.id === task.id);
              if (i >= 0) p.tasks[i] = task;
              else p.tasks.push(task);
            },
            { undo: 'task edit' },
          ),
        removeTask: (id) =>
          edit(
            'Removed a task',
            'timeline',
            (p) => {
              p.tasks = p.tasks.filter((t) => t.id !== id).map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== id) }));
            },
            { undo: 'task removal' },
          ),
        setTaskStatus: (id, status) =>
          edit('Updated task status', 'timeline', (p) => {
            const t = p.tasks.find((x) => x.id === id);
            if (!t) return;
            t.status = status;
            t.completedOn = status === 'done' ? todayISO() : undefined;
            return [`“${t.title}” → ${status.replace('_', ' ')}`];
          }),
        dismissScheduleReport: () =>
          edit('Reviewed the schedule change report', 'timeline', (p) => {
            p.lastScheduleChange = undefined;
          }),

        upsertGuest: (g) =>
          edit(`Saved guest record`, 'guests', (p) => {
            const i = p.guests.findIndex((x) => x.id === g.id);
            if (i >= 0) p.guests[i] = g;
            else p.guests.push(g);
          }),
        removeGuest: (id) =>
          edit(
            'Removed a guest record',
            'guests',
            (p) => {
              p.guests = p.guests.filter((x) => x.id !== id);
            },
            { undo: 'guest removal' },
          ),
        importGuests: (guests, mode) =>
          edit(
            `Imported ${guests.length} guest records (${mode})`,
            'guests',
            (p) => {
              p.guests = mode === 'replace' ? guests : [...p.guests, ...guests];
            },
            { undo: 'guest import' },
          ),

        upsertRunItem: (r) =>
          edit(
            `Saved run-of-show item “${r.title}”`,
            'runofshow',
            (p) => {
              const i = p.runOfShow.findIndex((x) => x.id === r.id);
              if (i >= 0) p.runOfShow[i] = r;
              else p.runOfShow.push(r);
            },
            { undo: 'run-of-show edit' },
          ),
        removeRunItem: (id) =>
          edit(
            'Removed a run-of-show item',
            'runofshow',
            (p) => {
              p.runOfShow = p.runOfShow.filter((x) => x.id !== id).map((r) => ({ ...r, dependsOn: r.dependsOn.filter((d) => d !== id) }));
            },
            { undo: 'run-of-show removal' },
          ),
        setSoundCutoff: (dayIndex, cutoff) =>
          edit(`Set Day ${dayIndex + 1} sound cut-off to ${cutoff || 'none'}`, 'runofshow', (p) => {
            const d = p.daySettings.find((x) => x.dayIndex === dayIndex);
            if (d) d.soundCutoff = cutoff;
            else p.daySettings.push({ dayIndex, soundCutoff: cutoff });
          }),

        regenerateThemes: () =>
          edit('Generated alternative theme concepts', 'themes', (p) => {
            const keep = p.themes.filter((t) => t.saved || t.id === p.appliedThemeId);
            const variant = p.themeVariant + 1;
            const fresh = generateConcepts(p.brief, todayISO(), variant).filter((t) => !keep.some((k) => k.id === t.id));
            p.themes = [...keep, ...fresh].slice(0, Math.max(4, keep.length + 2));
            p.themeVariant = variant;
          }),
        toggleSaveTheme: (id) =>
          edit('Saved / unsaved a theme concept', 'themes', (p) => {
            const t = p.themes.find((x) => x.id === id);
            if (t) t.saved = !t.saved;
          }),

        upsertMember: (m) =>
          edit(`Saved team member ${m.name}`, 'team', (p) => {
            const i = p.team.findIndex((x) => x.id === m.id);
            if (i >= 0) p.team[i] = m;
            else p.team.push(m);
          }),
        removeMember: (id) =>
          edit(
            'Removed a team member',
            'team',
            (p) => {
              p.team = p.team.filter((m) => m.id !== id);
              p.tasks.forEach((t) => {
                if (t.ownerId === id) t.ownerId = undefined;
              });
              p.runOfShow.forEach((r) => {
                if (r.leadId === id) r.leadId = undefined;
              });
              return ['Their tasks and run-of-show items are now unassigned.'];
            },
            { undo: 'team member removal' },
          ),
        addNote: (note) =>
          edit(`Logged ${note.kind}: ${note.title}`, 'team', (p) => {
            p.notes.unshift({ ...note, id: uid('n'), at: nowISO() });
          }),
        removeNote: (id) =>
          edit(
            'Removed a note',
            'team',
            (p) => {
              p.notes = p.notes.filter((n) => n.id !== id);
            },
            { undo: 'note removal' },
          ),

        appendCopilot: (eventId, msg) =>
          set((s) => ({ copilot: { ...s.copilot, [eventId]: [...(s.copilot[eventId] ?? []), msg].slice(-60) } })),
        setProposalState: (eventId, msgId, state) =>
          set((s) => ({
            copilot: {
              ...s.copilot,
              [eventId]: (s.copilot[eventId] ?? []).map((m) => (m.id === msgId ? { ...m, proposalState: state } : m)),
            },
          })),
        applyProposal: (proposal, ops, actor, module) => {
          const id = activeId();
          if (!id) return [];
          const cur = get().events[id];
          const { plan, log } = applyOps(cur, ops, todayISO());
          plan.activity = [
            { id: uid('a'), at: nowISO(), actor, module, summary: `Applied: ${proposal.title}`, details: log.length ? log : undefined },
            ...plan.activity,
          ].slice(0, 400);
          commit(id, plan, proposal.title, cur);
          return log;
        },

        saveTemplate: (name) => {
          const id = activeId();
          const plan = id ? get().events[id] : null;
          if (!plan) return;
          set((s) => ({ templates: [makeTemplate(plan, name), ...s.templates] }));
        },
        deleteTemplate: (tid) => set((s) => ({ templates: s.templates.filter((t) => t.id !== tid) })),
        createFromTemplate: (templateId, o) => {
          const tpl = get().templates.find((t) => t.id === templateId);
          if (!tpl) return null;
          return addEvent(planFromTemplate(tpl, o, todayISO()));
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): PersistedState => ({
        events: s.events,
        order: s.order,
        activeEventId: s.activeEventId,
        templates: s.templates,
        welcomeDismissed: s.welcomeDismissed,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedState>;
        const events: Record<string, EventPlan> = {};
        let dropped = 0;
        for (const [id, plan] of Object.entries(p.events ?? {})) {
          const ok = EventPlanSchema.safeParse(plan);
          if (ok.success) events[id] = plan as EventPlan;
          else dropped++;
        }
        if (dropped)
          useStorageStatus.setState({
            ok: true,
            message: `${dropped} saved event${dropped > 1 ? 's' : ''} could not be read and ${dropped > 1 ? 'were' : 'was'} skipped.`,
          });
        const order = (p.order ?? []).filter((id) => events[id]);
        for (const id of Object.keys(events)) if (!order.includes(id)) order.push(id);
        return {
          ...current,
          events,
          order,
          activeEventId: p.activeEventId && events[p.activeEventId] ? p.activeEventId : (order[0] ?? null),
          templates: Array.isArray(p.templates) ? p.templates.filter((t) => EventPlanSchema.safeParse(t?.plan).success) : [],
          welcomeDismissed: !!p.welcomeDismissed,
        };
      },
    },
  ),
);

/** First launch (or empty workspace): open the demo so the product is never blank. */
export function ensureSeeded() {
  const s = useWorkspace.getState();
  if (!s.order.length) s.seedDemo();
}
