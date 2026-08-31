import type { SessionType } from "../db/schema";

/** One rider's result in one scoring session — the engine's only raw input. */
export interface ResultRow {
  riderId: string;
  sessionType: SessionType;
  position: number | null;
  points: number;
}

export interface RiderStanding {
  riderId: string;
  points: number;
  /** Finishing-position tally used for countback: index 0 is wins, 1 is seconds, and so on. */
  positionCounts: number[];
  position: number;
}

export interface ChampionshipState {
  standings: RiderStanding[];
  roundsRemaining: number;
  pointsAvailable: number;
}

/**
 * How many points a rival is assumed to take in a remaining round.
 *
 * Layer 1 ships only the two assumption-free bounds (max and zero). The
 * credible p75 assumption arrives with the Layer 2 distributions in M5, and
 * plugs in here without the engine changing.
 */
export type RivalAssumption = (riderId: string, roundIndex: number) => number;

export type ChampionshipStatus = "OUT_OF_HIS_HANDS" | "LIVE_FIGHT" | "ALREADY_DECIDED";
