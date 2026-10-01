import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/shell/wordmark";
import { SiteFooter } from "@/components/shell/site-footer";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// Pass 10C: no page-specific metadata needed -- the root layout's own
// default title/description/canonical/OG/Twitter metadata (src/lib/site-config.ts)
// already describes the landing page exactly; a duplicate export here
// would just be a second copy to keep in sync. See docs/SEO.md.

const pillars = [
  {
    label: "DRAFT",
    title: "Draft your squad",
    body: "Build a roster from the Big Five leagues in a live snake draft with your league.",
  },
  {
    label: "OWN",
    title: "Exclusive ownership",
    body: "Every player belongs to exactly one manager per league — no shared rosters, no ambiguity.",
  },
  {
    label: "MANAGE",
    title: "Manage your XI",
    body: "Set a starting lineup against real fixtures. Locking happens player-by-player, at kickoff.",
  },
  {
    label: "COMPETE",
    title: "Compete head-to-head",
    body: "Face a different manager in your league every round. Standings are earned, not assumed.",
  },
];

/**
 * The public product entrance — see docs/product-state.md "PUBLIC vs
 * AUTHENTICATED boundary." A signed-out visitor lands here, never on a
 * populated fantasy workspace. A signed-in visitor is sent straight into
 * the authenticated application instead of seeing marketing copy again.
 */
export default async function LandingPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect("/home");
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-5 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-2">
          <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button nativeButton={false} size="sm" render={<Link href="/signup" />}>
            Create account
          </Button>
        </nav>
      </header>

      <main id="main-content" className="mx-auto flex max-w-3xl flex-col items-start px-4 py-16 sm:px-8 sm:py-24">
        <span className="label-system text-[11px] text-foreground-tertiary">
          FANTASY FOOTBALL / BIG FIVE
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Run a football squad, not a spreadsheet.
        </h1>
        <p className="mt-4 max-w-xl text-base text-foreground-secondary sm:text-lg">
          Eleven is a draft-style fantasy platform across the Premier League,
          La Liga, Bundesliga, Serie A and Ligue 1 — built for managers who
          want real ownership and real decisions, not a generic points
          calculator.
        </p>

        <div className="mt-8 flex items-center gap-3">
          <Button nativeButton={false} render={<Link href="/signup" />}>
            Create account
          </Button>
          <Button nativeButton={false} variant="outline" render={<Link href="/login" />}>
            Sign in
          </Button>
        </div>

        <div className="mt-16 grid w-full grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2">
          {pillars.map((pillar) => (
            <div key={pillar.label} className="bg-background p-5">
              <span className="label-system text-[10px] text-accent">{pillar.label}</span>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                {pillar.title}
              </h2>
              <p className="mt-1.5 text-sm text-foreground-secondary">{pillar.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-16 text-xs text-foreground-tertiary">
          Scouting, the player market, and live scoring activate as your
          league&rsquo;s draft comes together — Eleven only shows you what&rsquo;s
          actually happened in your league.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
