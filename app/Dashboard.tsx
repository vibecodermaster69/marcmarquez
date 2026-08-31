"use client";

import Image from "next/image";
import { useState } from "react";
import type { Dashboard as DashboardData } from "../lib/app/dashboard";

/**
 * One page exists, so one link is shown.
 *
 * The mockup carried ten nav items — Strategy, Simulations, Calendar, Results,
 * Analytics, Rivals, Tracks, Settings — none of which had a route behind them.
 * They are removed rather than greyed out: this app does not display a number it
 * has not computed, and the same rule should apply to a link it cannot follow.
 * (Settings was doubly wrong: the app takes no user input by design.)
 */
const navItems = ["Overview"];

const STATE_COPY: Record<string, { label: string; blurb: string; tone: string }> = {
  LIVE_FIGHT: { label: "LIVE FIGHT", blurb: "The title is still in Marc's own hands.", tone: "state-live" },
  OUT_OF_HIS_HANDS: { label: "OUT OF HIS HANDS", blurb: "More than a perfect weekend is required — this now depends on rivals dropping points.", tone: "state-out" },
  ALREADY_DECIDED: { label: "ALREADY DECIDED", blurb: "The requirement is already met before this round.", tone: "state-done" }
};

export default function Dashboard({ data }: { data: DashboardData }) {
  const [active, setActive] = useState("Overview");
  const state = STATE_COPY[data.realistic.status] ?? STATE_COPY.LIVE_FIGHT;
  // Green once the title is mathematically his, grey once it cannot be.
  const outcome = data.tracked.clinched ? "is-champion" : data.tracked.eliminated ? "is-out" : "";
  const updated = new Date(data.generatedAt).toUTCString().replace("GMT", "UTC");

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span className="brand-phoenix">✦</span><span className="brand-name">PHOENIX <b>93</b></span></div>
        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button key={item} onClick={() => setActive(item)} className={`nav-item ${active === item ? "active" : ""}`}>
              <span className="nav-icon">⌂</span>
              {item}
            </button>
          ))}
        </nav>
        <div className="rider-mini">
          <span className="eyebrow">RIDER</span>
          <div className="rider-id"><strong>93</strong><span>MARC<br />MÁRQUEZ</span></div>

        </div>
        <div className="sync-block"><div>Data sync <span className="live-dot" /> <b>LIVE</b></div><small>Last computed<br />{updated}</small></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><h1>THE PHOENIX EQUATION</h1><p><span className="slash">▰</span> Marc Márquez #93 — Road to the {data.season} MotoGP Title</p></div>
          <div className="top-meta"><span>{data.season} MotoGP Championship Tracker</span><span className="sync-status">Auto-sync <i /></span></div>
        </header>

        <div className="dashboard-grid">
          <article className="card hero-card">
            <div className="hero-image"><Image src="/marc-marquez.png" alt="Marc Márquez" fill sizes="360px" priority /></div>
            <div className="hero-copy">
              <div className="rider-title">
                <div><h2>MARC MÁRQUEZ</h2><p>🇪🇸 <span /> {data.standings.find((s) => s.isTracked)?.team.toUpperCase()}</p></div>
                <Image className="number-img" src="/marc-93-transparent.png" alt="#93" width={142} height={142} />
              </div>
              <div className="hero-stats">
                <div><span>CHAMPIONSHIP<br />POSITION</span><strong>{data.tracked.position}<sup>{data.tracked.position === 1 ? "ST" : data.tracked.position === 2 ? "ND" : data.tracked.position === 3 ? "RD" : "TH"}</sup></strong></div>
                <div><span>POINTS</span><strong>{data.tracked.points}<sup>PTS</sup></strong></div>
                <div><span>GAP TO LEADER</span><strong className={data.tracked.gapToLeader < 0 ? "red" : ""}>{data.tracked.gapToLeader === 0 ? "LEADER" : `−${Math.abs(data.tracked.gapToLeader)}`}<sup>{data.tracked.gapToLeader === 0 ? "" : "PTS"}</sup></strong></div>
              </div>
              <div className="hero-substats">
                <div><span>ROUNDS REMAINING</span><b>{data.roundsRemaining} <em>/ {data.totalRounds}</em></b></div>
                <div><span>POINTS AVAILABLE</span><b>{data.pointsAvailable} <em>PTS</em></b></div>
                <div>
                  <span>
                    {data.principalRival.chasing ? "MUST OUT-SCORE" : "MUST STAY AHEAD OF"} {data.principalRival.surname}
                    <br />BY, EACH WEEKEND
                  </span>
                  <b className={data.principalRival.margin > 0 ? "orange" : "green"}>
                    {data.principalRival.margin > 0 ? "+" : ""}{data.principalRival.margin} <em>PTS</em>
                  </b>
                </div>
              </div>
              <div className="quote"><b>“</b> Every lap, every point, every decision. The equation is clear. The mission remains.</div>
            </div>
          </article>

          {/* Layer 1 only: the two provable bounds. No probability until the model lands. */}
          <article className="card minimum-card">
            <div className="card-heading">
              <div><h3>THE REQUIREMENT</h3><p>What Marc must score at {data.nextRound?.shortName ?? "the next round"} —<br />and at every round after it</p></div>
              <span className="info">Σ</span>
            </div>

            <div className={`state-banner ${state.tone}`}>
              <b>{state.label}</b>
              <small>{state.blurb}</small>
            </div>

            <div className="headline-minimum">
              <span className="bound-label">IF HIS RIVALS RIDE WELL, MARC NEEDS <i className="tag tag-model">MODEL</i></span>
              <strong>
                <u>at least</u> {data.realistic.requiredNow}<small> PTS</small>
              </strong>
              <em className="every-weekend">every weekend — all {data.roundsRemaining} of them</em>
              <p className="requirement-note">
                That means <b>{data.realistic.requiredNow}+ points at {data.nextRound?.shortName ?? "the next round"}</b>,
                and <b>{data.realistic.requiredNow}+ again</b> at each of the {data.roundsRemaining - 1} rounds after it
                — <b>{data.realistic.requiredTotal} points in total</b>. It is not a one-off target: score
                less at any round and the shortfall has to be made up at the others.
              </p>
              {data.weekend && (
                <>
                <span className="bound-label targets-label">
                  ONE WAY TO SCORE {data.realistic.requiredNow} THIS WEEKEND
                </span>
                <div className="session-targets">
                  <div className={`session-target ${data.weekend.sprintRun ? "done" : ""}`}>
                    <span>SATURDAY · SPRINT</span>
                    {data.weekend.sprintRun ? (
                      <>
                        <strong className="done-value">{data.weekend.sprintResult}</strong>
                        <em>{data.weekend.sprintPoints} pts banked</em>
                      </>
                    ) : (
                      <>
                        <strong>{data.weekend.sprintTarget ?? "ANY"}</strong>
                        <em>target</em>
                      </>
                    )}
                  </div>
                  <div className={`session-target ${data.weekend.gpRun ? "done" : ""}`}>
                    <span>SUNDAY · RACE</span>
                    {data.weekend.gpRun ? (
                      <>
                        <strong className="done-value">{data.weekend.gpResult}</strong>
                        <em>result</em>
                      </>
                    ) : (
                      <>
                        <strong>{data.weekend.gpTarget ?? "—"}</strong>
                        <em>{data.weekend.sprintRun ? `${data.weekend.remainingForGp} pts still owed` : "target"}</em>
                      </>
                    )}
                  </div>
                </div>
                </>
              )}
              <small className="split-note">
                {data.weekend?.sprintRun
                  ? "Saturday is banked — Sunday's target has moved to cover the rest."
                  : "Saturday's result will move Sunday's target."}
              </small>
            </div>

            <div className="bounds">
              <div className="bound">
                <span className="bound-label">IF RIVALS SCORED NOTHING AGAIN <i className="tag tag-fact">PROVEN</i></span>
                <strong>{data.bestCase.requiredNow}<small> PTS</small></strong>
                <em>a weekend, {data.bestCase.requiredTotal} in total — the most generous the arithmetic allows</em>
              </div>
              <div className="bound">
                <span className="bound-label">IF RIVALS WON EVERYTHING <i className="tag tag-fact">PROVEN</i></span>
                <strong className="red">{data.worstCase.requiredNow}<small> PTS</small></strong>
                <em>a weekend — impossible, only 37 are on offer</em>
              </div>
            </div>

            <div className="outlook">
              <b>RIVAL OUTLOOK</b>
              {data.rivalOutlook.map((r) => (
                <p key={r.name}>
                  <span>{r.name}</span>
                  <em>{r.perRound}/round → {r.strongTotal} pts</em>
                </p>
              ))}
              <small>
                What each rival is expected to score per weekend, and in total, if they ride
                well — from points and DNFs alone. Marc must out-score the strongest of them.
              </small>
            </div>
          </article>

          <article className="card projection-card">
            <div className="section-title">
              <div>
                <h3>WILL MARC WIN THE TITLE?</h3>
                <p className="sim-explainer">
                  The remaining {data.roundsRemaining} rounds played out{" "}
                  {data.simulation.runs.toLocaleString()} times, each round copying a real
                  weekend from this season. Below: how often he ends up champion.
                </p>
              </div>
              <span className="info">⌁</span>
            </div>

            <div className="sim-grid">
              <div className={`sim-gauge ${outcome}`}>
                <span className="bound-label">
                  {data.tracked.clinched ? "WORLD CHAMPION" : data.tracked.eliminated ? "OUT OF CONTENTION" : "TITLE PROBABILITY"}
                  {!data.tracked.clinched && !data.tracked.eliminated && <i className="tag tag-model">MODEL</i>}
                  {(data.tracked.clinched || data.tracked.eliminated) && <i className="tag tag-fact">PROVEN</i>}
                </span>
                <strong>{(data.simulation.probability * 100).toFixed(1)}<small>%</small></strong>
                <div className="prob-bar">
                  <i style={{ left: `${data.simulation.confidenceLow * 100}%`, right: `${100 - data.simulation.confidenceHigh * 100}%` }} />
                  <b style={{ left: `${data.simulation.probability * 100}%` }} />
                </div>
                <em>
                  {data.tracked.clinched
                    ? "Mathematically settled — no rival can catch him."
                    : data.tracked.eliminated
                      ? "Mathematically settled — he can no longer catch the leader."
                      : `He is champion in this share of simulated seasons. The band, ${(data.simulation.confidenceLow * 100).toFixed(1)}%–${(data.simulation.confidenceHigh * 100).toFixed(1)}%, is how far the answer moves when the season's weekends are resampled — the honest width of what ${data.roundsRemaining * 2} unrun sessions can tell us.`}
                </em>
                <div className="projected">
                  {data.simulation.projected.map((p) => (
                    <p key={p.name} className={p.isTracked ? "tracked" : ""}>
                      <span>{p.name}</span><b>{p.points}</b>
                    </p>
                  ))}
                  <small>projected final points, averaged over every simulated season</small>
                </div>
              </div>

              <div className="sim-where">
                <span className="bound-label">WHERE THE TITLE IS DECIDED</span>
                <p className="sens-explainer">
                  In the seasons he wins, this is the round it became mathematically his.
                  Rows sum to the probability on the left; &ldquo;not won&rdquo; is the rest.
                </p>
                {data.simulation.clinchByRound.filter((c) => c.probability > 0.0005).map((c) => (
                  <p key={c.round}>
                    <span>{c.flag} {c.shortName}</span>
                    <i><u style={{ width: `${Math.min(100, (c.probability / Math.max(0.01, 1 - data.simulation.never)) * 100)}%` }} /></i>
                    <b>{(c.probability * 100).toFixed(1)}%</b>
                  </p>
                ))}
                <p className="never">
                  <span>not won</span>
                  <i><u style={{ width: `${data.simulation.never * 100}%` }} className="grey" /></i>
                  <b>{(data.simulation.never * 100).toFixed(1)}%</b>
                </p>
              </div>

              <div className="sim-sensitivity">
                <span className="bound-label sens-title">
                  IF MARC FINISHES … AT {(data.nextRound?.circuitName ?? "THE NEXT ROUND").toUpperCase()}
                </span>
                <p className="sens-explainer">
                  Each row fixes that Sunday result, then replays the other{" "}
                  {Math.max(0, data.roundsRemaining - 1)} rounds {data.simulation.runs.toLocaleString()} times.
                  The figure is how often he still ends up champion.
                </p>
                <div className="sens-rows">
                  {data.simulation.sensitivity.map((p) => (
                    <p key={p.label} className={p.isMinimum ? "is-min" : ""}>
                      <span>{p.label}</span>
                      <i><u style={{ width: `${p.probability * 100}%` }} /></i>
                      <b>{(p.probability * 100).toFixed(1)}%</b>
                    </p>
                  ))}
                </div>
                <small>
                  <strong>{data.simulation.minimumLabel}</strong> is the worst finish that still holds
                  most of his chance — below it the odds fall away faster.
                  {" "}But note the whole column spans only{" "}
                  {(
                    (data.simulation.sensitivity[0].probability -
                      data.simulation.sensitivity[data.simulation.sensitivity.length - 1].probability) *
                    100
                  ).toFixed(0)}{" "}
                  points: winning at Misano beats crashing out by that much, and no more. The title is
                  decided across all {data.roundsRemaining} rounds, not at this one.
                </small>
              </div>
            </div>
          </article>

          <article className="card strategy-card">
            <div className="section-title"><h3>NEXT RACE</h3><span className="info">Σ</span></div>
            {data.nextRound ? (
              <>
                <div className="track-head">
                  <div className="flag">{data.nextRound.flag}</div>
                  <div>
                    <span>ROUND {data.nextRound.round}</span>
                    <h2 className="track-name">{data.nextRound.circuitName}</h2>
                    <p>{data.nextRound.name}<br />{data.nextRound.dateStart}</p>
                  </div>
                  <span className="track-line">⌁</span>
                </div>
                <div className="strategy-rows">
                  <div><span>ROUNDS REMAINING</span><b>{data.roundsRemaining}</b></div>
                  <div><span>POINTS AVAILABLE</span><b>{data.pointsAvailable}</b></div>
                  <div><span>REQUIRED PACE <i className="tag tag-model">MODEL</i></span><b className="orange">{data.realistic.requiredNow} PTS</b></div>
                  <div><span>MATHEMATICAL MINIMUM</span><b>{data.bestCase.minimumLabel}</b></div>
                  <div><span>EARLIEST CORONATION</span><b>{data.earliestCoronation ? `${data.earliestCoronation.flag} ${data.earliestCoronation.shortName}` : "—"}</b></div>
                  <div><span>RIVALS IN TOP 3</span><b>{data.rivals.length}</b></div>
                </div>
              </>
            ) : <p className="pending-note">The season is complete.</p>}
          </article>

          <article className="card timeline-card">
            <div className="section-title"><h3>{data.season} SEASON</h3><span className="info">Σ</span></div>
            <div className="timeline">
              {data.calendar.map((race) => (
                <div key={race.round} className={`timeline-item ${race.state}`} title={race.shortName}>
                  <span className="timeline-dot">{race.state === "complete" ? "✓" : race.state === "next" ? race.round : ""}</span>
                </div>
              ))}
            </div>
            <div className="timeline-legend">
              <span><i className="green-dot" /> Done ({data.calendar.filter((c) => c.state === "complete").length})</span>
              <span><i className="red-dot" /> Next (1)</span>
              <span><i className="gray-dot" /> Left ({data.calendar.filter((c) => c.state === "upcoming").length})</span>
            </div>
          </article>

          <article className="card results-card">
            <div className="section-title"><h3>RECENT RESULTS</h3><span className="info">Σ</span></div>
            <div className="results-head"><span>RND</span><span>EVENT</span><span>SPR</span><span>GP</span><span>PTS</span></div>
            {data.recentResults.map((r) => (
              <div className="result-row" key={r.round}>
                <span>R{r.round}</span>
                <b>{r.flag} {r.shortName}</b>
                <i className={r.sprint === "DNF" ? "red" : ""}>{r.sprint}</i>
                <strong className={r.gp === "DNF" ? "red" : ""}>{r.gp}</strong>
                <em>{r.points}</em>
              </div>
            ))}
          </article>

          <article className="card standings-card">
            <div className="section-title"><h3>CHAMPIONSHIP STANDINGS</h3><span className="info">Σ</span></div>
            <div className="standings-head"><span>POS</span><span>RIDER</span><span>POINTS</span><span>GAP</span></div>
            {data.standings.map((row) => (
              <div className={`standing-row ${row.isTracked ? "marc-row" : ""}`} key={row.name}>
                <span>{row.position}</span>
                <b>{row.name}</b>
                <strong>{row.points}</strong>
                <em>{row.gap === 0 ? "LEADER" : row.gap}</em>
              </div>
            ))}
          </article>
        </div>

        <footer className="footer">
          <div><span className="footer-icon">Σ</span><p><b>FACTUAL MATH</b><br /><small>Every number on this page is deterministic arithmetic from official results.</small></p></div>
          <div><span className="footer-icon">⌁</span><p><b>PREDICTIONS &amp; MODELS</b><br /><small>The realistic minimum uses empirical rival form — points and DNFs only. Probability arrives with the simulation.</small></p></div>
          <p className="fine-print">MotoGP is unpredictable.<br />The Phoenix Equation gives clarity. The track delivers the truth.</p>
          <span className="footer-bird">✦</span>
        </footer>
      </section>
    </main>
  );
}
