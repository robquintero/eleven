import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PositionBadge } from "@/components/players/position-badge";
import { PublicShell } from "./public-shell";

const steps = [
  ["Draft your squad", "Take turns picking players in a live snake draft. Each player belongs to one manager in your league."],
  ["Set your XI", "Choose your 4–3–3 and use your bench. Each player locks when their first match of the week kicks off."],
  ["Win your matchweek", "Face another manager head-to-head. Real football performances decide your fantasy score."],
  ["Work the market", "Find free agents and trade with other managers. Build a squad that lasts beyond one good weekend."],
];

/** Illustrative product model, explicitly demo; no live data or fabricated scores. */
export function LandingView() {
  return <PublicShell>
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-message">
        <p className="entry-eyebrow">Draft fantasy football</p>
        <h1 id="landing-title">Your squad.<br />Your rivals.<br /><span>Every match matters.</span></h1>
        <p className="landing-intro">Draft across Europe’s Big Five leagues. Own your players, set your XI and compete head-to-head with your friends every week.</p>
        <div className="entry-actions">
          <Button nativeButton={false} render={<Link href="/signup" />}>Create your account</Button>
          <Link href="/login" className="v2-link">Already playing? Sign in →</Link>
        </div>
      </div>
      <div className="landing-preview" aria-label="Illustrative lineup preview">
        <div className="preview-heading"><span>Starting XI</span><span className="v2-meta">Illustrative preview</span></div>
        <div className="preview-formation" aria-label="4–3–3 formation">
          {([['FWD','FWD','FWD'], ['MID','MID','MID'], ['DEF','DEF','DEF','DEF'], ['GK']] as const).map((line, i) => <div className="preview-line" key={i}>{line.map((position,j) => <div className="preview-player" key={j}><span className="preview-shirt" aria-hidden="true">{[9,7,6,1][i] + j}</span><PositionBadge position={position} /></div>)}</div>)}
        </div>
        <div className="preview-caption"><strong>Eleven starters. One team.</strong><p>Build your squad in the draft. Choose who plays each week.</p></div>
      </div>
    </section>
    <section className="landing-competitions" aria-label="Club competitions"><p className="entry-eyebrow">One squad, five leagues</p><ul>{['Premier League','La Liga','Bundesliga','Serie A','Ligue 1'].map(name => <li key={name}>{name}</li>)}</ul></section>
    <section className="landing-loop" aria-labelledby="loop-title">
      <div className="landing-section-heading"><h2 id="loop-title">Build a team worth backing.</h2><p>The decisions are yours. The football does the rest.</p></div>
      <ol>{steps.map(([title,body], i) => <li key={title}><span className="v2-number landing-step">0{i+1}</span><h3>{title}</h3><p>{body}</p></li>)}</ol>
    </section>
    <section className="landing-detail" aria-labelledby="detail-title"><h2 id="detail-title">More than goals.<br />More than a weekend.</h2><div><p>Passing, chances created, defensive work and goalkeeping all contribute to Eleven’s scoring. Follow your matchup as real matches unfold.</p><p>Unique ownership makes every draft pick, free-agent signing and trade a decision that matters to your league.</p><Link href="/about" className="v2-link">Get to know Eleven →</Link></div></section>
    <section className="landing-final"><h2>Your next rivalry starts here.</h2><p>Create an account, then start a league or join your friends.</p><Button nativeButton={false} render={<Link href="/signup" />}>Get started</Button></section>
  </PublicShell>;
}
