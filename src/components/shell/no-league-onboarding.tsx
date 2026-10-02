import { Trophy } from "lucide-react";
import { TransitionLink } from "@/components/shell/transition-link";
import { Button } from "@/components/ui/button";

/**
 * The first-run state for an authenticated user with zero real league
 * memberships — see docs/product-state.md "No-league experience." Never a
 * populated fantasy dashboard; this is the only thing Home/Team/Matchup
 * render until `getUserLeagues()` returns at least one league.
 */
export function NoLeagueOnboarding() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground-secondary">
        <Trophy className="size-5" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
        No active league
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-foreground-secondary">
        You aren&rsquo;t currently competing in a league.
      </p>
      <div className="mt-5 flex items-center gap-3">
        <Button nativeButton={false} render={<TransitionLink href="/league" label="League" />}>
          Create league
        </Button>
        <Button nativeButton={false} variant="outline" render={<TransitionLink href="/league" label="League" />}>
          Join league
        </Button>
      </div>
    </div>
  );
}
