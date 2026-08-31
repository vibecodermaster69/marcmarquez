# PHOENIX 93 — Build Sequence

Ordered so that **every milestone ends with something real on screen.** Nothing here requires user input; the app has no controls by design.

Current state: Next.js 14 + React 18 skeleton. `app/page.tsx` is a single 81-line client component with hardcoded standings, race list and `probability = 54`. Good shell, no engine.

---

## M1 — Seed data and schema

The calendar is known and fixed for 2026, so it is static seed data, not a fetch.

```
riders                id, name, number, team, active
circuits              id, name, country, short_name
events                id, round, circuit_id, season, sprint_datetime, gp_datetime
sessions              id, event_id, type(SPRINT|GP), status, completed_at
session_results       id, session_id, rider_id, position, points, dnf
championship_snapshots id, event_id, session_id, taken_at, standings_json,
                       marc_points, gap_to_leader, required_now, anchor_round,
                       anchor_condition, state, probability, confidence_low, confidence_high
sync_log              id, ran_at, target, status, rows_written, error
```

Seed: 2026 calendar (all rounds), riders, circuits, and **all completed 2026 results to date** plus the full **2024 and 2025 seasons** — the latter two are required by L2 and by the backtest, so load them now rather than twice.

`championship_snapshots` is written once per session ingested. It is what makes the probability a *history* rather than a number, and it is the backtest's output table too.

**Done when:** the database answers "Marc 237, Martín 256, 9 rounds, 333 available" from real rows.

---

## M2 — Layer 1 engine (pure, no I/O)

`lib/engine/` — pure functions, no database, no network, fully unit-tested.

- Points tables and weekend-haul arithmetic
- Standings, gap, points available
- Mathematical elimination
- Clinch test **with tie countback on wins**
- Backward induction from the anchor → `required_now`
- Anchor migration (the ratchet)
- Three-state classifier

**Tests before implementation.** Assert the engine reproduces the *known* mathematical clinch rounds of 2024 and 2025 exactly. If it can't reproduce history it cannot be trusted on the future.

**Done when:** `computeMinimum(state)` returns a position for Misano that you can verify by hand.

---

## M3 — Wire the frontend to the engine

The existing page is kept; the constants come out and the engine's outputs go in.

Replace in `app/page.tsx`:
- `standings[]` → live top-3 + Marc from the database
- `races[]` → the events table with real status
- `237 / −19 / 9 / 2.22` → engine outputs
- `probability = 54` → **leave it out at this stage.** No fake number ships. Render "the minimum" and the state instead.

Add the two components that carry the product:
- **The Minimum** — headline position for the next weekend, with the sprint+GP split beneath
- **State banner** — `OUT_OF_HIS_HANDS` / `LIVE_FIGHT` / `ALREADY_DECIDED`, and in the first state it shows what rivals must fail to do rather than what Marc must do

**Done when:** the deployed page tells you, from real data, what Marc needs at Misano. This milestone alone is a shippable product.

---

## M4 — The ingest scheduler

Two crons, race weekends only (the calendar is known, so nothing runs on a Tuesday):

- **Saturday 20:00 IST** — sprint result
- **Sunday 20:00 IST** — GP result

Requirements:
- **Idempotent upsert** keyed on `(session_id, rider_id)` — a re-run must never double-count points
- Validate before writing: positions unique, points match the table for the position, field size sane. A malformed fetch is rejected, logged, and leaves the previous snapshot standing
- Write a `championship_snapshots` row after every successful ingest
- Every run writes to `sync_log`, success or failure
- Recompute the engine and revalidate the page on write

> **Timezone note:** 8pm IST works for most rounds but Motegi and Phillip Island finish well before it and Qatar/Valencia after. Prefer scheduling **relative to each event's `gp_datetime` + a fixed delay**, with the 8pm IST cron as the backstop sweep. Same guarantee, no missed or premature reads.

**Done when:** a weekend passes and the page updates with no one touching it.

---

## M5 — Layer 2 distributions

`lib/model/distributions.ts`

- Empirical weekend-haul distribution per tracked rider from 2026 season form
- Circuit-specific hauls from 2024/2025 at the same circuit
- DNF rate as mass at zero
- Expose `p50` and `p75`; L1's backward induction switches from placeholder assumptions to these

**Points and DNFs only.** Nothing about conditions enters the pipeline.

**Done when:** the minimum at Misano changes because rival form changed, not because a constant did.

---

## M6 — Layer 3 Monte Carlo

`lib/model/simulate.ts`

- 10,000 sims over the remaining rounds, **sampling whole historical weekends** so rider correlation is preserved
- Title probability
- Clinch-round distribution → the "where it ends" bar chart
- 16 conditional runs (P1…P15, DNF) → the sensitivity curve
- Bootstrap the input distributions → confidence band

Runs inside the ingest job, not on page load. Results land in the snapshot row.

**Done when:** the probability meter is real, and it always renders with its band.

---

## M7 — Backtest and calibration *(SHOULD)*

`scripts/backtest.ts`

- Replay 2024 and 2025 round by round, emitting a probability at each
- Brier score
- Reliability curve — bucket predictions and plot against outcomes
- Compare against baselines `leader wins` and `probability ∝ points`
- **Tune the p75/p50 rival/Marc assumption here**, on evidence

**Done when:** you can state the model's calibration error as a number, and it beats both baselines.

---

## Ordering rationale

M1→M3 ships a genuinely useful tracker with zero modelling risk — the arithmetic is provable and the page is live. M5→M6 layer the probability on top of a foundation that already works. M7 is what lets you defend the number. If the schedule compresses, M7 slips; nothing else does.
