import type { EventPlan, ID, RunItem } from './types';
import { isValidTime, minutesToTime, timeToMinutes } from './util';

export type RunIssueKind = 'invalid_time' | 'overlap' | 'setup' | 'dependency' | 'curfew' | 'lead_clash' | 'buffer';

export interface RunIssue {
  id: string;
  itemId: ID;
  dayIndex: number;
  kind: RunIssueKind;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface TimedItem {
  item: RunItem;
  startMin: number;
  /** End in minutes from midnight; items ending after midnight run past 1440. */
  endMin: number;
  crossesMidnight: boolean;
}

export function timed(item: RunItem): TimedItem | null {
  if (!isValidTime(item.start) || !isValidTime(item.end)) return null;
  const startMin = timeToMinutes(item.start);
  let endMin = timeToMinutes(item.end);
  const crossesMidnight = endMin < startMin;
  if (crossesMidnight) endMin += 1440;
  return { item, startMin, endMin, crossesMidnight };
}

export function sortRunItems(items: RunItem[]): RunItem[] {
  return [...items].sort((a, b) => a.dayIndex - b.dayIndex || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

export function analyzeRunOfShow(plan: EventPlan): RunIssue[] {
  const issues: RunIssue[] = [];
  const byId = new Map(plan.runOfShow.map((r) => [r.id, r]));
  const team = new Map(plan.team.map((m) => [m.id, m.name]));
  const days = [...new Set(plan.runOfShow.map((r) => r.dayIndex))].sort((a, b) => a - b);

  for (const day of days) {
    const items = plan.runOfShow.filter((r) => r.dayIndex === day);
    const timedItems: TimedItem[] = [];
    for (const item of items) {
      const t = timed(item);
      if (!t || t.endMin === t.startMin) {
        issues.push({
          id: `inv-${item.id}`,
          itemId: item.id,
          dayIndex: day,
          kind: 'invalid_time',
          severity: 'error',
          message: `“${item.title}” needs a valid start and end time.`,
        });
        continue;
      }
      timedItems.push(t);
    }
    timedItems.sort((a, b) => a.startMin - b.startMin);

    // Same location: overlaps, setup windows, buffers.
    const byLocation = new Map<string, TimedItem[]>();
    for (const t of timedItems) {
      const key = t.item.location.trim().toLowerCase() || '—';
      byLocation.set(key, [...(byLocation.get(key) ?? []), t]);
    }
    for (const list of byLocation.values()) {
      for (let i = 0; i < list.length; i++) {
        const cur = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const other = list[j];
          if (other.startMin < cur.endMin && other.item.location.trim()) {
            issues.push({
              id: `ovl-${cur.item.id}-${other.item.id}`,
              itemId: other.item.id,
              dayIndex: day,
              kind: 'overlap',
              severity: 'error',
              message: `“${other.item.title}” overlaps “${cur.item.title}” in ${other.item.location} (${other.item.start} starts before ${minutesToTime(cur.endMin)}).`,
            });
          }
        }
        const prev = i > 0 ? list[i - 1] : null;
        if (prev && cur.item.location.trim()) {
          const gap = cur.startMin - prev.endMin;
          if (cur.item.setupMinutes > 0 && gap >= 0 && gap < cur.item.setupMinutes) {
            issues.push({
              id: `setup-${cur.item.id}`,
              itemId: cur.item.id,
              dayIndex: day,
              kind: 'setup',
              severity: 'warning',
              message: `“${cur.item.title}” needs ${cur.item.setupMinutes} min of setup in ${cur.item.location}, but only ${gap} min are free after “${prev.item.title}”.`,
            });
          } else if (cur.item.bufferMinutes > 0 && gap >= 0 && gap < cur.item.bufferMinutes && !(cur.item.setupMinutes > 0)) {
            issues.push({
              id: `buf-${cur.item.id}`,
              itemId: cur.item.id,
              dayIndex: day,
              kind: 'buffer',
              severity: 'info',
              message: `Only ${gap} min between “${prev.item.title}” and “${cur.item.title}” (buffer target ${cur.item.bufferMinutes} min).`,
            });
          }
        }
      }
    }

    // Dependencies
    for (const t of timedItems) {
      for (const depId of t.item.dependsOn) {
        const dep = byId.get(depId);
        if (!dep) continue;
        const dt = timed(dep);
        if (!dt) continue;
        const depEndAbs = dep.dayIndex * 1440 + dt.endMin;
        const startAbs = t.item.dayIndex * 1440 + t.startMin;
        if (startAbs < depEndAbs) {
          issues.push({
            id: `dep-${t.item.id}-${depId}`,
            itemId: t.item.id,
            dayIndex: day,
            kind: 'dependency',
            severity: 'error',
            message: `“${t.item.title}” starts before “${dep.title}” finishes, but depends on it.`,
          });
        }
      }
    }

    // Sound cut-off
    const cutoff = plan.daySettings.find((d) => d.dayIndex === day)?.soundCutoff;
    if (cutoff && isValidTime(cutoff)) {
      const cutoffMin = timeToMinutes(cutoff) < 360 ? timeToMinutes(cutoff) + 1440 : timeToMinutes(cutoff);
      for (const t of timedItems) {
        if (t.item.amplifiedSound && t.endMin > cutoffMin) {
          issues.push({
            id: `cur-${t.item.id}`,
            itemId: t.item.id,
            dayIndex: day,
            kind: 'curfew',
            severity: 'warning',
            message: `“${t.item.title}” has amplified sound until ${t.item.end}, past the ${cutoff} cut-off set for this day.`,
          });
        }
      }
    }

    // A lead cannot be in two places at once.
    for (let i = 0; i < timedItems.length; i++) {
      for (let j = i + 1; j < timedItems.length; j++) {
        const a = timedItems[i];
        const b = timedItems[j];
        if (
          a.item.leadId &&
          a.item.leadId === b.item.leadId &&
          b.startMin < a.endMin &&
          a.item.location.trim().toLowerCase() !== b.item.location.trim().toLowerCase()
        ) {
          issues.push({
            id: `lead-${a.item.id}-${b.item.id}`,
            itemId: b.item.id,
            dayIndex: day,
            kind: 'lead_clash',
            severity: 'warning',
            message: `${team.get(a.item.leadId) ?? 'The same lead'} is leading “${a.item.title}” and “${b.item.title}” at the same time in different spaces.`,
          });
        }
      }
    }
  }
  return issues;
}
