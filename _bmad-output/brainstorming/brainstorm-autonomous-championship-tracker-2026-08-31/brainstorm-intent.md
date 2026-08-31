# PHOENIX 93 — Brainstorm Intent

**Date:** 2026-08-31 · **Mode:** Creative Partner · **Source:** `.memlog.md` (50 entries)

## What we are building

An autonomous MotoGP championship tracker for Marc Márquez (#93), 2026 season. It ingests results twice a race weekend and answers one question, continuously and without human intervention:

> **What is the minimum Marc must achieve at the next race to still win the 2026 championship — and where will the title actually be decided?**

## The hard constraints

1. **Zero user input.** No controls, dials, toggles or what-if mode. The app observes, computes, displays.
2. **Points are the only source of truth.** No weather, no tyre compounds, no conditions modelling anywhere in the pipeline. *"If your championship depends on rain, you don't deserve to be champion."*
3. **Deterministic math and model predictions never mix** in the same number or the same visual lane.
4. **2026 and Marc only** — but nothing in the engine is Marc-specific.

## The core mechanic: the anchor and the ratchet

The model is anchored on a **base end-state**: *Marc is champion by scoring P3 at Valencia.*

Every session result rewrites the required trajectory by backward induction from that anchor:

- Bank more than the path demands → downstream requirements **ease** (Valencia podium → P5 → P10) and the anchor **walks backward** to an earlier round.
- Fall below it → requirements **tighten** and the anchor slides toward the final round.

The product isn't reporting points. It's reporting **how much freedom Marc has bought himself.**

## The anchor requirement: one scalar, three states

| Required at the anchor | State | What the app shows |
|---|---|---|
| **> 37 pts** (more than a perfect weekend) | Out of Marc's hands — self-driven confidence 0% | Stops showing Marc a target; switches to what the P1/P2/P3 riders must fail to do |
| **1–37 pts** | Live fight | The minimum position (sprint + GP), probability, confidence band |
| **0 pts** (P22, or a DNF, still crowns him) | Already decided before the anchor | Anchor collapses backward — crowned at Portimão, Valencia irrelevant |

## Architecture: three layers, only one of which guesses

- **L1 — Deterministic.** Points tables, standings, gap, max available, mathematical elimination, clinch test with tie countback, backward induction. Provable, unit-tested, carries no confidence score.
- **L2 — Rival point-haul distributions.** Not "will Martín win Misano" but "what range of points does Martín leave a weekend with." Built from season form, 2-year circuit history and DNF rate. **Points and DNFs only.** *Rivals are parameters, not entities.*
- **L3 — Monte Carlo.** 10,000 simulations of the remaining rounds. **Samples whole historical weekends**, not each rider independently — inter-rider correlation comes for free, no covariance matrix.

One engine drives all four screens. The minimum-position curve is the same simulation run 16 times, conditioned on Marc finishing P1…P15/DNF at the next race.

## Key insights from the session

- **"What he *can* score vs what he *needs* to score are different things."** The spine of the architecture — two lanes, never mixed. The gap between them is the headline.
- **The model never needs a prediction, only a range.** This is why it is buildable with no machine learning.
- **The no-input constraint created the core mechanic.** With no controls, the anchor must recompute itself — which is what turns a calculator into the ratchet.
- **Killing weather gives it back for free.** Sampling whole historical weekends already embeds wet races, red flags and multi-rider crashes in the correlation structure.
- **"History predicts form" is the shakiest assumption.** History sizes the *variance*, not the *expectation*.
- **Rivals are positional, not named.** Whoever holds P1–P3 on race morning — Álex Márquez can walk in uninvited.
- **Rival assumption: 75th percentile.** Assume rivals ride well, making the displayed minimum demanding and safe. Under-promise — a target Marc beats builds trust; one he falls short of is worthless.

## Validation

A probability is "accurate" if it is **calibrated**, not if it picks winners.

- Backtest 2024 and 2025 round by round against known outcomes.
- Brier score + reliability curve: when it says 70%, does it happen ~70% of the time?
- Must beat two baselines: "current leader wins" and "proportional to points."
- Confidence band from bootstrapping the input distributions. **Never display a probability without its band.**
- L1 gets unit tests asserting it reproduces known historical clinch rounds exactly.

## Scope

**MUST** — 2026 calendar seed · auto-fetch Sat + Sun 8pm IST, idempotent, logged · L1 engine · anchor + backward induction · three-state machine · L2 distributions at p75 · L3 Monte Carlo with band and clinch-round distribution · per-round snapshots · one page (standings, minimum, probability, where it ends)

**SHOULD** — 2024/25 backtest with Brier + reliability curve · sensitivity curve P1→DNF

**WON'T** — any user input · rider-switching UI · AI explanation layer · live mid-session timing · all weather, tyre and conditions features
