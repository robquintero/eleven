import { HomeSection } from "./home-overview";
import { TransitionLink } from "@/components/shell/transition-link";
import { Button } from "@/components/ui/button";
import { MIN_MANAGERS_TO_START_DRAFT } from "@/domain/fantasy/constants";
import type { LeagueLifecycleState } from "@/domain/fantasy/league-lifecycle";

const nextActionCopy: Partial<Record<LeagueLifecycleState, string>> = {
  WAITING_FOR_MANAGERS: `Invite more managers — the commissioner can start the draft once at least ${MIN_MANAGERS_TO_START_DRAFT} have joined, without waiting for the full league.`,
  READY_FOR_DRAFT: "Your league has enough managers — the draft isn't built yet.",
};

/**
 * The league setup/waiting workspace — see docs/product-state.md "League
 * setup / waiting." Shown whenever the active league isn't ACTIVE yet
 * (every league today, since the draft engine is Pass 8+). Every number
 * here is real, persisted state — no invented members, no fake draft
 * countdown.
 */
export function LeagueStatusPanel({
  leagueName,
  lifecycle,
  memberCount,
  maxTeams,
  isCommissioner,
  inviteCode,
}: {
  leagueName: string;
  lifecycle: LeagueLifecycleState;
  memberCount: number;
  maxTeams: number;
  isCommissioner: boolean;
  inviteCode: string;
}) {
  return (
    <HomeSection title="League setup" className="home-setup" action={<span className="text-sm text-accent">{lifecycle === "READY_FOR_DRAFT" ? "Ready for draft" : "Setup"}</span>}>
        <p className="text-lg font-semibold tracking-tight text-foreground">{leagueName}</p>

        <dl><div><dt>Managers</dt><dd>{memberCount} / {maxTeams}</dd></div><div><dt>Draft</dt><dd>Not yet available</dd></div>{isCommissioner && <div><dt>Invite code</dt><dd className="font-mono">{inviteCode}</dd></div>}</dl>

        <p className="mt-3 text-sm text-foreground-secondary">{nextActionCopy[lifecycle]}</p>

        <div className="mt-4">
          <Button nativeButton={false} variant="outline" size="sm" render={<TransitionLink href="/league" label="League" />}>
            Manage league
          </Button>
        </div>
    </HomeSection>
  );
}
