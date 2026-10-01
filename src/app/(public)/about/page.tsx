import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "About",
  description: "Eleven is a draft-style fantasy football platform built to feel like running a club, not playing a mobile game.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <LegalPage title="About Eleven">
      <p>
        Eleven is a web-first, draft-style fantasy football platform. The idea behind it is
        simple: make fantasy football feel less like playing a mobile game and more like being
        trusted with a football club.
      </p>
      <h2>How Eleven works</h2>
      <p>
        Every league starts with a live draft. Managers take turns selecting real players, and
        once a player is drafted, they belong to exactly one manager for the rest of that
        league&rsquo;s season — no shared rosters, no duplicate ownership, no ambiguity about who
        controls who.
      </p>
      <p>
        From there, managing a squad is a real, ongoing decision: build a legal starting
        lineup, react to form and fixtures, and make substitutions before a player&rsquo;s match
        locks their slot. Each round, a manager&rsquo;s starting eleven is matched head-to-head
        against another manager in the same league, and results are earned through real
        performances, not assumed.
      </p>
      <h2>What Eleven is not</h2>
      <p>
        Eleven is not a generic points calculator, and it is not an official product of any
        football league, competition, club, or players&rsquo; association — see our{" "}
        <a href="/disclaimer">disclaimer</a> and <a href="/data-sources">data sources</a> pages
        for more on that distinction.
      </p>
      <h2>Current status</h2>
      <p>
        Eleven is in Beta. The core experience — drafting, squad management, and head-to-head
        competition — is live and actively used, and we&rsquo;re continuing to build on top of
        it. If something feels off, we want to hear about it — see <a href="/contact">contact</a>.
      </p>
    </LegalPage>
  );
}
