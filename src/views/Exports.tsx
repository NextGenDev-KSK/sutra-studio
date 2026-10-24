import { useRef, useState } from 'react';
import {
  CalendarPlus,
  Copy,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderInput,
  LayoutTemplate,
  ListOrdered,
  Printer,
  RotateCcw,
  Store,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { budgetCSV, runOfShowCSV, scenariosCSV, timelineCSV, timelineICS, vendorsCSV } from '../domain/exports';
import { guestsToCSV } from '../domain/guests';
import { makeBackup, parseBackup, type ImportResult } from '../domain/io';
import type { EventPlan } from '../domain/types';
import { addDays, formatDate, formatDateTime, isValidISODate, slug } from '../domain/util';
import { downloadFile, readFileAsText } from '../lib/download';
import { hrefFor, navigate } from '../lib/router';
import { useWorkspace } from '../store/workspace';
import { Field, Modal, Notice, confirmDialog, toast } from '../ui/kit';
import { useToday } from './common';

export function ExportsView({ plan }: { plan: EventPlan }) {
  const today = useToday();
  const base = `${slug(plan.brief.name)}-${today}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [tplName, setTplName] = useState(`${plan.brief.name} template`);
  const [fromTpl, setFromTpl] = useState<string | null>(null);
  const templates = useWorkspace((s) => s.templates);
  const saveTemplate = useWorkspace((s) => s.saveTemplate);
  const deleteTemplate = useWorkspace((s) => s.deleteTemplate);
  const duplicateEvent = useWorkspace((s) => s.duplicateEvent);
  const deleteEvent = useWorkspace((s) => s.deleteEvent);
  const resetDemo = useWorkspace((s) => s.resetDemo);
  const order = useWorkspace((s) => s.order);
  const events = useWorkspace((s) => s.events);

  const dl = (name: string, content: string, mime: string, label: string) => {
    downloadFile(name, content, mime);
    toast(`${label} exported from the current plan.`);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImportResult(parseBackup(await readFileAsText(file)));
    } catch (e) {
      setImportResult({ ok: false, errors: [(e as Error).message] });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const Card = ({
    icon,
    title,
    children,
    actions,
  }: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
    actions: React.ReactNode;
  }) => (
    <section className="card export-card">
      <div className="card-body">
        <div className="ic">{icon}</div>
        <h3>{title}</h3>
        <div className="small ink-2" style={{ marginTop: 4 }}>
          {children}
        </div>
      </div>
      <div className="card-foot row-wrap">{actions}</div>
    </section>
  );

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 26 }}>Exports & Reports</h2>
          <p>
            Every export is generated from the plan as it is right now — including any co-pilot changes you applied. Print views save to PDF
            from your browser’s print dialog.
          </p>
        </div>
      </div>

      <div className="export-grid">
        <Card
          icon={<FileText />}
          title="Client-ready event brief"
          actions={
            <a className="btn btn-sm btn-primary" href={hrefFor({ name: 'report', eventId: plan.id, kind: 'brief' })}>
              <Printer /> Open print view
            </a>
          }
        >
          Vision, key facts, budget summary, milestones and open decisions. Guest names are never included.
        </Card>
        <Card
          icon={<Wallet />}
          title="Budget & scenarios"
          actions={
            <>
              <button
                className="btn btn-sm"
                onClick={() => dl(`${base}-budget.csv`, budgetCSV(plan, today), 'text/csv;charset=utf-8', 'Itemised budget')}
              >
                <FileSpreadsheet /> Budget CSV
              </button>
              <button
                className="btn btn-sm"
                onClick={() => dl(`${base}-scenarios.csv`, scenariosCSV(plan, today), 'text/csv;charset=utf-8', 'Scenario comparison')}
              >
                <FileSpreadsheet /> Scenarios CSV
              </button>
              <a className="btn btn-sm" href={hrefFor({ name: 'report', eventId: plan.id, kind: 'budget' })}>
                <Printer /> Print
              </a>
            </>
          }
        >
          Itemised planned, quoted, committed, paid and forecast amounts with contingency and remaining budget; Lean / Balanced / Premium
          side by side.
        </Card>
        <Card
          icon={<CalendarPlus />}
          title="Timeline & milestones"
          actions={
            <>
              <button
                className="btn btn-sm"
                onClick={() => dl(`${base}-timeline.csv`, timelineCSV(plan, today), 'text/csv;charset=utf-8', 'Timeline')}
              >
                <FileSpreadsheet /> CSV
              </button>
              <button
                className="btn btn-sm"
                onClick={() => dl(`${base}-calendar.ics`, timelineICS(plan), 'text/calendar;charset=utf-8', 'Calendar file')}
              >
                <CalendarPlus /> Calendar (.ics)
              </button>
              <a className="btn btn-sm" href={hrefFor({ name: 'report', eventId: plan.id, kind: 'timeline' })}>
                <Printer /> Checklist
              </a>
            </>
          }
        >
          Every task with owner, status, dependencies and flags. The .ics file imports open tasks and event days into Google, Apple or
          Outlook calendars.
        </Card>
        <Card
          icon={<Store />}
          title="Vendor shortlist & quotations"
          actions={
            <>
              <button
                className="btn btn-sm"
                onClick={() => dl(`${base}-vendors.csv`, vendorsCSV(plan), 'text/csv;charset=utf-8', 'Vendor shortlist')}
              >
                <FileSpreadsheet /> CSV
              </button>
              <a className="btn btn-sm" href={hrefFor({ name: 'report', eventId: plan.id, kind: 'vendors' })}>
                <Printer /> Print
              </a>
            </>
          }
        >
          Status, quotation totals at the current guest count, inclusions, pros and cons — with each record’s verification level.
        </Card>
        <Card
          icon={<ListOrdered />}
          title="Event-day production schedule"
          actions={
            <>
              <button
                className="btn btn-sm"
                onClick={() => dl(`${base}-run-of-show.csv`, runOfShowCSV(plan), 'text/csv;charset=utf-8', 'Run of show')}
              >
                <FileSpreadsheet /> CSV
              </button>
              <a className="btn btn-sm" href={hrefFor({ name: 'report', eventId: plan.id, kind: 'runofshow' })}>
                <Printer /> Print
              </a>
            </>
          }
        >
          Times, locations, leads, vendors, setup, buffers, contingencies and any detected conflicts.
        </Card>
        <Card
          icon={<Users />}
          title="Guest list"
          actions={
            <button
              className="btn btn-sm"
              disabled={!plan.guests.length}
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: 'Export personal data?',
                    body: 'The guest list includes names, dietary and accessibility notes. Store and share the file carefully.',
                    confirmLabel: 'Export guest list',
                  })
                )
                  dl(`${base}-guests.csv`, guestsToCSV(plan.guests), 'text/csv;charset=utf-8', 'Guest list');
              }}
            >
              <FileSpreadsheet /> CSV ({plan.guests.length})
            </button>
          }
        >
          Households with RSVP, diet, allergies, accessibility and seating notes. Kept separate from client reports.
        </Card>
        <Card
          icon={<FileJson />}
          title="Complete plan backup"
          actions={
            <>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => dl(`${base}-backup.json`, JSON.stringify(makeBackup(plan), null, 2), 'application/json', 'Full plan backup')}
              >
                <FileJson /> Export JSON
              </button>
              <input
                ref={fileRef}
                id="import-json"
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => onImport(e.target.files?.[0])}
              />
              <label
                htmlFor="import-json"
                className="btn btn-sm"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
              >
                <FolderInput /> Import backup
              </label>
            </>
          }
        >
          Everything in this event, including guests — use it to move a plan to another browser or keep an archive. Imports are validated
          and added as a new event; nothing is overwritten.
        </Card>
      </div>

      <section className="card" aria-labelledby="tpl-h">
        <div className="card-head">
          <div>
            <h3 id="tpl-h">
              <LayoutTemplate style={{ display: 'inline', width: 17, height: 17, verticalAlign: '-3px' }} /> Reusable templates
            </h3>
            <div className="sub">
              Saves categories, tasks, dependencies, sessions and run of show — without guests, vendors, payments or progress.
            </div>
          </div>
        </div>
        <div className="card-body stack">
          <form
            className="row-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              if (!tplName.trim()) return;
              saveTemplate(tplName);
              toast('Template saved.');
            }}
          >
            <label className="sr-only" htmlFor="tpl-name">
              Template name
            </label>
            <input
              id="tpl-name"
              className="input input-sm"
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              style={{ maxWidth: 340 }}
            />
            <button className="btn btn-sm" type="submit">
              Save this event as a template
            </button>
          </form>
          {templates.length ? (
            <ul className="list">
              {templates.map((t) => (
                <li key={t.id} className="row-between">
                  <div>
                    <div className="strong small">{t.name}</div>
                    <div className="tiny muted">
                      From “{t.sourceEventName}” · {formatDateTime(t.createdAt)} · {t.plan.tasks.length} tasks ·{' '}
                      {t.plan.budget.categories.length} categories
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn btn-sm btn-primary" onClick={() => setFromTpl(t.id)}>
                      Create event
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Delete template ${t.name}`}
                      onClick={async () => {
                        if (await confirmDialog({ title: `Delete template “${t.name}”?`, confirmLabel: 'Delete', danger: true }))
                          deleteTemplate(t.id);
                      }}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="small muted">No templates yet.</div>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="ws-h">
        <div className="card-head">
          <div>
            <h3 id="ws-h">Workspace</h3>
            <div className="sub">{order.length} events stored in this browser (local workspace, no cloud sync).</div>
          </div>
        </div>
        <div className="card-body row-wrap">
          <button
            className="btn btn-sm"
            onClick={() => {
              const id = duplicateEvent(plan.id);
              if (id) {
                toast('Event duplicated.');
                navigate({ name: 'view', eventId: id, view: 'overview' });
              }
            }}
          >
            <Copy /> Duplicate this event
          </button>
          {order.some((id) => events[id]?.isDemo) && (
            <button
              className="btn btn-sm"
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: 'Reset the demo event?',
                    body: 'Only the illustrative demo wedding is reset. Your own events stay exactly as they are.',
                    confirmLabel: 'Reset demo',
                    danger: true,
                  })
                ) {
                  const id = resetDemo();
                  toast('Demo reset.');
                  navigate({ name: 'view', eventId: id, view: 'overview' });
                }
              }}
            >
              <RotateCcw /> Reset demo data
            </button>
          )}
          <button
            className="btn btn-sm btn-danger"
            onClick={async () => {
              if (
                await confirmDialog({
                  title: `Delete “${plan.brief.name}”?`,
                  body: 'This permanently removes the event from this browser. Export a backup first if you might need it.',
                  confirmLabel: 'Delete event',
                  danger: true,
                })
              ) {
                deleteEvent(plan.id);
                toast('Event deleted.');
                const next = useWorkspace.getState().activeEventId;
                navigate(next ? { name: 'view', eventId: next, view: 'overview' } : '#/');
              }
            }}
          >
            <Trash2 /> Delete this event
          </button>
        </div>
      </section>

      {importResult && <ImportBackupModal result={importResult} onClose={() => setImportResult(null)} />}
      {fromTpl && <FromTemplateModal templateId={fromTpl} onClose={() => setFromTpl(null)} />}
    </div>
  );
}

function ImportBackupModal({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  const importPlan = useWorkspace((s) => s.importPlan);
  return (
    <Modal
      open
      onClose={onClose}
      title="Import a plan backup"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {result.ok && (
            <button
              className="btn btn-primary"
              onClick={() => {
                const id = importPlan(result.plan);
                toast(`Imported “${result.plan.brief.name}” as a new event.`);
                onClose();
                navigate({ name: 'view', eventId: id, view: 'overview' });
              }}
            >
              Import as new event
            </button>
          )}
        </>
      }
    >
      {result.ok ? (
        <div className="stack">
          <Notice tone="ok">
            Valid Sutrā Studio backup: <strong>{result.plan.brief.name}</strong> on {formatDate(result.plan.brief.eventDate)} —{' '}
            {result.plan.tasks.length} tasks, {result.plan.vendors.length} vendors, {result.plan.guests.length} guest households.
          </Notice>
          {result.warnings.map((w) => (
            <Notice key={w} tone="warn">
              {w}
            </Notice>
          ))}
          <p className="small muted">It will be added as a separate event; no existing event is changed.</p>
        </div>
      ) : (
        <Notice tone="danger">
          <strong>This file can’t be imported.</strong>
          <ul className="bullets" style={{ marginTop: 4 }}>
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}
    </Modal>
  );
}

function FromTemplateModal({ templateId, onClose }: { templateId: string; onClose: () => void }) {
  const today = useToday();
  const tpl = useWorkspace((s) => s.templates.find((t) => t.id === templateId))!;
  const create = useWorkspace((s) => s.createFromTemplate);
  const [name, setName] = useState(tpl.plan.brief.name.replace(/ \(copy\)$/, '') + ' — new');
  const [date, setDate] = useState(addDays(today, 120));
  const [guests, setGuests] = useState(tpl.plan.brief.guestCount);
  const [budget, setBudget] = useState(tpl.plan.brief.totalBudget);
  const [err, setErr] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={`New event from “${tpl.name}”`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (name.trim().length < 2) return setErr('Name the event.');
              if (!isValidISODate(date) || date <= today) return setErr('Choose a future date.');
              if (!Number.isInteger(guests) || guests < 1) return setErr('Guest count must be a whole number.');
              if (!(budget > 0)) return setErr('Budget must be greater than zero.');
              const id = create(templateId, { name, eventDate: date, guestCount: guests, totalBudget: budget });
              if (id) {
                toast('Event created from template.');
                onClose();
                navigate({ name: 'view', eventId: id, view: 'brief' });
              }
            }}
          >
            Create event
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Event name" htmlFor="ft-n" className="span-2">
          <input id="ft-n" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Event date" htmlFor="ft-d">
          <input id="ft-d" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Guests" htmlFor="ft-g">
          <input id="ft-g" type="number" className="input input-num" value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
        </Field>
        <Field label={`Budget (${tpl.plan.brief.currency})`} htmlFor="ft-b" className="span-2">
          <input id="ft-b" type="number" className="input input-num" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </Field>
      </div>
      {err && (
        <div className="field-error" role="alert" style={{ marginTop: 10 }}>
          {err}
        </div>
      )}
    </Modal>
  );
}
