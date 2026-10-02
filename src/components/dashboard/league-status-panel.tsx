import { OperationalRow } from "@/components/football/operational-row";
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
    <div className="border border-border bg-surface-elevated">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="label-system text-[11px] text-foreground-secondary">LEAGUE_STATUS</span>
        <span className="label-system text-[10px] text-accent">
          {lifecycle === "READY_FOR_DRAFT" ? "READY FOR DRAFT" : "SETUP"}
        </span>
      </div>

      <div className="p-5 sm:p-6">
        <p className="text-lg font-semibold tracking-tight text-foreground">{leagueName}</p>

        <div className="mt-3">
          <OperationalRow label="MANAGERS" value={`${memberCount} / ${maxTeams}`} />
          <OperationalRow label="DRAFT" value="NOT YET AVAILABLE" />
          {isCommissioner && <OperationalRow label="INVITE CODE" value={inviteCode} />}
        </div>

        <p className="mt-3 text-sm text-foreground-secondary">{nextActionCopy[lifecycle]}</p>

        <div className="mt-4">
          <Button nativeButton={false} variant="outline" size="sm" render={<TransitionLink href="/league" label="League" />}>
            Manage league
          </Button>
        </div>
      </div>
    </div>
  );
}
