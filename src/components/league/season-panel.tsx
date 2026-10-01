"use client";

import { useActionState } from "react";
import { Trophy } from "lucide-react";
import { setSeasonScheduleFormatAction, type SeasonScheduleFormState } from "@/app/(app)/league/season-actions";
import { SCHEDULE_CYCLES_LABEL, type ScheduleCycles } from "@/domain/fantasy/season";
import type { SeasonSummary } from "@/data-access/seasons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CYCLE_OPTIONS: ScheduleCycles[] = [1, 2, 3];

/**
 * Pass 12A's minimum season-identity surface for the League page (brief
 * section 9): season number/status, schedule format, "round X of Y," and
 * a champion banner once the season is COMPLETED. Deliberately NOT a
 * season archive/history UI — just enough to see and test the engine.
 *
 * The ONCE/TWICE/THREE TIMES control only ever appears before this
 * league has a season row at all (pre-draft-completion) and only for the
 * commissioner — once a season exists (even SETUP), the server RPC itself
 * refuses further changes, so the control simply isn't shown instead of
 * rendering a control that would always fail.
 */
export function SeasonPanel({
  season,
  leagueId,
  isCommissioner,
}: {
  season: SeasonSummary | null;
  leagueId: string;
  isCommissioner: boolean;
}) {
  if (!season) {
    if (!isCommissioner) return null;
    return (
      <div className="border border-border p-4">
        <p className="label-system text-[11px] text-foreground-tertiary">SEASON_FORMAT</p>
        <p className="mt-1 text-sm text-foreground-secondary">
          Choose how many times each manager plays every other manager before this league&apos;s first season begins.
        </p>
        <ScheduleFormatForm leagueId={leagueId} />
      </div>
    );
  }

  const roundLabel =
    season.totalRounds !== null && season.currentRoundNumber !== null
      ? `ROUND ${season.currentRoundNumber} / ${season.totalRounds}`
      : season.totalRounds !== null
        ? `${season.totalRounds} ROUNDS SCHEDULED`
        : "SCHEDULE PENDING";

  return (
    <div className="border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label-system text-[11px] text-foreground-tertiary">
          SEASON {season.seasonNumber} · {SCHEDULE_CYCLES_LABEL[season.scheduleCycles]}
        </p>
        <span
          className={cn(
            "label-system text-[10px]",
            season.status === "COMPLETED" ? "text-accent" : season.status === "ACTIVE" ? "text-live" : "text-foreground-tertiary"
          )}
        >
          {season.status}
        </span>
      </div>

      {season.status === "COMPLETED" && season.championTeamName ? (
        <div className="mt-2 flex items-center gap-2">
          <Trophy className="size-4 text-accent" strokeWidth={1.75} />
          <p className="text-sm font-medium text-foreground">{season.championTeamName} — Season {season.seasonNumber} Champion</p>
        </div>
      ) : (
        <p className="mt-1 text-sm font-medium text-foreground">{roundLabel}</p>
      )}
    </div>
  );
}

function ScheduleFormatForm({ leagueId }: { leagueId: string }) {
  const [state, formAction, pending] = useActionState<SeasonScheduleFormState, FormData>(
    setSeasonScheduleFormatAction,
    undefined
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="leagueId" value={leagueId} />
      {CYCLE_OPTIONS.map((cycles) => (
        <label
          key={cycles}
          className="label-system flex cursor-pointer items-center gap-1.5 border border-border px-2.5 py-1.5 text-[11px] text-foreground-secondary has-checked:border-accent has-checked:text-accent"
        >
          <input type="radio" name="cycles" value={cycles} defaultChecked={cycles === 2} className="accent-accent" />
          {SCHEDULE_CYCLES_LABEL[cycles]}
        </label>
      ))}
      <Button type="submit" disabled={pending} className="rounded-control">
        {pending ? "Saving…" : "Set format"}
      </Button>
      {state?.error && <p className="w-full text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
