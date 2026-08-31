import { RESULTS_DELAY_MINUTES, SESSION_DURATION_MINUTES } from "../config";

export type ScoringType = "SPR" | "RAC";

export interface ScheduledSession {
  id: string;
  type: ScoringType;
  /** Scheduled start, ISO 8601 with offset, as published by motogp.com. */
  dateUtc: string;
  /** Upstream status. Only a FINISHED session has a trustworthy timestamp. */
  status: string;
}

export interface ScheduledEvent {
  /** YYYY-MM-DD, the published event window. */
  dateStart: string;
  dateEnd: string;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

/**
 * The session start we can actually trust.
 *
 * Published session times for future rounds are unreliable in two distinct
 * ways, both observed in the real 2026 calendar:
 *   - Valencia sits in the 27-29 Nov window but its sessions are dated 21-22 Nov,
 *     six days early;
 *   - Qatar's Grand Prix is dated 6 Nov, which is inside its 6-8 Nov window but
 *     is the Friday, so the sprint would appear to run after the race.
 *
 * A session that has actually happened has a real timestamp, so trust it. For
 * anything not yet run, keep only the published time of day and place it on the
 * day the calendar structure demands: the Grand Prix on the event's final day,
 * the sprint the day before. Times firm up as a round approaches and this
 * self-corrects when they do.
 */
export function effectiveStart(session: ScheduledSession, event: ScheduledEvent): Date {
  const published = new Date(session.dateUtc);
  if (session.status === "FINISHED") return published;

  const raceDay = new Date(`${event.dateEnd}T00:00:00+00:00`).getTime();
  const dayOfSession = session.type === "SPR" ? raceDay - DAY : raceDay;
  const timeOfDay =
    published.getUTCHours() * 3_600_000 + published.getUTCMinutes() * MINUTE + published.getUTCSeconds() * 1000;
  return new Date(dayOfSession + timeOfDay);
}

/** When the session is expected to finish. */
export function estimatedEnd(session: ScheduledSession, event: ScheduledEvent): Date {
  return new Date(effectiveStart(session, event).getTime() + SESSION_DURATION_MINUTES[session.type] * MINUTE);
}

/**
 * The earliest moment this session's results should be fetched:
 * two hours after the race is expected to end.
 */
export function fetchAfter(session: ScheduledSession, event: ScheduledEvent): Date {
  return new Date(estimatedEnd(session, event).getTime() + RESULTS_DELAY_MINUTES * MINUTE);
}

/**
 * Has enough time passed since the race ended to read a final classification?
 *
 * This decides only *when to bother asking*. The hard correctness gate is the
 * upstream session status: nothing is ever ingested until motogp.com itself
 * reports the session FINISHED, so a mis-scheduled fetch costs one wasted
 * request, never a wrong result.
 */
export function isDue(session: ScheduledSession, event: ScheduledEvent, now: Date): boolean {
  return now.getTime() >= fetchAfter(session, event).getTime();
}

/** Formats an instant in a named IANA zone, for schedule reporting. */
export function inZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
