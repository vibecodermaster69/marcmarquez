# PHOENIX 93 — MotoGP Championship Strategy Tracker

## Project Codename
**PHOENIX 93**

## Product Title
**The Phoenix Equation — #93 Road to World Champion**

## Objective

Build a full-stack MotoGP championship strategy web application focused initially on **Marc Márquez (#93)**.

The app should automatically pull MotoGP race/session/championship data, track the current title standings, calculate what Marc needs to finish in upcoming Sprint and Grand Prix races to win the championship, and let the user simulate future race results.

The system must be designed so Marc is only the initial tracked rider. The underlying calculation engine should be generic enough to support any MotoGP rider later.

---

# 1. Core Product Idea

The application answers one primary question:

> **Where does Marc Márquez need to finish from the next race onward to win the MotoGP championship?**

The app should combine:

1. Current championship standings
2. Remaining rounds
3. Sprint and Grand Prix points
4. Marc's gap to his championship rivals
5. Mathematical minimum-finish scenarios
6. Track-specific predictions
7. Historical rider performance
8. Current-season form
9. Championship simulations
10. Automated MotoGP result updates

The application should clearly separate:

- **FACTUAL championship mathematics**
- **MODEL/PREDICTION estimates**

Never mix deterministic calculations with AI/model predictions.

---

# 2. Initial Riders to Track

Primary rider:

- Marc Márquez — #93

Main championship rivals initially:

- Jorge Martín
- Marco Bezzecchi

However, do not hardcode these three riders into the championship engine.

Use something conceptually like:

```ts
trackedRiderId
rivalRiderIds[]
```

Eventually the user should be able to choose any tracked rider.

---

# 3. Main User Experience

The home page should immediately communicate the championship situation.

Example layout:

```text
JORGE MARTÍN
256 pts

MARC MÁRQUEZ #93
237 pts
-19

MARCO BEZZECCHI
232 pts
-5 vs Marc
```

Then display:

```text
TITLE GAP
-19

ROUNDS REMAINING
9

MAXIMUM POINTS AVAILABLE
333

AVERAGE GAIN REQUIRED PER WEEKEND
2.22 pts
```

Also include a visual championship status:

```text
BEHIND SCHEDULE
DAMAGE LIMITATION
ON SCHEDULE
AHEAD OF SCHEDULE
CHAMPIONSHIP LEADER
WORLD CHAMPION
```

---

# 4. MotoGP Points System

The points engine must be configurable.

## Grand Prix

| Position | Points |
|---|---:|
| P1 | 25 |
| P2 | 20 |
| P3 | 16 |
| P4 | 13 |
| P5 | 11 |
| P6 | 10 |
| P7 | 9 |
| P8 | 8 |
| P9 | 7 |
| P10 | 6 |
| P11 | 5 |
| P12 | 4 |
| P13 | 3 |
| P14 | 2 |
| P15 | 1 |

## Sprint

| Position | Points |
|---|---:|
| P1 | 12 |
| P2 | 9 |
| P3 | 7 |
| P4 | 6 |
| P5 | 5 |
| P6 | 4 |
| P7 | 3 |
| P8 | 2 |
| P9 | 1 |

All other finishing positions and DNFs = 0 unless MotoGP rules change.

Store this configuration in code or DB so it can be updated easily.

---

# 5. Main App Modes

The application should have at least four primary sections.

## A. LIVE

Shows the current championship situation.

Display:

- Latest official Sprint result
- Latest official Grand Prix result
- Current championship standings
- Marc's championship deficit/lead
- Gap to nearest rival
- Remaining rounds
- Maximum remaining points
- Required average gain per weekend
- Last data synchronization timestamp

Example:

```text
CURRENT GAP: -19

Marc needs to gain:
20 points over Jorge Martín

Rounds remaining:
9

Required gain:
2.22 points per weekend
```

---

## B. STRATEGY

This is the most important section.

For each remaining track, show:

- Circuit
- Country
- Event date
- Track direction
- Expected Marc strength
- Expected Martín strength
- Expected Bezzecchi strength
- Suggested Marc target
- Minimum safe finish
- Risk classification

Example:

```text
MISANO

Marc expected strength:
★★★★☆

Martín:
★★★★☆

Bezzecchi:
★★★★★

TARGET:
P1–P3

MINIMUM SAFE:
P3

STRATEGY:
CONTROL

RISK:
HIGH BEZZECCHI THREAT
```

Possible strategy labels:

- MAXIMUM ATTACK
- ATTACK
- SCORE HEAVILY
- CONTROL
- DAMAGE LIMITATION
- SURVIVE

---

# 6. Minimum Finish Matrix

Build a deterministic engine that calculates what Marc needs to finish given rival results.

Example question:

> Martín finishes P3 in the Grand Prix. What is the lowest position Marc can finish and still gain championship points on him?

Expected answer:

```text
Martín P3 = 16 points

Marc:
P2 = 20 → gains 4
P3 = 16 → neutral
P4 = 13 → loses 3

Minimum finish to gain:
P2
```

The engine should support:

- Sprint only
- Grand Prix only
- Whole weekend combined

---

# 7. Scenario Matrix

For each track, generate a scenario matrix.

Example:

| Martín | Bezzecchi | Marc minimum target | Status |
|---|---|---|---|
| P1 | P2 | P2 / damage limitation | RED |
| P2 | P3 | P1 | GREEN |
| P3 | P2 | P2 | GREEN |
| P3 | P3 | P2 | GREEN |
| P4 | P3 | P3 | GREEN |
| P4 | P4 | P3 | GREEN |
| P5 | P4 | P4 | GREEN |
| P5+ | P5+ | P4/P5 | GREEN |

This must be computed dynamically, not hardcoded.

---

# 8. Full Weekend Simulator

Allow the user to manually choose Sprint and Race results.

Example:

## Sprint

```text
Marc: P2
Martín: P4
Bezzecchi: P1
```

## Grand Prix

```text
Marc: P1
Martín: P3
Bezzecchi: P2
```

The UI should instantly update:

```text
BEFORE MISANO

Martín 256
Marc   237
Bez    232
```

Then:

```text
AFTER SIMULATION

Martín 278
Marc   271
Bez    261
```

And:

```text
MARC GAP

Before: -19
After:  -7

GAIN THIS WEEKEND:
+12
```

The remaining championship strategy should then automatically recalculate.

---

# 9. Simulate Rest of Season

Add a major CTA:

> **SIMULATE THE REST OF THE SEASON**

User should be able to select results for every remaining Sprint and Grand Prix.

Then display:

- Final championship standings
- Champion
- Marc's final points
- Margin
- Required combinations where another rival can still beat Marc

Example:

```text
FINAL STANDINGS

1. Marc Márquez     505
2. Jorge Martín     499
3. Marco Bezzecchi  482

MARC MÁRQUEZ
WORLD CHAMPION
+6 points
```

---

# 10. Mathematical Championship Engine

Create a reusable domain service.

Suggested module:

```text
ChampionshipStrategyEngine
```

Responsibilities:

- Current rider standings
- Remaining available points
- Rival gap calculation
- Tie scenarios
- Required point gain
- Minimum finish calculations
- Remaining championship viability
- Mathematical elimination
- Championship-clinch detection
- Scenario generation

Suggested interface:

```ts
interface ChampionshipState {
  standings: RiderStanding[];
  remainingRounds: Round[];
  trackedRiderId: string;
}

interface ChampionshipResult {
  trackedRiderPoints: number;
  rivals: RivalStatus[];
  pointsRemaining: number;
  minimumRequiredGain: number;
  canStillWin: boolean;
  hasClinched: boolean;
}
```

---

# 11. Championship Status Logic

Possible status values:

```ts
type ChampionshipStatus =
  | "ELIMINATED"
  | "TITLE_RISK"
  | "BEHIND_SCHEDULE"
  | "DAMAGE_LIMITATION"
  | "ON_SCHEDULE"
  | "AHEAD_OF_SCHEDULE"
  | "CHAMPIONSHIP_LEADER"
  | "MATCH_POINT"
  | "WORLD_CHAMPION";
```

These should be derived mathematically where possible.

---

# 12. Phoenix Projection

Preserve the original "Phoenix" prediction concept.

The app should store two curves:

1. Original Phoenix prediction
2. Actual championship progression

Example graph:

```text
Championship deficit

-170 ─────────────── original start
      \
       \
        -100
           \
            -60
               \
                -19  ← current
                   \
                     0
```

Show something like:

```text
MARC IS 43 POINTS AHEAD OF THE ORIGINAL PHOENIX PROJECTION
```

This allows us to compare the original comeback theory with reality.

---

# 13. Track-Specific Strategy

Initial remaining-track strategy model should support labels like:

## Misano
Strategy: CONTROL

## Austria
Strategy: SCORE HEAVILY

## Motegi
Strategy: ATTACK

## Mandalika
Strategy: SURVIVE

## Phillip Island
Strategy: MAXIMUM ATTACK

## Sepang
Strategy: CONTROL

## Qatar
Strategy: DAMAGE LIMITATION

## Portimão
Strategy: ATTACK

## Valencia
Strategy: CONDITIONAL / TITLE DECIDER

Do not permanently hardcode this exact list.

Track strategy should eventually derive from a prediction model.

---

# 14. Prediction Model

V2 should support rider-performance predictions.

Each rider gets a circuit strength score based on features such as:

- Historical wins
- Historical podiums
- Historical DNFs
- Qualifying history
- Sprint performance
- Race pace
- Current-season form
- Last 3 rounds
- Last 5 rounds
- Track direction
- Clockwise / anti-clockwise
- Track style
- Braking-heavy
- Flowing
- Stop-and-go
- High-speed
- Low-grip
- Manufacturer performance
- Weather where available

Suggested output:

```json
{
  "circuit": "Phillip Island",
  "riders": {
    "marc_marquez": {
      "win_probability": 0.42,
      "podium_probability": 0.72
    },
    "jorge_martin": {
      "win_probability": 0.25,
      "podium_probability": 0.58
    },
    "marco_bezzecchi": {
      "win_probability": 0.18,
      "podium_probability": 0.49
    }
  }
}
```

Always label these as model estimates.

---

# 15. Monte Carlo Championship Simulation

V2 should run Monte Carlo simulations of the remaining championship.

Suggested default:

```text
100,000 simulations
```

Output:

```text
TITLE PROBABILITY

Marc Márquez       48.6%
Jorge Martín       35.1%
Marco Bezzecchi    16.3%
```

Simulation should respect:

- Track probability distributions
- Sprint distributions
- Race distributions
- Crash/DNF probability
- Rider form
- Current championship state

Store each simulation run with:

- timestamp
- source data snapshot
- model version
- simulation count
- probability results

---

# 16. MotoGP Data Source

Potential read-only data source:

```text
https://api.motogp.pulselive.com/motogp/v1
```

Treat this as an unofficial/undocumented dependency unless official documentation is found.

The application should abstract MotoGP data behind a provider interface:

```ts
interface MotoGPDataProvider {
  getSeason(): Promise<Season>;
  getEvents(): Promise<Event[]>;
  getSessions(eventId: string): Promise<Session[]>;
  getSessionResults(sessionId: string): Promise<SessionResult[]>;
  getChampionshipStandings(): Promise<RiderStanding[]>;
}
```

Implementation:

```text
PulseLiveMotoGPProvider
```

This allows replacing the data source later.

---

# 17. Data Sync Strategy

Do not hammer MotoGP endpoints.

Normal schedule:

```text
every 6–12 hours
```

Race weekend:

```text
poll more frequently around session completion
```

Ideal logic:

1. Check active event
2. Detect latest session
3. Check session status
4. If session is officially completed:
   - fetch results
   - normalize
   - save
   - update standings
   - store championship snapshot
   - rerun calculations
   - rerun predictions if enabled

---

# 18. Cron / Scheduler

Possible implementation options:

## Vercel Cron

Example:

```text
/api/cron/sync-motogp
```

## GitHub Actions

Could run:

```text
every 6 hours
```

or use race-weekend frequency.

Cron should call a protected endpoint using a secret.

Example:

```text
CRON_SECRET
```

Never expose it client-side.

---

# 19. Database

Recommended:

**PostgreSQL via Supabase**

Suggested tables:

```text
seasons
events
circuits
riders
teams
manufacturers
sessions
session_results
championship_standings
championship_snapshots
track_rider_scores
predictions
simulation_runs
phoenix_projections
sync_logs
```

---

# 20. Suggested Schema

## riders

```text
id
external_id
first_name
last_name
number
slug
nationality
team_id
manufacturer_id
active
created_at
updated_at
```

## circuits

```text
id
external_id
name
country
country_code
track_direction
track_type
created_at
updated_at
```

## events

```text
id
external_id
season_id
circuit_id
name
start_date
end_date
status
created_at
updated_at
```

## sessions

```text
id
external_id
event_id
type
start_time
status
created_at
updated_at
```

Session types:

```text
PRACTICE
QUALIFYING
SPRINT
RACE
```

## session_results

```text
id
session_id
rider_id
position
points
status
gap
grid_position
fastest_lap
created_at
```

## championship_snapshots

```text
id
season_id
event_id
session_id
captured_at
standings_json
```

Never overwrite snapshots.

---

# 21. API Routes

Suggested internal API:

```text
GET /api/standings

GET /api/events

GET /api/events/:id

GET /api/events/:id/results

GET /api/strategy/current

POST /api/strategy/scenario

POST /api/simulator/weekend

POST /api/simulator/season

GET /api/predictions

POST /api/predictions/run

GET /api/phoenix

POST /api/cron/sync-motogp
```

---

# 22. Scenario API

Example:

```http
POST /api/strategy/scenario
```

Request:

```json
{
  "trackedRider": "marc-marquez",
  "event": "misano",
  "martin": {
    "sprint": 3,
    "race": 3
  },
  "bezzecchi": {
    "sprint": 2,
    "race": 2
  }
}
```

Response:

```json
{
  "marcMinimum": {
    "sprint": 2,
    "race": 2
  },
  "expectedGainVsMartin": 6,
  "expectedLossVsBezzecchi": 0,
  "status": "ON_SCHEDULE"
}
```

---

# 23. UI / Visual Direction

The design should feel like:

- MotoGP paddock telemetry
- Championship war room
- Ducati race strategy
- Dark premium motorsport dashboard
- Phoenix comeback theme

Visual theme:

```text
Background:
near-black / charcoal

Primary:
Ducati-inspired red

Secondary:
burnt orange / phoenix amber

Text:
white / warm gray

Success:
green

Warning:
amber

Danger:
red
```

Use subtle gradients, not excessive glow.

---

# 24. Homepage Hero

Suggested copy:

```text
THE PHOENIX EQUATION

#93
ROAD TO WORLD CHAMPION

CURRENT GAP
-19
```

Below:

```text
9 ROUNDS
333 POINTS AVAILABLE
2.22 POINTS/WEEKEND REQUIRED
```

Main CTA:

```text
WHAT DOES MARC NEED?
```

Secondary:

```text
SIMULATE THE CHAMPIONSHIP
```

---

# 25. Track Cards

Each track card should show:

```text
MOTEGI

JAPAN

MARC STRENGTH
★★★★★

STRATEGY
ATTACK

EXPECTED POINTS
30–37

TITLE IMPACT
HIGH
```

Cards should be clickable.

---

# 26. Strategy Color Coding

Use:

```text
GREEN
Championship gain

YELLOW
Neutral / acceptable

ORANGE
Damage limitation

RED
Championship risk

BLACK/DARK RED
Mathematical elimination
```

---

# 27. Charts

Recommended charts:

## Championship Gap Timeline

X-axis:

```text
race weekends
```

Y-axis:

```text
points behind/ahead
```

Lines:

- Phoenix prediction
- Actual Marc gap

---

## Championship Probability

Line or area chart:

```text
Marc
Martín
Bezzecchi
```

updated after each session.

---

## Points Per Weekend

Grouped display:

```text
Marc
Martín
Bezzecchi
```

---

# 28. Live Result Processing

For V1, do not build true continuous live timing.

Only process official session classifications.

Flow:

```text
Session completed
      ↓
Fetch classification
      ↓
Store result
      ↓
Update standings
      ↓
Create championship snapshot
      ↓
Recalculate Phoenix strategy
      ↓
Update frontend
```

---

# 29. Data Validation

Never trust upstream data blindly.

Validate:

- Rider IDs
- Session IDs
- duplicated results
- missing points
- invalid positions
- duplicate event updates

Use idempotent sync logic.

Suggested unique keys:

```text
session_id + rider_id
```

---

# 30. Sync Logging

Store:

```text
sync_logs
```

Fields:

```text
id
started_at
completed_at
provider
event_id
session_id
status
records_received
records_written
error_message
```

---

# 31. Caching

Use caching because the source API is external and unofficial.

Recommended:

```text
standings:
5–30 minutes on race weekends

events:
24 hours

historical data:
long-term / immutable
```

---

# 32. Error Handling

If the MotoGP source goes offline:

- continue serving last-known standings
- display:

```text
LIVE DATA TEMPORARILY UNAVAILABLE

Last updated:
2026-08-30 18:42 UTC
```

Do not break the app.

---

# 33. Deterministic vs Prediction Separation

This is important.

## Deterministic

These must never use an LLM:

- points
- standings
- minimum finish
- championship gap
- maximum available points
- elimination
- championship clinch
- scenario calculations

## Prediction

These may use models:

- track strength
- expected finish
- win probability
- title probability
- risk score

---

# 34. AI Explanation Layer — Future

Optional later feature:

```text
WHY DID MARC'S TITLE PROBABILITY CHANGE?
```

Example:

```text
Marc's title probability increased from 44% to 51% after Misano because:

• Marc gained 8 points on Martín.
• Phillip Island and Motegi are rated as strong Marc circuits.
• Bezzecchi took points away from Martín.
• The remaining deficit dropped from 19 to 11.
```

The LLM only explains structured calculated data.

It must not calculate championship points itself.

---

# 35. Generic Architecture

Suggested architecture:

```text
MotoGP API
    │
    ▼
Data Provider
    │
    ▼
Sync Service
    │
    ▼
Normalizer
    │
    ▼
PostgreSQL / Supabase
    │
    ├───────────────┐
    │               │
    ▼               ▼
Championship     Prediction
Engine           Engine
    │               │
    └───────┬───────┘
            ▼
        API Layer
            │
            ▼
        Next.js UI
```

---

# 36. Recommended Tech Stack

## Frontend

```text
Next.js
TypeScript
Tailwind CSS
```

## Charts

```text
Recharts
```

## Backend

Start with:

```text
Next.js Route Handlers
```

Later split if necessary.

## Database

```text
Supabase PostgreSQL
```

## Scheduler

```text
Vercel Cron
```

or:

```text
GitHub Actions
```

## Prediction Service

Initially:

```text
TypeScript
```

Later if ML is needed:

```text
Python
FastAPI
```

---

# 37. Suggested Repository Structure

```text
phoenix-93/
│
├── app/
│   ├── api/
│   │   ├── standings/
│   │   ├── events/
│   │   ├── strategy/
│   │   ├── simulator/
│   │   ├── predictions/
│   │   └── cron/
│   │
│   ├── live/
│   ├── strategy/
│   ├── simulator/
│   ├── predictions/
│   └── page.tsx
│
├── components/
│   ├── championship/
│   ├── circuits/
│   ├── charts/
│   ├── simulator/
│   └── ui/
│
├── lib/
│   ├── motogp/
│   │   ├── provider.ts
│   │   ├── pulselive.ts
│   │   ├── normalizer.ts
│   │   └── sync.ts
│   │
│   ├── championship/
│   │   ├── points.ts
│   │   ├── standings.ts
│   │   ├── scenarios.ts
│   │   ├── elimination.ts
│   │   └── strategy-engine.ts
│   │
│   ├── predictions/
│   │   ├── track-strength.ts
│   │   ├── title-probability.ts
│   │   └── monte-carlo.ts
│   │
│   └── db/
│
├── prisma/
│   └── schema.prisma
│
├── scripts/
│   ├── seed.ts
│   └── sync-motogp.ts
│
├── tests/
│   ├── championship/
│   ├── strategy/
│   └── motogp/
│
└── README.md
```

---

# 38. Testing Requirements

The championship engine requires thorough tests.

Examples:

```text
Marc 237
Martín 256

Marc gains 20 points over remaining season

Expected:
Marc finishes ahead
```

Test:

- Sprint points
- GP points
- combined weekend points
- tie cases
- zero points
- DNF
- missing session
- rival finishing above Marc
- Marc mathematically eliminated
- Marc mathematically champion
- one round remaining
- no rounds remaining

---

# 39. Important Championship Tie Handling

Do not assume equal points means Marc wins.

MotoGP championship tie-break rules must be implemented based on official rules.

Until confirmed, represent equal-points outcomes as:

```text
TIE — TIEBREAK REQUIRED
```

Do not guess.

---

# 40. Phase 1 — MVP

Build this first.

## Deliverables

### Data

- MotoGP provider
- season data
- event data
- standings
- session results
- scheduled synchronization

### Championship Engine

- points calculation
- current gap
- remaining points
- required gain
- minimum finish calculations
- mathematical title viability

### UI

- homepage dashboard
- current standings
- remaining rounds
- track cards
- strategy page
- weekend simulator
- championship timeline

---

# 41. Phase 2

Add:

- historical circuit data
- track strength scoring
- rider form
- title probabilities
- Monte Carlo
- Phoenix projected vs actual comparison

---

# 42. Phase 3

Add:

- generic rider selector
- multiple championship views
- shareable scenario URLs
- public profiles
- exportable infographic
- post-race analysis
- race-weekend live dashboard

---

# 43. Shareable Scenario URLs

Eventually scenarios should be linkable.

Example:

```text
/strategy/misano?marc=2,1&martin=4,3&bez=1,2
```

Opening it should restore the simulation.

---

# 44. Export Infographic

Allow users to export a scenario card.

Example:

```text
THE PHOENIX EQUATION

MISANO

MARC P1
MARTÍN P3
BEZ P2

CHAMPIONSHIP GAP

-19 → -11

+8 POINTS RECOVERED
```

Export format:

```text
PNG
1080 × 1350
```

for Instagram.

---

# 45. Mobile First

Most users will view race updates from phones.

Prioritize:

- mobile dashboard
- large championship gap
- swipeable track cards
- simple position selectors
- one-tap simulate button

Desktop can provide full tables.

---

# 46. Performance

Targets:

```text
LCP < 2.5 sec
CLS < 0.1
```

Cache historical data.

Avoid refetching static circuit info repeatedly.

---

# 47. Environment Variables

Suggested:

```env
DATABASE_URL=
DIRECT_URL=

MOTOGP_API_BASE_URL=
CRON_SECRET=

NEXT_PUBLIC_APP_URL=
```

Future:

```env
MODEL_SERVICE_URL=
MODEL_SERVICE_SECRET=
```

---

# 48. Security

- protect cron routes
- validate all simulator input
- rate-limit prediction endpoints
- never expose secrets
- sanitize upstream MotoGP payloads
- use DB constraints

---

# 49. Codex Development Instructions

When implementing:

1. Do not build everything at once.
2. Start with the deterministic championship engine.
3. Write unit tests before UI integration.
4. Abstract MotoGP data behind a provider.
5. Build fixture data so development does not depend on MotoGP API uptime.
6. Make all sync operations idempotent.
7. Preserve championship snapshots.
8. Do not use an LLM for points calculations.
9. Clearly label model outputs as predictions.
10. Avoid hardcoding Marc-specific behavior inside the core engine.
11. Use Marc #93 as the default selected rider only at the UI/config level.
12. Keep the design premium and motorsport-focused rather than generic SaaS.

---

# 50. Recommended Implementation Order

## Step 1

Initialize:

```text
Next.js
TypeScript
Tailwind
Supabase/Postgres
Prisma or Drizzle
```

## Step 2

Create deterministic MotoGP points module.

## Step 3

Create ChampionshipStrategyEngine.

## Step 4

Add unit tests.

## Step 5

Create mock 2026 championship data.

## Step 6

Build dashboard UI.

## Step 7

Build weekend simulator.

## Step 8

Build remaining-season simulator.

## Step 9

Integrate MotoGP data provider.

## Step 10

Add scheduled synchronization.

## Step 11

Persist championship snapshots.

## Step 12

Build Phoenix prediction-vs-actual graph.

## Step 13

Add prediction model.

## Step 14

Add Monte Carlo simulation.

---

# 51. Immediate MVP Screens

Create these routes:

```text
/
```

Dashboard

```text
/strategy
```

Current championship strategy

```text
/simulator
```

Manual championship simulator

```text
/calendar
```

Remaining MotoGP calendar

```text
/history
```

Phoenix prediction vs actual history

---

# 52. Dashboard Wireframe

```text
┌──────────────────────────────────────────┐
│          THE PHOENIX EQUATION            │
│           #93 ROAD TO THE TITLE          │
├──────────────────────────────────────────┤
│                                          │
│                -19                       │
│           CHAMPIONSHIP GAP               │
│                                          │
│   9 ROUNDS      333 PTS      +2.22/RD    │
│                                          │
├──────────────────────────────────────────┤
│ MARTÍN       MARC #93       BEZZECCHI    │
│ 256          237            232          │
├──────────────────────────────────────────┤
│                                          │
│        WHAT DOES MARC NEED?              │
│                                          │
├──────────────────────────────────────────┤
│ NEXT: MISANO                             │
│ TARGET: P1–P3                            │
│ STRATEGY: CONTROL                        │
│                                          │
│ [VIEW STRATEGY]                          │
├──────────────────────────────────────────┤
│                                          │
│ SIMULATE THE REST OF THE SEASON          │
│                                          │
└──────────────────────────────────────────┘
```

---

# 53. Product Philosophy

The application should feel like:

> **A championship engineer sitting beside you while watching MotoGP.**

It should always answer:

```text
What happened?
What changed?
How many points were gained/lost?
What does Marc need next?
What scenarios still win the title?
Where can Marc afford to be conservative?
Where does he need to attack?
```

---

# 54. Final Product Vision

The MVP begins as:

```text
PHOENIX 93
Marc Márquez Championship Strategy Tracker
```

But the underlying product can evolve into:

```text
MotoGP Championship Strategy Engine
```

where any fan selects a rider and instantly sees:

- title probability
- mathematical championship path
- minimum required finishes
- race-by-race strategy
- simulated championship outcomes

Marc Márquez #93 remains the default Phoenix experience.

---

# 55. Key Rule

The core rule for the entire system:

> **Championship mathematics must always be deterministic, reproducible, and explainable. Predictions may guide strategy, but they must never alter factual points calculations.**

---

## First Codex Task

Start by creating:

1. The Next.js project structure
2. MotoGP Sprint + GP points module
3. `ChampionshipStrategyEngine`
4. Unit tests for points/gap/minimum-finish logic
5. Mock standings for Marc, Jorge Martín, and Marco Bezzecchi
6. A basic dashboard using mock data

Do **not** integrate the external MotoGP API until the deterministic engine and tests are working.


---

# 56. CRITICAL PRODUCT BEHAVIOR — LIVING RACE-BY-RACE TRACKER

This is not a static championship landing page.

The product must behave as a **living MotoGP championship tracker** that automatically updates as the season progresses.

The core loop is:

```text
MotoGP race calendar
        ↓
Detect race weekend
        ↓
Scheduled API sync activates
        ↓
Fetch official Sprint / GP classification
        ↓
Store official result
        ↓
Recalculate championship standings
        ↓
Recalculate Marc vs Martín vs Bezzecchi gaps
        ↓
Recalculate minimum-finish scenarios
        ↓
Recalculate title path and race strategy
        ↓
Update UI automatically
```

The application should always represent the latest official championship state.

---

# 57. Calendar-Aware Synchronization

Do not use a single naive once-per-day cron schedule.

The application already knows the MotoGP calendar, so synchronization frequency should depend on whether a race weekend is active.

Recommended behavior:

## Normal Week

```text
sync every 6–12 hours
```

Purpose:

- detect calendar changes
- detect official championship corrections
- keep current event metadata fresh

## Thursday Before Race

```text
sync every ~3 hours
```

## Friday

```text
sync every 30–60 minutes around relevant sessions
```

## Saturday Sprint Window

```text
sync every 5–10 minutes
```

Continue until the Sprint classification is marked final/official.

## Sunday Grand Prix Window

```text
sync every 5–10 minutes
```

Continue until the Grand Prix classification is marked final/official.

## After Session Is Official

Once the system records a final official classification:

```text
stop aggressive polling for that session
```

Persist the result and treat it as immutable unless an upstream correction is detected.

---

# 58. Race Weekend State Machine

Each event should automatically move through states.

Suggested values:

```ts
type EventTrackerState =
  | "UPCOMING"
  | "PRE_RACE"
  | "RACE_WEEKEND"
  | "SPRINT_PENDING"
  | "SPRINT_COMPLETE"
  | "GP_PENDING"
  | "GP_COMPLETE"
  | "WEEKEND_COMPLETE";
```

The UI should change depending on this state.

---

# 59. Pre-Race Homepage State

Before a race weekend, the homepage should show:

```text
NEXT EVENT
MISANO

Starts in:
12 days

CURRENT CHAMPIONSHIP GAP
Marc -19

POINTS MARC MUST RECOVER
+20

ROUNDS REMAINING
9

REQUIRED GAIN
+2.22 points / weekend
```

Also show the calculated current strategy for the upcoming race.

Example:

```text
MISANO

CURRENT STRATEGY
CONTROL

MARC TARGET
P1–P3

MINIMUM SAFE
P3

MAIN THREAT
BEZZECCHI
```

This strategy must be recalculated from the latest championship state.

---

# 60. Sprint-Complete Behavior

Once the official Sprint result is available, automatically ingest it.

Example:

```text
MISANO SPRINT — COMPLETE

Marc       P2   +9
Martín     P4   +6
Bezzecchi  P1   +12
```

Immediately calculate:

```text
Marc gains +3 on Martín
Marc loses -3 to Bezzecchi
```

Then update:

- live standings
- championship gap
- title path
- Sunday minimum-finish combinations
- weekend target
- title pressure
- Phoenix projection comparison

The user should not need to manually refresh data.

---

# 61. Dynamic Sunday Strategy

After Sprint completion and before the Grand Prix, the application becomes a **Sunday strategy board**.

Example:

```text
UPDATED SUNDAY TARGET

If Martín finishes P3:
Marc needs P2 or better

If Martín finishes P4:
Marc needs P3 or better

If Martín finishes P5:
Marc can finish P4 and remain on title trajectory
```

These combinations must be generated dynamically.

Do not hardcode specific positions.

---

# 62. Grand Prix Complete Behavior

Once the Grand Prix classification becomes official:

```text
Fetch final classification
        ↓
Save session result
        ↓
Save championship snapshot
        ↓
Recalculate standings
        ↓
Recalculate title strategy
        ↓
Mark event WEEKEND_COMPLETE
        ↓
Advance NEXT EVENT
```

The completed weekend becomes part of historical tracking.

The next event should automatically become the active strategy target.

---

# 63. Season Timeline

The homepage should contain a horizontal or responsive season timeline.

Example:

```text
SACHSENRING
37 pts
✓

ARAGÓN
37 pts
✓

MISANO
NEXT

AUSTRIA
—

MOTEGI
—

MANDALIKA
—

PHILLIP ISLAND
—

SEPANG
—

QATAR
—

PORTIMÃO
—

VALENCIA
—
```

Statuses:

```text
COMPLETE
ACTIVE
NEXT
UPCOMING
```

Clicking a completed race should show the actual stored result and championship change.

Example:

```text
ARAGÓN

Sprint
P1
+12

Grand Prix
P1
+25

TOTAL
37 / 37

Phoenix target
37

Actual
37

STATUS
PERFECT
```

---

# 64. Championship Gap History

Every official Sprint and Grand Prix update should create a championship snapshot.

Do not only snapshot once per weekend.

Suggested timeline:

```text
Pre-Misano
↓
Misano Sprint
↓
Misano GP
↓
Pre-Austria
↓
Austria Sprint
↓
Austria GP
...
```

This allows the comeback graph to update after every official points-scoring session.

---

# 65. Dynamic Road to the Title

The app should show a living strategy path for every remaining track.

Example:

```text
ROAD TO THE TITLE

MISANO
Minimum target: P2/P3

AUSTRIA
Minimum target: P2/P3

MOTEGI
Attack opportunity

MANDALIKA
Damage limitation

PHILLIP ISLAND
Attack opportunity

SEPANG
Control

QATAR
Damage limitation

PORTIMÃO
Attack

VALENCIA
Conditional
```

IMPORTANT:

These labels are not permanent.

After each official result, recompute the remaining strategy.

---

# 66. Example of Dynamic Recalculation

Suppose Marc gains 14 championship points at Misano.

Before:

```text
Marc gap:
-19
```

After:

```text
Marc gap:
-5
```

The strategy engine could now relax future requirements.

Example:

```text
AUSTRIA
P3 acceptable

MOTEGI
P2 target

MANDALIKA
P5 potentially acceptable
```

Alternatively, if Marc loses 10 points at Misano:

```text
Marc gap:
-29
```

The strategy becomes more aggressive:

```text
AUSTRIA
Podium strongly required

MOTEGI
Win strongly preferred

PHILLIP ISLAND
High-value attack weekend
```

The strategy is therefore a function of:

```text
current championship state
+
remaining maximum points
+
remaining circuits
+
rival position
+
prediction model, if enabled
```

---

# 67. Live Championship Dashboard

The home screen should feel like a **race-control dashboard**, not a static promotional landing page.

Suggested structure:

```text
THE PHOENIX EQUATION                            LIVE DATA ●

2026 WORLD CHAMPIONSHIP

                      MARC #93

                        -19
                  TO CHAMPIONSHIP LEAD


          MARC                         MARTÍN
          237                           256

                   BEZZECCHI
                      232
```

Then:

```text
CURRENT TITLE PATH

Need to recover       +20 pts
Rounds remaining       9
Points remaining      333
Required gain        +2.22 / weekend
```

Then:

```text
NEXT RACE
MISANO

STRATEGY
CONTROL

TARGET
P1–P3

SAFE FLOOR
P3
```

---

# 68. Interactive "If It Finished Like This" Module

Include a simple scenario tool directly on the home/strategy screen.

Example:

```text
IF THE RACE FINISHED LIKE THIS...

Marc        P2
Martín      P3
Bezzecchi   P1
```

As the user changes these values, instantly show:

```text
NEW CHAMPIONSHIP GAP

Marc
-19 → -15

GAIN VS MARTÍN
+4

CHANGE VS BEZZECCHI
-4
```

Also recompute the next-race strategy.

---

# 69. Race Weekend Auto-Mode

The site should automatically switch its primary UI mode depending on where the active event is in the weekend.

## Before Weekend

```text
PRE-RACE
```

Primary focus:

- title gap
- expected track strategy
- minimum targets

## After Sprint

```text
SPRINT COMPLETE
```

Primary focus:

- actual Sprint points
- championship change
- Sunday scenarios

## Before GP

```text
SUNDAY TITLE SCENARIOS
```

Primary focus:

- minimum Marc race finishes
- rival outcome matrix

## After GP

```text
WEEKEND COMPLETE
```

Primary focus:

- full weekend result
- net championship change
- next-race strategy
- Phoenix projection status

---

# 70. Title Pressure Metric

Add a simple derived championship pressure indicator.

Example:

```text
TITLE PRESSURE

████████░░ 78%
```

Meaning:

Marc currently requires aggressive championship recovery.

After a strong weekend:

```text
TITLE PRESSURE

█████░░░░░ 49%
```

This should NOT be a fake arbitrary value.

Define a transparent deterministic formula first.

Possible inputs:

- current deficit
- maximum remaining points
- required average gain per weekend
- number of rounds remaining

Prediction-model data may later enhance it, but V1 should remain deterministic.

Store or expose the factors so the value can be explained.

---

# 71. Auto-Advance to Next Event

Once an event becomes `WEEKEND_COMPLETE`, the app must:

1. lock the completed result
2. persist the latest championship snapshot
3. calculate net points gained/lost
4. update Phoenix actual-vs-predicted curve
5. set the next scheduled event as active
6. calculate the new championship gap
7. generate new minimum-finish combinations
8. calculate the next race strategy
9. update dashboard
10. reduce polling frequency until the next race window

---

# 72. Latest Official Data Principle

The core product rule is:

> **Every strategy shown must be calculated from the latest official stored MotoGP classification.**

Never calculate strategy from:

- partial unofficial positions
- stale hardcoded championship points
- manually entered production values
- an LLM response

If upstream official data is temporarily unavailable, display the last-known official snapshot.

Example:

```text
LIVE DATA TEMPORARILY UNAVAILABLE

LAST OFFICIAL UPDATE
2026-08-30 18:42 UTC
```

Continue serving strategy based on that snapshot.

---

# 73. Historical Race Detail

Each completed event should have a page such as:

```text
/races/aragon-2026
```

Display:

- Sprint result
- GP result
- points scored
- championship position before event
- championship position after event
- championship gap before
- championship gap after
- points gained/lost vs each rival
- Phoenix projected score
- actual score
- status

Example:

```text
PHOENIX STATUS

TARGET
37

ACTUAL
37

RESULT
PERFECT WEEKEND
```

---

# 74. Race Weekend Sync Worker

Suggested service:

```text
RaceWeekendSyncService
```

Responsibilities:

```text
load current calendar
detect active event
determine event state
determine current/next session
select appropriate polling interval
fetch upstream data
validate classification
persist idempotently
create snapshots
trigger strategy recalculation
```

Possible interface:

```ts
interface RaceWeekendSyncService {
  getCurrentEventState(): Promise<EventTrackerState>;
  sync(): Promise<SyncResult>;
  getRecommendedPollInterval(): Promise<number>;
}
```

---

# 75. Post-Sync Recalculation Pipeline

Every successful official result update should emit an internal event.

Conceptually:

```text
SESSION_RESULT_UPDATED
```

Subscribers:

```text
ChampionshipStandingsService
ChampionshipSnapshotService
ChampionshipStrategyEngine
PhoenixProjectionService
PredictionService
CacheInvalidationService
```

Flow:

```text
official result saved
        ↓
SESSION_RESULT_UPDATED
        ↓
standings update
        ↓
snapshot created
        ↓
strategy recalculated
        ↓
frontend cache invalidated
```

This keeps external API synchronization separate from championship logic.

---

# 76. MVP PRIORITY CHANGE

The first usable version should prioritize the living update loop.

Updated MVP priority:

## Priority 1

Deterministic championship mathematics.

## Priority 2

Calendar-aware MotoGP synchronization.

## Priority 3

Official result persistence.

## Priority 4

Championship snapshots after Sprint and GP.

## Priority 5

Automatic strategy recalculation.

## Priority 6

Season timeline.

## Priority 7

Interactive scenario simulator.

## Priority 8

Historical Phoenix projection comparison.

Only after this loop works should the project add:

- ML track-strength models
- Monte Carlo championship probabilities
- LLM explanations
- true live timing

---

# 77. Updated First End-to-End Milestone

The first complete milestone should demonstrate this workflow:

```text
1. App starts with mock pre-race standings.

2. Misano is detected as the next event.

3. UI displays:
   Marc -19
   remaining rounds
   required gain
   Misano minimum strategy.

4. A mocked official Sprint classification arrives.

5. Sync service stores it.

6. Championship standings update automatically.

7. A new championship snapshot is created.

8. Sunday minimum-finish scenarios update automatically.

9. A mocked official GP classification arrives.

10. Weekend is marked complete.

11. Final Misano championship snapshot is stored.

12. Season timeline marks Misano complete.

13. Austria automatically becomes NEXT.

14. Austria strategy is generated from the new championship state.
```

Do this using fixtures before integrating real external MotoGP data.

---

# 78. Professional UI Direction for the Living Tracker

Do not design the site like a conventional marketing landing page.

The homepage itself should be the product.

Visual inspiration:

```text
MotoGP race control
telemetry dashboard
premium motorsport editorial
championship strategy room
```

Use:

- near-black / graphite background
- restrained #93 red accent
- large championship gap number
- clean typography
- subtle circuit/event cards
- minimal glow
- lots of breathing room

Avoid:

- excessive flames
- giant fan-art backgrounds
- cluttered neon cards
- generic SaaS dashboard styling
- random colors for each rider

Use red primarily for Marc identity.

Use semantic colors for strategy state:

```text
GREEN
positive championship outcome

AMBER
acceptable / neutral

ORANGE
damage limitation

RED
high title risk
```

---

# 79. Core Product Statement

The finished application should feel like:

> **A championship race engineer continuously recalculating Marc Márquez's path to the title after every official MotoGP Sprint and Grand Prix result.**

The user should never need to manually calculate:

```text
What changed?
How many points did Marc gain?
What is the new gap?
What does Marc need on Sunday?
What does Marc need at the next race?
Can Marc afford P3 here?
Does he need to attack?
Is Bezzecchi now the bigger threat?
How far ahead/behind is Marc versus the original Phoenix projection?
```

The application should answer all of these automatically.

