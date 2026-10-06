"use client";

import { useRouter } from "next/navigation";
import { TransitionLink } from "@/components/shell/transition-link";
import type { LeagueRoundSummary } from "@/data-access/matchups";

export function RoundNavigation({ rounds, selectedId, currentId }: {
  rounds: LeagueRoundSummary[]; selectedId: string; currentId?: string;
}) {
  const router = useRouter();
  const index = rounds.findIndex(r => r.id === selectedId);
  const previous = rounds[index - 1], next = rounds[index + 1];
  const style = "label-system flex min-h-11 items-center px-2 text-[11px] text-accent hover:underline";
  return <nav aria-label="Matchup rounds" className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-2">
    {previous
      ? <TransitionLink href={`/league?round=${previous.id}`} label="Previous round" className={style}>← Previous</TransitionLink>
      : <span aria-disabled="true" className="label-system px-2 text-[11px] text-foreground-tertiary">← Previous</span>}
    <label className="min-w-0">
      <span className="sr-only">Fantasy round</span>
      <select
        aria-label="Fantasy round" value={selectedId}
        onChange={e => router.push(`/league?round=${e.target.value}`)}
        className="label-system min-h-11 max-w-full border border-border bg-background px-2 text-xs text-foreground outline-accent"
      >
        {rounds.map(r => <option key={r.id} value={r.id}>
          {r.seasonNumber !== undefined ? `S${r.seasonNumber} · ` : ""}ROUND {r.number}{r.id === currentId ? " · CURRENT" : ""}
        </option>)}
      </select>
    </label>
    {next
      ? <TransitionLink href={`/league?round=${next.id}`} label="Next round" className={style}>Next →</TransitionLink>
      : <span aria-disabled="true" className="label-system px-2 text-[11px] text-foreground-tertiary">Next →</span>}
  </nav>;
}
