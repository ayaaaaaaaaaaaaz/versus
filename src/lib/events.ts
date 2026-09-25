import eventData from '../data/events.json';

export type EventKind = 'crisis' | 'policy' | 'political' | 'external';

export interface TimelineEvent {
  month: string;
  title: string;
  kind: EventKind;
  /** 1–3; drives marker prominence, not analytical importance. */
  weight: number;
  detail: string;
}

export const eventMeta = eventData.meta as { note: string; compiledAt: string; precision: string };
export const events = eventData.events as TimelineEvent[];

export const KIND_LABEL: Record<EventKind, string> = {
  crisis: 'Kriz',
  policy: 'Politika',
  political: 'Siyasi',
  external: 'Dış etken',
};

export const KIND_COLOR: Record<EventKind, string> = {
  crisis: 'var(--color-ember-500)',
  policy: 'var(--color-gold-500)',
  political: 'var(--color-ink-300)',
  external: 'var(--color-mint-400)',
};

export const eventYear = (e: TimelineEvent) => Number(e.month.slice(0, 4));

/** Events falling inside a year range, chronological. */
export function eventsBetween(fromYear: number, toYear: number, minWeight = 1): TimelineEvent[] {
  return events
    .filter((e) => {
      const y = eventYear(e);
      return y >= fromYear && y <= toYear && e.weight >= minWeight;
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Thins the list so a short chart does not collapse into overlapping pins.
 * Keeps the heaviest events and drops the rest once the span gets crowded.
 */
export function eventsForChart(fromYear: number, toYear: number, maxPins = 8): TimelineEvent[] {
  const all = eventsBetween(fromYear, toYear);
  if (all.length <= maxPins) return all;
  return all
    .slice()
    .sort((a, b) => b.weight - a.weight || a.month.localeCompare(b.month))
    .slice(0, maxPins)
    .sort((a, b) => a.month.localeCompare(b.month));
}
