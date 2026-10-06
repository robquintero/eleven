"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FORMATION_RULES, ROSTER_RULES } from "@/domain/fantasy/constants";
import { HistoricalScoringRules } from "@/components/players/historical-scoring-rules";
import { ScoringRulesV4 } from "@/components/players/scoring-rules-v4";
import { SCORING_RULE_VERSION_V3, SCORING_V3_WEIGHTS, type ScoringRuleVersion } from "@/domain/fantasy/scoring";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h3 className="label-system text-[11px] font-semibold text-foreground-secondary">{title}</h3>
      <div className="mt-1.5 text-xs text-foreground-tertiary">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span>{label}</span>
      <span className="label-system tabular-nums font-semibold text-foreground">{value}</span>
    </div>
  );
}

/**
 * Pass 14.6 §Phase 9: "ELEVEN GAME RULES" — a lightweight info surface
 * reachable from the active league control in the top bar, never a
 * navigation away from the current workflow. The scoring section renders
 * directly from `SCORING_V3_WEIGHTS` (domain/fantasy/scoring.ts) — the
 * SAME constants the real engine computes from — so this can never
 * silently drift from the actual formula; a weight change there is
 * automatically reflected here with no second edit.
 */
export function GameRulesDialog({ version = SCORING_RULE_VERSION_V3 }: { version?: ScoringRuleVersion }) {
  const [open, setOpen] = useState(false);
  const w = SCORING_V3_WEIGHTS;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Eleven game rules"
        title="Eleven game rules"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-muted hover:text-foreground-secondary"
      >
        <Info className="size-3.5" strokeWidth={2} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>ELEVEN GAME RULES</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {version === "ELEVEN_STANDARD_V4" ? <ScoringRulesV4 /> : version !== "ELEVEN_STANDARD_V3" ? <HistoricalScoringRules version={version} /> : <Section title={`SCORING — ${SCORING_RULE_VERSION_V3.replace("ELEVEN_STANDARD_", "")}`}>
              <p className="mb-2">
                Every eligible real performance is scored from the same stats for every player — position only
                changes the weight of goals and clean sheets, never which categories apply.
              </p>
              <Row
                label={`Appearance (1–${w.minutes.significantThreshold - 1} min)`}
                value={`+${w.minutes.appearance}`}
              />
              <Row
                label={`${w.minutes.significantThreshold}–${w.minutes.fullMatchThreshold - 1} min`}
                value={`+${w.minutes.significant}`}
              />
              <Row label={`${w.minutes.fullMatchThreshold}+ min (full match)`} value={`+${w.minutes.fullMatch}`} />
              <Row label="Goal — GK" value={`+${w.goalsByPosition.GK}`} />
              <Row label="Goal — DEF" value={`+${w.goalsByPosition.DEF}`} />
              <Row label="Goal — MID" value={`+${w.goalsByPosition.MID}`} />
              <Row label="Goal — FWD" value={`+${w.goalsByPosition.FWD}`} />
              <p className="mt-1 mb-1 text-[11px]">
                A multi-goal match earns an additional milestone bonus (2 goals = +3, 3 = +8, 4 = +15, and so on) —
                genuinely extraordinary games produce genuinely extraordinary scores, never capped.
              </p>
              <Row label="Assist" value={`+${w.assist}`} />
              <p className="mt-1 mb-1 text-[11px]">
                Multiple assists in one match earn their own, smaller milestone bonus (2 assists = +2, 3 = +5, 4 =
                +9).
              </p>
              <Row label="Shot on target" value={`+${w.shotOnTarget}`} />
              <Row label="Chance created (key pass)" value={`+${w.chanceCreated}`} />
              <Row label="Defensive action (tackle, interception, or block)" value={`+${w.defensiveAction}`} />
              <Row label="Save (goalkeeper)" value={`+${w.save}`} />
              <Row label="Clean sheet — GK / DEF" value={`+${w.cleanSheetByPosition.GK}`} />
              <Row label="Clean sheet — MID" value={`+${w.cleanSheetByPosition.MID}`} />
              <p className="mt-1 mb-1 text-[11px]">
                Clean sheet requires {w.cleanSheetMinutesThreshold}+ minutes and the player&apos;s side conceding 0 —
                forwards never earn it.
              </p>
              <Row label="Yellow card" value={w.yellowCard} />
              <Row label="Red card" value={w.redCard} />
              <p className="mt-2 text-[11px]">
                V3 scores only the categories listed here. Passing accuracy, duels, fouls and penalty events do not
                contribute to this version; missing statistics are never invented or estimated.
              </p>
            </Section>

            }

            <Section title="FORMATION">
              Eleven V1 uses {FORMATION_RULES.positionRange.DEF.max}-{FORMATION_RULES.positionRange.MID.max}-
              {FORMATION_RULES.positionRange.FWD.max}: {FORMATION_RULES.positionRange.GK.max} GK /{" "}
              {FORMATION_RULES.positionRange.DEF.max} DEF / {FORMATION_RULES.positionRange.MID.max} MID /{" "}
              {FORMATION_RULES.positionRange.FWD.max} FWD — {FORMATION_RULES.startersTotal} starters, no formation
              selection.
            </Section>

            <Section title="ROSTER">
              Every roster carries exactly {ROSTER_RULES.squadSize} players: {ROSTER_RULES.positionRange.GK.min} GK,{" "}
              {ROSTER_RULES.positionRange.DEF.min}–{ROSTER_RULES.positionRange.DEF.max} DEF,{" "}
              {ROSTER_RULES.positionRange.MID.min}–{ROSTER_RULES.positionRange.MID.max} MID, and{" "}
              {ROSTER_RULES.positionRange.FWD.min}–{ROSTER_RULES.positionRange.FWD.max} FWD. This squad rule is
              deeper than the {FORMATION_RULES.startersTotal}-player starting XI above on purpose — it guarantees a
              real backup at every position, not just enough bodies to fill one matchday.
            </Section>

            <Section title="PLAYER LOCKS">
              Each starter locks individually at kickoff of their first eligible fixture in the fantasy round.
              Locked does not necessarily mean live — a locked player may still be waiting for kickoff, currently
              playing, or already finished; all three are equally immovable for the rest of the round.
            </Section>

            <Section title="ROUND WINDOW">
              A fantasy round is a Tuesday 00:00 UTC → the following Tuesday 00:00 UTC window. All eligible
              fixtures that kick off inside that window belong to that round, regardless of when they were
              scheduled or discovered.
            </Section>

            <Section title="MULTIPLE FIXTURES">
              If a player has more than one eligible fixture in the same fantasy round (a club match and an
              international call-up, for example), every eligible performance aggregates into that round&apos;s
              total.
            </Section>

            <Section title="BENCH">
              Bench players&apos; round points are visible for context but never contribute to your matchup total —
              only starters count.
            </Section>

            <Section title="FREE AGENCY / DROPS">
              A locked player cannot be dropped during the current fantasy round — once their round lock has
              passed, they stay on your roster until the round ends. An unlocked player may be dropped at any
              time.
            </Section>

            <Section title="ACQUISITION POINTS">
              You only receive a player&apos;s fantasy points for performances that happen while you own them. If a
              player already played earlier in the current round before you acquired them, that performance still
              shows on their record, but it does not count toward your matchup — shown as PRE-ACQUISITION wherever
              it appears.
            </Section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
