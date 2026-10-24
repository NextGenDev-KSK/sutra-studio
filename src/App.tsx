import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CalendarRange,
  ChevronsUpDown,
  ClipboardList,
  Cloud,
  Download,
  FileText,
  FlaskConical,
  HardDrive,
  LayoutDashboard,
  ListOrdered,
  Menu,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Store,
  Undo2,
  Users,
  Wallet,
  Bot,
  AlertTriangle,
} from 'lucide-react';
import { VIEW_LABELS, eventTypeLabel } from './domain/catalog';
import type { EventPlan, ViewKey } from './domain/types';
import { diffDays, formatDate } from './domain/util';
import { fetchCopilotStatus } from './copilot/provider';
import { navigate, useRoute, hrefFor } from './lib/router';
import { useStorageStatus, useWorkspace } from './store/workspace';
import { ConfirmHost, ToastHost, confirmDialog, toast, Empty } from './ui/kit';
import { Logo, useInsights, useToday, useUI } from './views/common';
import { ErrorBoundary } from './ui/ErrorBoundary';

// Views are code-split: only the overview ships in the first paint path; the
// rest load on demand.
const CopilotPanel = lazy(() => import('./views/Copilot').then((m) => ({ default: m.CopilotPanel })));
const Overview = lazy(() => import('./views/Overview').then((m) => ({ default: m.Overview })));
const BriefView = lazy(() => import('./views/Brief').then((m) => ({ default: m.BriefView })));
const BudgetLab = lazy(() => import('./views/BudgetLab').then((m) => ({ default: m.BudgetLab })));
const TimelineView = lazy(() => import('./views/Timeline').then((m) => ({ default: m.TimelineView })));
const VendorHub = lazy(() => import('./views/Vendors').then((m) => ({ default: m.VendorHub })));
const ThemeStudio = lazy(() => import('./views/Themes').then((m) => ({ default: m.ThemeStudio })));
const GuestOps = lazy(() => import('./views/Guests').then((m) => ({ default: m.GuestOps })));
const RunOfShowView = lazy(() => import('./views/RunOfShow').then((m) => ({ default: m.RunOfShowView })));
const TeamTasks = lazy(() => import('./views/Team').then((m) => ({ default: m.TeamTasks })));
const ExportsView = lazy(() => import('./views/Exports').then((m) => ({ default: m.ExportsView })));
const Intake = lazy(() => import('./views/Intake').then((m) => ({ default: m.Intake })));
const ReportView = lazy(() => import('./views/Report').then((m) => ({ default: m.ReportView })));

function Loading() {
  return (
    <div className="card card-pad muted" role="status">
      Loading…
    </div>
  );
}

const NAV: { key: ViewKey; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', icon: LayoutDashboard },
  { key: 'brief', icon: FileText },
  { key: 'budget', icon: Wallet },
  { key: 'timeline', icon: CalendarRange },
  { key: 'vendors', icon: Store },
  { key: 'themes', icon: Palette },
  { key: 'guests', icon: Users },
  { key: 'runofshow', icon: ListOrdered },
  { key: 'team', icon: ClipboardList },
  { key: 'exports', icon: Download },
];

export default function App() {
  const route = useRoute();
  const events = useWorkspace((s) => s.events);
  const activeId = useWorkspace((s) => s.activeEventId);
  const switchEvent = useWorkspace((s) => s.switchEvent);
  const setStatus = useUI((s) => s.setStatus);

  useEffect(() => {
    let alive = true;
    fetchCopilotStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, [setStatus]);

  const routeEventId = route.name === 'view' || route.name === 'report' ? route.eventId : null;
  useEffect(() => {
    if (routeEventId && events[routeEventId] && routeEventId !== activeId) switchEvent(routeEventId);
  }, [routeEventId, events, activeId, switchEvent]);

  useEffect(() => {
    if (route.name === 'home' && activeId && events[activeId]) navigate({ name: 'view', eventId: activeId, view: 'overview' });
  }, [route.name, activeId, events]);

  let body: ReactNode;
  if (route.name === 'report') {
    const plan = events[route.eventId];
    body = plan ? <ReportView plan={plan} kind={route.kind} /> : <NotFound />;
    return (
      <>
        <main className="content" id="main">
          <ErrorBoundary resetKey={window.location.hash}>
            <Suspense fallback={<Loading />}>{body}</Suspense>
          </ErrorBoundary>
        </main>
        <ToastHost />
        <ConfirmHost />
      </>
    );
  }
  if (route.name === 'new') {
    body = <Intake templateId={route.templateId} />;
  } else if (route.name === 'view') {
    const plan = events[route.eventId];
    body = plan ? <ViewSwitch plan={plan} view={route.view} /> : <NotFound />;
  } else {
    body = activeId && events[activeId] ? null : <NoEvents />;
  }
  const plan = routeEventId ? (events[routeEventId] ?? null) : null;
  const title = route.name === 'new' ? 'New event' : route.name === 'view' ? VIEW_LABELS[route.view] : 'Sutrā Studio';

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app">
        <Sidebar plan={plan} view={route.name === 'view' ? route.view : null} />
        <div className="main">
          <Topbar plan={plan} title={title} />
          <main className="content" id="main" tabIndex={-1}>
            <ErrorBoundary resetKey={window.location.hash}>
              <Suspense fallback={<Loading />}>{body}</Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      {plan && (
        <Suspense fallback={null}>
          <CopilotPanel plan={plan} />
        </Suspense>
      )}
      <ToastHost />
      <ConfirmHost />
    </>
  );
}

function ViewSwitch({ plan, view }: { plan: EventPlan; view: ViewKey }) {
  switch (view) {
    case 'overview':
      return <Overview plan={plan} />;
    case 'brief':
      return <BriefView plan={plan} />;
    case 'budget':
      return <BudgetLab plan={plan} />;
    case 'timeline':
      return <TimelineView plan={plan} />;
    case 'vendors':
      return <VendorHub plan={plan} />;
    case 'themes':
      return <ThemeStudio plan={plan} />;
    case 'guests':
      return <GuestOps plan={plan} />;
    case 'runofshow':
      return <RunOfShowView plan={plan} />;
    case 'team':
      return <TeamTasks plan={plan} />;
    case 'exports':
      return <ExportsView plan={plan} />;
  }
}

function NotFound() {
  const openDemo = useWorkspace((s) => s.openDemo);
  return (
    <div className="card">
      <Empty
        icon={<AlertTriangle />}
        title="This event isn’t in your workspace"
        action={
          <div className="row-wrap" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => navigate({ name: 'view', eventId: openDemo(), view: 'overview' })}>
              Open the demo event
            </button>
            <a className="btn" href="#/new">
              Create an event
            </a>
          </div>
        }
      >
        It may have been deleted, or the link came from another browser. Events are stored locally in each browser.
      </Empty>
    </div>
  );
}

function NoEvents() {
  const openDemo = useWorkspace((s) => s.openDemo);
  return (
    <div className="card" style={{ maxWidth: 640, margin: '40px auto' }}>
      <Empty
        icon={<Sparkles />}
        title="Your workspace is empty"
        action={
          <div className="row-wrap" style={{ justifyContent: 'center' }}>
            <a className="btn btn-primary" href="#/new">
              <Plus /> Create event
            </a>
            <button className="btn" onClick={() => navigate({ name: 'view', eventId: openDemo(), view: 'overview' })}>
              <FlaskConical /> Try the demo event
            </button>
          </div>
        }
      >
        Create an event from a short brief, or explore the fully populated demo wedding.
      </Empty>
    </div>
  );
}

function Sidebar({ plan, view }: { plan: EventPlan | null; view: ViewKey | null }) {
  const open = useUI((s) => s.sidebarOpen);
  const setSidebar = useUI((s) => s.setSidebar);
  const status = useUI((s) => s.copilotStatus);
  const storage = useStorageStatus();
  useEffect(() => {
    setSidebar(false);
  }, [view, plan?.id, setSidebar]);
  return (
    <>
      <div className={`sidebar-scrim${open ? ' open' : ''}`} onClick={() => setSidebar(false)} aria-hidden="true" />
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Workspace navigation">
        <a className="brand" href={plan ? hrefFor({ name: 'view', eventId: plan.id, view: 'overview' }) : '#/'}>
          <Logo />
          <div>
            <div className="brand-name">
              <span aria-hidden="true">
                Sutr<span className="brand-a">a</span> Studio
              </span>
              <span className="sr-only">Sutrā Studio</span>
            </div>
            <div className="brand-tag">Every celebration, expertly orchestrated.</div>
          </div>
        </a>
        <EventSwitcher plan={plan} />
        <div className="sidebar-actions">
          <a className="btn btn-sm sidebar-btn" href="#/new">
            <Plus /> New event
          </a>
          <button
            className="btn btn-sm sidebar-btn"
            onClick={() => navigate({ name: 'view', eventId: useWorkspace.getState().openDemo(), view: 'overview' })}
          >
            <FlaskConical /> Demo event
          </button>
        </div>
        {plan && <NavList plan={plan} view={view} />}
        <div className="sidebar-foot">
          <div
            className={`mode-line${storage.ok ? '' : ' bad'}`}
            title="Plans are stored in this browser's local storage. There is no cloud sync or multi-user collaboration in this build."
          >
            <HardDrive />
            <span>{storage.ok ? 'Local workspace — saved in this browser only. No cloud sync.' : storage.message}</span>
          </div>
          {storage.ok && storage.message && (
            <div className="mode-line">
              <AlertTriangle />
              <span>{storage.message}</span>
            </div>
          )}
          <div
            className="mode-line"
            title={
              status.available
                ? 'Requests go to the server-side co-pilot endpoint, which calls Claude.'
                : 'No model key is configured, so the co-pilot uses its built-in planning rules.'
            }
          >
            {status.available ? <Cloud /> : <Bot />}
            <span>
              {!status.checked
                ? 'Checking co-pilot…'
                : status.available
                  ? `Co-pilot: Claude (${status.model ?? 'model'})`
                  : 'Co-pilot: built-in planning assistant (no model connected)'}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

function NavList({ plan, view }: { plan: EventPlan; view: ViewKey | null }) {
  const ins = useInsights(plan);
  const counts: Partial<Record<ViewKey, number>> = {
    timeline: ins.timeline.overdue.length,
    runofshow: ins.runIssues.filter((i) => i.severity !== 'info').length,
    budget: ins.budget.warnings.filter((w) => w.severity === 'danger').length,
  };
  return (
    <nav className="nav" aria-label="Event sections">
      <div className="nav-label">Event workspace</div>
      {NAV.map(({ key, icon: Icon }) => (
        <a key={key} href={hrefFor({ name: 'view', eventId: plan.id, view: key })} aria-current={view === key ? 'page' : undefined}>
          <Icon />
          {VIEW_LABELS[key]}
          {counts[key] ? (
            <span className="nav-count" aria-label={`${counts[key]} need attention`}>
              {counts[key]}
            </span>
          ) : null}
        </a>
      ))}
    </nav>
  );
}

function EventSwitcher({ plan }: { plan: EventPlan | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const order = useWorkspace((s) => s.order);
  const events = useWorkspace((s) => s.events);
  const openDemo = useWorkspace((s) => s.openDemo);
  const resetDemo = useWorkspace((s) => s.resetDemo);
  const today = useToday();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const go = (id: string) => {
    setOpen(false);
    navigate({ name: 'view', eventId: id, view: 'overview' });
  };
  return (
    <div className="event-switch" ref={ref}>
      <button className="event-switch-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="event-switch-name">{plan ? plan.brief.name : 'Choose an event'}</div>
          <div className="event-switch-meta">
            {plan
              ? `${formatDate(plan.brief.eventDate)} · ${Math.max(0, diffDays(today, plan.brief.eventDate))} days to go`
              : `${order.length} events`}
          </div>
        </div>
        <ChevronsUpDown style={{ width: 16, height: 16, opacity: 0.7 }} />
      </button>
      {open && (
        <div className="event-menu" role="menu">
          {order.map((id) => {
            const e = events[id];
            if (!e) return null;
            return (
              <button key={id} role="menuitem" className="event-menu-item" aria-current={plan?.id === id} onClick={() => go(id)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="strong" style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.brief.name}
                  </div>
                  <div className="tiny muted">
                    {eventTypeLabel(e.brief.type, e.brief.customTypeLabel)} · {formatDate(e.brief.eventDate)}
                  </div>
                </div>
                {e.isDemo && <span className="badge badge-demo">Demo</span>}
              </button>
            );
          })}
          <div className="event-menu-sep" />
          <button
            role="menuitem"
            className="event-menu-item"
            onClick={() => {
              setOpen(false);
              navigate('#/new');
            }}
          >
            <Plus style={{ width: 16, height: 16 }} /> Create event
          </button>
          <button role="menuitem" className="event-menu-item" onClick={() => go(openDemo())}>
            <FlaskConical style={{ width: 16, height: 16 }} /> Open demo event
          </button>
          {plan?.isDemo && (
            <button
              role="menuitem"
              className="event-menu-item"
              onClick={async () => {
                setOpen(false);
                const ok = await confirmDialog({
                  title: 'Reset the demo event?',
                  body: 'The demo wedding returns to its original illustrative state. Your own events are not touched.',
                  confirmLabel: 'Reset demo',
                  danger: true,
                });
                if (ok) {
                  go(resetDemo());
                  toast('Demo event reset to its original state.');
                }
              }}
            >
              <RotateCcw style={{ width: 16, height: 16 }} /> Reset demo data
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Topbar({ plan, title }: { plan: EventPlan | null; title: string }) {
  const setSidebar = useUI((s) => s.setSidebar);
  const openCopilot = useUI((s) => s.openCopilot);
  const undo = useWorkspace((s) => s.undo);
  const undoLast = useWorkspace((s) => s.undoLast);
  const last = plan ? undo.find((u) => u.eventId === plan.id) : undefined;
  const canUndo = !!last && undo[0] === last;
  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" aria-label="Open navigation" onClick={() => setSidebar(true)}>
        <Menu />
      </button>
      <div className="topbar-title" style={{ flex: 1, minWidth: 0 }}>
        {plan && (
          <span className="eyebrow">
            {plan.brief.name}
            {plan.isDemo ? ' · Illustrative demo' : ''}
          </span>
        )}
        <h1>{title}</h1>
      </div>
      {canUndo && last && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            const e = undoLast();
            if (e) toast(`Undid: ${e.label}`, 'info');
          }}
          title={`Undo: ${last.label}`}
        >
          <Undo2 /> <span className="hide-sm">Undo</span>
        </button>
      )}
      {plan && (
        <button className="btn btn-gold" onClick={() => openCopilot()} aria-label="Open the event co-pilot">
          <Sparkles /> <span className="hide-sm">Co-pilot</span>
        </button>
      )}
    </header>
  );
}
