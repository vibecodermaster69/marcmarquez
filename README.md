# PHOENIX 93 — The Phoenix Equation

An autonomous MotoGP championship tracker for Marc Márquez (#93), 2026 season.
It ingests results twice a race weekend and answers one question, continuously
and without human intervention:

> What is the minimum Marc must achieve at the next race to still win the title —
> and where will the championship actually be decided?

## Run it — from WSL, not Windows

**This project must be run inside WSL.** `better-sqlite3` is a native module, so
its compiled binary is built for one operating system only. `node_modules` here
holds Linux binaries; running `npm run dev` from Windows PowerShell fails with:

```
better_sqlite3.node is not a valid Win32 application
```

WSL2 forwards ports to Windows, so a dev server started in WSL is reachable at
`http://localhost:3000` in your Windows browser exactly as if it were native.
Vercel and GitHub Actions are Linux too, so this also matches production.

```bash
npm install       # from WSL
npm run seed      # ingest 2024, 2025 and 2026 from motogp.com
npm run dev       # http://localhost:3000
```

If you ever run `npm install` from Windows, delete `node_modules` and reinstall
from WSL before using any of the scripts below.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The dashboard |
| `npm run seed` | Full ingest of 2024–2026 (a few minutes, ~200 requests) |
| `npm run sync` | One unattended sync pass — idempotent, safe to run any time |
| `npm run verify` | Recomputes each championship from raw results and compares to motogp.com |
| `npm run status` | Layer 1's answer for the current championship |
| `npm run model` | Layer 2 distributions and the three minimums |
| `npm run simulate` | Monte Carlo: probability, where it ends, the sensitivity curve |
| `npm run backtest` | Replays past seasons and scores the model against what happened |
| `npm run tune` | Sweeps the model's constant and reports the best-calibrated value |
| `npm run schedule` | When each remaining session will be fetched |
| `npm run retrodict` | Replays 2024/2025 and reports when each title was clinched |
| `npm run inspect -- CAT 2026` | One event's sessions and what they contributed |
| `npm test` | Unit and integration tests |
| `npm run test:live` | Contract tests against the live motogp.com API |

## Architecture

Three layers, and only one of them guesses.

- **Layer 1 — deterministic** (`lib/engine/`). Points, standings, gap, elimination,
  clinch test with tie countback, backward induction from the anchor, the
  three-state classifier. Provable, unit-tested, carries no confidence score.
- **Layer 2 — empirical** (`lib/model/`). Each rider's distribution of weekend
  point hauls, built from current-season form, prior seasons at the same circuit,
  and DNF rate. **Points and DNFs only** — no weather, tyres or conditions.
- **Layer 3 — simulation** (`lib/model/simulate.ts`). Monte Carlo over the
  remaining rounds. Samples **whole historical weekends** rather than each rider
  independently, so correlation between riders comes for free. Produces the title
  probability, its confidence band, the clinch-round distribution, and the
  sensitivity curve (the season re-run once per possible next-race result).

## Is the probability trustworthy?

`npm run backtest` replays 2023-2025 round by round, asks what the model would
have said at the time — using only history available then — and scores it.

Three seasons is all the valid history there is: **sprints began in 2023**, and
earlier weekends max out at 25 points instead of 37, which would corrupt both
the sampling pool and the arithmetic.

Results over 192 predictions (2024-2025):

| | Brier (lower is better) |
|---|---|
| **Phoenix model** | **0.0206** |
| baseline: whoever leads wins | 0.0313 |
| baseline: proportional to points | 0.1128 |

Overall bias 0.0pp, and the large calibration buckets land within a couple of
points of the diagonal.

**The simulation samples the current season only.** Prior seasons describe
different riders: Marc rode a Honda in 2023 and a year-old Gresini bike in 2024,
and Martin missed most of 2025 injured. Widening the pool triples the error —
0.0206 on one season, 0.0587 on two, 0.0916 on four — so `POOL_SEASONS` is 1.

**An absent rider scores zero rather than erasing the weekend.** Discarding
weekends where a rider was missing silently removed the rounds where a rival was
hurt, which are exactly the rounds the others profited from. In 2026 that dropped
Marc's Brno win and his perfect Sachsenring weekend. With absences counted as
zeros the pool reconciles exactly to the championship table, and a test asserts it.

**Six riders are carried, not three.** A title fight changes shape: if the third
man crashes out, the threat becomes whoever is behind him. `CONTENDER_DEPTH`
follows the standings rather than naming riders.

Deterministic and model output never share a lane: the UI tags them `PROVEN` and
`MODEL`, and no probability is displayed until Layer 3 exists.

## Data

`api.motogp.pulselive.com` — the JSON API motogp.com itself renders from. No
HTML scraping. Ingest is idempotent (upsert on session + rider), validated
(published points must match the position they earn), and self-healing (a missed
sync pass is picked up by the next one).

Results are fetched **two hours after each race is expected to end**, never on a
fixed clock — most 2026 rounds settle around 22:45–23:10 IST, and Qatar not until
04:45 IST the following morning.
