# PHOENIX 93 — Engine Specification

The math only. Everything here derives from the session decisions in `.memlog.md`.

---

## 0. Constants

```
GP_POINTS     = [25,20,16,13,11,10,9,8,7,6,5,4,3,2,1]   # P1..P15
SPRINT_POINTS = [12,9,7,6,5,4,3,2,1]                     # P1..P9
MAX_WEEKEND   = 37
```

State at build time (2026-08-31, post-Aragón): 9 rounds remain → **333 points available**.
Marc P2 on 237, Martín P1 on 256 (gap −19), Bezzecchi P3 on 232.

---

## Layer 1 — Deterministic

No probability. Every function here is pure, total, and unit-tested. It carries **no confidence score** because it cannot be wrong.

### 1.1 Primitives

```
points_available(rounds_remaining) = rounds_remaining * 37
gap(rider, leader)                 = leader.points - rider.points
```

### 1.2 Mathematical elimination

A rider is eliminated when no sequence of remaining results can reach the leader:

```
eliminated(r) ⟺ gap(r, leader) > points_available(rounds_remaining)
```

### 1.3 Clinch test

After round `k`, with Marc on `M`, each rival `i` on `R_i`, and `P` points still available:

```
clinched ⟺ ∀i:  M > R_i + P
            ∨ ( M == R_i + P  ∧  countback_favours_marc(i) )
```

`countback_favours_marc` compares **race wins**, then P2 counts, then P3 counts, per FIM tie rules. Equality is only a clinch when the countback is already mathematically secured — otherwise treat as not-yet-clinched.

### 1.4 Backward induction — the minimum

Inputs:
- `A` — the anchor round (initially Valencia, the final round)
- `C` — the anchor condition (initially P3 → its weekend points `p_A`)
- `s_i(r)` — rival `i`'s assumed haul at round `r` (Layer 2, **75th percentile**)
- `m(r)` — Marc's assumed haul at intermediate rounds after the next one (Layer 2, **50th percentile**)

```
R_i_final    = R_i_now + Σ_{r ∈ remaining} s_i(r)
required_tot = max_i(R_i_final) + 1 - M_now          # points Marc needs across all remaining rounds
required_now = required_tot - p_A - Σ_{r ∈ (next, A)} m(r)
```

`required_now` is the points Marc must take **this weekend**. Convert to the displayed minimum by finding the lowest-scoring sprint+GP combination whose total ≥ `required_now`, and report it as a position pair (e.g. *"Sprint P4 + GP P5"* → headline **P5**).

> **The one asymmetry, and it is deliberate:** rivals are assumed at p75 (they ride well), Marc at p50 (he rides normally). This is what makes the number demanding and safe. If Marc's future rounds were assumed at 37 the minimum would collapse to P22 every week and mean nothing. **The p75/p50 pair is the engine's only tunable constant — the backtest settles its final value.**

### 1.5 Anchor migration

After every session, recompute the earliest round `A'` at which `clinched` can become true under the same assumptions. If `A' < A`, the anchor **walks backward** and every downstream requirement is recomputed against it. This is the ratchet.

### 1.6 The three states

```
required_now > 37   → OUT_OF_HIS_HANDS   # self-driven confidence 0%; render rival-dependency view
1 ≤ required_now ≤ 37 → LIVE_FIGHT       # render the minimum position
required_now ≤ 0    → ALREADY_DECIDED    # anchor collapses earlier; render the coronation round
```

---

## Layer 2 — Rival point-haul distributions

The only modelled component. It answers **"what range of points does this rider leave a weekend with"** — never "who wins."

For each tracked rider (Marc + whoever holds P1–P3), build an empirical distribution over weekend hauls `0…37` from:

1. **Current-season weekend hauls** — the actual list, resampled. Non-parametric, nothing fitted.
2. **Circuit-specific hauls from the last 2 years** at that same circuit, weighted alongside (1).
3. **DNF rate** — the probability mass at 0.

**Inputs are points and DNFs only.** No weather, no tyres, no conditions. Read the p50 and p75 off this distribution for Layer 1.

> Rivals are **positional, not named**: the set is whoever occupies P1–P3 in the standings, recomputed each round. Álex Márquez enters the model the moment he holds a top-3 place.

---

## Layer 3 — Monte Carlo

`N = 10,000` simulations over the remaining rounds.

### 3.1 The sampling rule

**Draw whole historical weekends, not per-rider results.** Each simulated round samples one real past weekend and takes every tracked rider's actual result from it together.

This preserves inter-rider correlation for free — the wet race that took out three riders stays a wet race that took out three riders. No covariance matrix, no conditions model, and it is why cutting weather cost the model nothing.

### 3.2 Outputs

| Output | Derivation |
|---|---|
| **Title probability** | fraction of sims where Marc is champion |
| **Where it ends** | distribution of the clinch round across sims → bar per circuit, plus a "Marc does not win it" tail |
| **Minimum-position curve** | run the same sim **16 times**, each conditioned on Marc finishing P1…P15/DNF at the next round. Each yields a probability. The curve *is* the sensitivity model (P1 → 71%, P3 → 62%, P8 → 44%, DNF → 19%) |
| **Confidence band** | bootstrap the L2 input distributions, re-run, take the spread of the resulting probability |

16 × 10,000 sims over ≤9 rounds is milliseconds. No optimisation needed.

---

## Validation

Accuracy for a probability means **calibration**, not picking winners.

1. **Backtest 2024 and 2025.** Replay each season round by round; emit a probability at every round; compare to known outcomes.
2. **Brier score** across all backtest predictions.
3. **Reliability curve.** Bucket predictions — of all the times the model said ~70%, did it happen ~70% of the time? Deviation from the diagonal is the model's real error.
4. **Beat two baselines** or the model isn't earning its keep: `current leader wins` and `probability ∝ points`.
5. **Tune p75/p50 on the backtest**, not on intuition.
6. **L1 unit tests** assert exact reproduction of known historical clinch rounds and tie-countback outcomes.

**Display rule: never render a probability without its confidence band.**

---

## Separation of concerns — non-negotiable

| Deterministic (L1) | Predicted (L2/L3) |
|---|---|
| Points, gap, points available | Title probability |
| Mathematical elimination | Confidence band |
| Clinch test, tie countback | Clinch-round distribution |
| The minimum position | The sensitivity curve |

These must never share a number or a visual lane. The minimum is arithmetic and is stated flatly; the probability is a model output and always carries its band.
