"use client";

import { useActionState } from "react";
import { Trophy } from "lucide-react";
import { setSeasonScheduleFormatAction, startNextSeasonAction, type SeasonScheduleFormState } from "@/app/(app)/league/season-actions";
import { SCHEDULE_CYCLES_LABEL, type ScheduleCycles } from "@/domain/fantasy/season";
import type { RosterMode, SeasonSummary } from "@/data-access/seasons";
import { Button } from "@/components/ui/button";

const CYCLE_OPTIONS: ScheduleCycles[] = [1, 2, 3];

/**
 * Pass 12A/12B's season-ACTION surface for the League page: the
 * commissioner's pre-season format picker, a champion banner once
 * COMPLETED, and the commissioner's "Start Next Season" control once that
 * happens. Deliberately NOT a season archive/history UI (that's
 * `SeasonArchiveList`) and, since Pass 13, deliberately NOT the season's
 * read-only identity display either (SEASON N / ROUND X of Y / ACTIVE) —
 * that now lives directly in the League page's own lightweight header
 * strip (`leagueSeasonIdentityLabel`, `@/domain/fantasy/season`), so this
 * component renders nothing at all for the common "a season is running,
 * nothing to do" case rather than a bordered box that exists only to
 * repeat state shown one scroll away. It renders a box only when there's
 * a genuine action or milestone: the pre-season format choice, or a
 * just-completed season's champion (+ Start Next Season, commissioner
 * only).
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
      <div className="mt-4 border border-border p-4">
        <p className="label-system text-[11px] text-foreground-tertiary">SEASON_FORMAT</p>
        <p className="mt-1 text-sm text-foreground-secondary">
          Choose how many times each manager plays every other manager before this league&apos;s first season begins.
        </p>
        <ScheduleFormatForm leagueId={leagueId} />
      </div>
    );
  }

  if (season.status !== "COMPLETED") return null;

  return (
    <div className="mt-4 border border-border p-4">
      {season.championTeamName ? (
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-accent" strokeWidth={1.75} />
          <p className="text-sm font-medium text-foreground">{season.championTeamName} — Season {season.seasonNumber} Champion</p>
        </div>
      ) : (
        <p className="label-system text-[11px] text-foreground-tertiary">SEASON {season.seasonNumber} COMPLETED</p>
      )}

      {isCommissioner && (
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
