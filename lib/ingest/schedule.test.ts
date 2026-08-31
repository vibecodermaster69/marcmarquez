import { describe, expect, it } from "vitest";
import { RESULTS_DELAY_MINUTES, SESSION_DURATION_MINUTES } from "../config";
import { effectiveStart, estimatedEnd, fetchAfter, isDue } from "./schedule";

const misano = { dateStart: "2026-09-11", dateEnd: "2026-09-13" };
const finishedRace = { id: "s1", type: "RAC" as const, dateUtc: "2026-09-13T14:00:00+00:00", status: "FINISHED" };
const upcomingRace = { ...finishedRace, status: "NOT-STARTED" };

describe("effectiveStart", () => {
  it("trusts the timestamp of a session that has actually happened", () => {
    expect(effectiveStart(finishedRace, misano).toISOString()).toBe("2026-09-13T14:00:00.000Z");
  });

  it("puts an unrun Grand Prix on the event's final day", () => {
    // Valencia: the event runs 27-29 Nov but upstream dates its sessions 21-22 Nov.
    const valencia = { dateStart: "2026-11-27", dateEnd: "2026-11-29" };
    const session = { id: "v", type: "RAC" as const, dateUtc: "2026-11-22T14:00:00+00:00", status: "NOT-STARTED" };
    expect(effectiveStart(session, valencia).toISOString()).toBe("2026-11-29T14:00:00.000Z");
  });

  it("puts an unrun sprint the day before the Grand Prix", () => {
    const valencia = { dateStart: "2026-11-27", dateEnd: "2026-11-29" };
    const session = { id: "v", type: "SPR" as const, dateUtc: "2026-11-21T15:00:00+00:00", status: "NOT-STARTED" };
    expect(effectiveStart(session, valencia).toISOString()).toBe("2026-11-28T15:00:00.000Z");
  });

  it("keeps a night race's time of day", () => {
    // Qatar: upstream dates the GP 6 Nov — inside the window, but the Friday.
    const qatar = { dateStart: "2026-11-06", dateEnd: "2026-11-08" };
    const race = { id: "q", type: "RAC" as const, dateUtc: "2026-11-06T20:00:00+00:00", status: "NOT-STARTED" };
    const sprint = { id: "qs", type: "SPR" as const, dateUtc: "2026-11-05T20:00:00+00:00", status: "NOT-STARTED" };
    expect(effectiveStart(race, qatar).toISOString()).toBe("2026-11-08T20:00:00.000Z");
    expect(effectiveStart(sprint, qatar).toISOString()).toBe("2026-11-07T20:00:00.000Z");
    // And the sprint must come before the race.
    expect(effectiveStart(sprint, qatar).getTime()).toBeLessThan(effectiveStart(race, qatar).getTime());
  });
});

describe("the two-hour gap after a race ends", () => {
  it("estimates the end from the race duration", () => {
    const end = estimatedEnd(finishedRace, misano);
    expect(end.getTime() - new Date(finishedRace.dateUtc).getTime()).toBe(SESSION_DURATION_MINUTES.RAC * 60_000);
  });

  it("fetches exactly two hours after the estimated end", () => {
    const gap = fetchAfter(finishedRace, misano).getTime() - estimatedEnd(finishedRace, misano).getTime();
    expect(gap).toBe(RESULTS_DELAY_MINUTES * 60_000);
    expect(RESULTS_DELAY_MINUTES).toBe(120);
  });

  it("is not due while the race is still running", () => {
    expect(isDue(finishedRace, misano, new Date("2026-09-13T14:30:00Z"))).toBe(false);
  });

  it("is not due one minute before the window closes", () => {
    expect(isDue(finishedRace, misano, new Date("2026-09-13T17:14:00Z"))).toBe(false);
  });

  it("is due once the two hours have passed", () => {
    // 14:00 start + 75 min race + 120 min gap = 17:15
    expect(isDue(finishedRace, misano, new Date("2026-09-13T17:15:00Z"))).toBe(true);
  });

  it("stays due later — a missed run is picked up by the next one", () => {
    expect(isDue(finishedRace, misano, new Date("2026-09-15T09:00:00Z"))).toBe(true);
  });

  it("schedules an unrun race off the event's final day, not the placeholder date", () => {
    const valencia = { dateStart: "2026-11-27", dateEnd: "2026-11-29" };
    const session = { id: "v", type: "RAC" as const, dateUtc: "2026-11-22T14:00:00+00:00", status: "NOT-STARTED" };
    // The placeholder date would have made it due a week early.
    expect(isDue(session, valencia, new Date("2026-11-22T20:00:00Z"))).toBe(false);
    expect(isDue(session, valencia, new Date("2026-11-29T17:15:00Z"))).toBe(true);
  });
});
