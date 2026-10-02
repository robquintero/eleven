"use client";

import { useActionState } from "react";
import { Trophy } from "lucide-react";
import { setSeasonScheduleFormatAction, startNextSeasonAction, type SeasonScheduleFormState } from "@/app/(app)/league/season-actions";
import { SCHEDULE_CYCLES_LABEL, type ScheduleCycles } from "@/domain/fantasy/season";
import type { RosterMode, SeasonSummary } from "@/data-access/seasons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CYCLE_OPTIONS: ScheduleCycles[] = [1, 2, 3];

/**
 * Pass 12A/12B's minimum season-identity surface for the League page:
 * season number/status, schedule format, "round X of Y," a champion
 * banner once COMPLETED, and (Pass 12B) the commissioner's "Start Next
 * Season" control once that happens. Deliberately NOT a season archive/
 * history UI (that's `SeasonArchiveList`, a separate component) — just
 * enough to see and operate the engine.
 *
 * The ONCE/TWICE/THREE TIMES pre-season control only appears before this
 * league has a season row at all (commissioner only); "Start Next
 * Season" only appears once the current season is COMPLETED (commissioner
 * only). Neither control is ever shown to a non-commissioner, and neither
 * is shown when it would just fail server-side anyway.
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

      {season.status === "COMPLETED" && isCommissioner && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="label-system text-[11px] text-foreground-tertiary">START_NEXT_SEASON</p>
          <StartNextSeasonForm leagueId={leagueId} defaultCycles={season.scheduleCycles} />
        </div>
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

const ROSTER_MODE_OPTIONS: { value: RosterMode; label: string; description: string }[] = [
  { value: "REDRAFT", label: "REDRAFT", description: "Release every roster and run a fresh snake draft." },
  { value: "KEEP_ROSTERS", label: "KEEP ROSTERS", description: "Carry every roster forward (ineligible players are released)." },
];

function StartNextSeasonForm({ leagueId, defaultCycles }: { leagueId: string; defaultCycles: ScheduleCycles }) {
  const [state, formAction, pending] = useActionState<SeasonScheduleFormState, FormData>(startNextSeasonAction, undefined);

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-3">
      <input type="hidden" name="leagueId" value={leagueId} />

      <div className="flex flex-col gap-1.5">
        {ROSTER_MODE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="label-system flex cursor-pointer items-start gap-2 border border-border px-2.5 py-2 text-[11px] text-foreground-secondary has-checked:border-accent has-checked:text-accent"
          >
            <input type="radio" name="rosterMode" value={option.value} defaultChecked={option.value === "REDRAFT"} className="mt-0.5 accent-accent" />
            <span>
              <span className="block">{option.label}</span>
              <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-foreground-tertiary">{option.description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CYCLE_OPTIONS.map((cycles) => (
          <label
            key={cycles}
            className="label-system flex cursor-pointer items-center gap-1.5 border border-border px-2.5 py-1.5 text-[11px] text-foreground-secondary has-checked:border-accent has-checked:text-accent"
          >
            <input type="radio" name="cycles" value={cycles} defaultChecked={cycles === defaultCycles} className="accent-accent" />
            {SCHEDULE_CYCLES_LABEL[cycles]}
          </label>
        ))}
      </div>

      <Button type="submit" disabled={pending} className="w-full rounded-control">
        {pending ? "Starting…" : "Start next season"}
      </Button>
      {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
