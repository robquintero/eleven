import { formatKickoff, pad2 } from "@/lib/team-fixture";

export interface StatusBarData {
  roundNumber: number;
  roundStatus: "upcoming" | "in_progress" | "completed";
  liveCount: number;
  lockedCount: number;
  remainingCount: number;
  nextLockKickoff: string | null;
}

/**
 * Pass 14.5: desktop-only operational strip, now wired to the signed-in
 * manager's real active-league round state (`app-shell.tsx`) instead of a
 * permanently-hardcoded "no round scheduler exists yet" placeholder (Pass
 * 8's own honest-at-the-time state, never updated once rounds actually
 * went live — this is the literal source of the "NO ACTIVE ROUND" shown
 * globally even with a real, locked-in-progress round, flagged in the
 * Pass 14.5 brief). `data` is `null` only when genuinely no team/round
 * exists for the active league yet (pre-draft, pre-round) — still a
 * truthful state, not a fabricated one.
 */
export function StatusBar({ data }: { data: StatusBarData | null }) {
  if (!data) {
    return (
      <div className="hidden items-center gap-5 border-t border-border px-4 py-1.5 lg:flex lg:px-8">
        <span className="label-system text-[10px] text-foreground-tertiary">NO ACTIVE ROUND</span>
        <span className="label-system text-[10px] text-foreground-tertiary">NO FIXTURE DATA</span>
        <span className="label-system ml-auto text-[10px] text-foreground-tertiary">NEXT LOCK — NOT SCHEDULED</span>
      </div>
    );
  }

  const roundLabel =
    data.roundStatus === "completed"
      ? `MATCHDAY ${pad2(data.roundNumber)} · COMPLETED`
      : `MATCHDAY ${pad2(data.roundNumber)} · ${data.roundStatus === "in_progress" ? "IN PROGRESS" : "UPCOMING"}`;

  return (
    <div className="hidden items-center gap-5 border-t border-border px-4 py-1.5 lg:flex lg:px-8">
      <span className="label-system text-[10px] text-foreground-tertiary">{roundLabel}</span>
      <span className="label-system text-[10px] text-foreground-tertiary">
        {data.liveCount} LIVE / {data.lockedCount} LOCKED / {data.remainingCount} REMAINING
      </span>
      <span className="label-system ml-auto text-[10px] text-foreground-tertiary">
        {data.nextLockKickoff ? `NEXT LOCK — ${formatKickoff(data.nextLockKickoff)}` : "NEXT LOCK — NONE REMAINING"}
      </span>
    </div>
  );
}
