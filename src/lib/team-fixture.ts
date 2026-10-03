import type {
  LineupSlot,
  Player,
  PlayerAvailability,
  PlayerMatchState,
  PlayerPosition,
  RoundFixture,
} from "@/lib/types/fantasy";

const kickoffFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

const kickoffTimeFormatter = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatKickoff(iso: string) {
  return kickoffFormatter.format(new Date(iso));
}

/** Compact "HH:MM" for tabular fixture rows. */
export function formatKickoffTime(iso: string) {
  return kickoffTimeFormatter.format(new Date(iso));
}

const roundWindowFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

/**
 * Pass 14.5: one canonical rendering of a fantasy round's real, stored
 * Tue→Mon window — "SEP 29, 12:00 AM UTC → OCT 6, 12:00 AM UTC" — always
 * from `fantasy_rounds.starts_at`/`ends_at`, never inferred from today's
 * date (brief §Phase 3: "do not infer the fantasy week from today's date
 * if an authoritative fantasy_round exists").
 */
export function formatRoundWindow(startsAt: string, endsAt: string): string {
  return `${roundWindowFormatter.format(new Date(startsAt)).toUpperCase()} UTC → ${roundWindowFormatter.format(new Date(endsAt)).toUpperCase()} UTC`;
}

/**
 * Round points, always rendered with one decimal place — "0" must read as
 * a real, known zero ("0.0"), never as missing data (brief §Phase 1).
 */
export function formatRoundPoints(points: number): string {
  return points.toFixed(1);
}

/**
 * Pass 14.5: whether a player's OWN lineup slot has already locked for
 * this round — derivable purely from `fixture.state` once it's been
 * correctly populated (a raw "upcoming" state is the only one that means
 * "not locked yet"; "locked"/"live"/"final" all mean the lock instant has
 * already passed, see `buildMatchupTeamSquad`'s/`queryMatchupSquads`'s own
 * state-rewrite comment). A player with no fixture data for this round at
 * all is never treated as locked — the safe default is "editable."
 */
export function isPlayerLocked(player: { fixture?: { state: PlayerMatchState } }): boolean {
  return player.fixture !== undefined && player.fixture.state !== "upcoming";
}

/** Status word alone (no points embedded) — READY / LOCKED / LIVE / FT — for rows that render round points as their own separate, prominent element (brief §Phase 1: points and status must be visually distinct, not one merged string). Availability (injured/doubtful/suspended) still takes priority, matching `playerStatusLabel`. */
export function playerStateWord(player: Player): PlayerStatusLabel {
  if (player.availability === "injured" || player.availability === "suspended") {
    return { text: availabilityLabel[player.availability], tone: "destructive" };
  }
  if (player.availability === "doubtful") {
    return { text: availabilityLabel.doubtful, tone: "warning" };
  }
  const fixture = player.fixture;
  if (!fixture) return { text: availabilityLabel.available, tone: "neutral" };
  if (fixture.state === "live") return { text: "LIVE", tone: "live" };
  if (fixture.state === "locked") return { text: "LOCKED", tone: "neutral" };
  if (fixture.state === "final") return { text: "FT", tone: "neutral" };
  return { text: availabilityLabel.available, tone: "neutral" };
}

export function fixtureOpponentLabel(player: Player) {
  if (!player.fixture) return null;
  const { opponent, isHome } = player.fixture;
  return `${isHome ? "vs" : "@"} ${opponent}`;
}

/** "TOT (H)" / "TOT (A)" — the tabular fixture format for dense rows. */
export function playerFixtureCode(player: Player) {
  if (!player.fixture) return "—";
  return `${player.fixture.opponent} (${player.fixture.isHome ? "H" : "A"})`;
}

/**
 * Pass 14: the short label for whichever side the player is actually
 * participating in THEIR next fixture as — `player.club.shortName` for a
 * club fixture, but the real national-team short name (e.g. "FRA") for an
 * international one. Falls back to `player.club.shortName` with no
 * fixture at all. Use this, never `player.club.shortName` directly,
 * anywhere a compact row shows "<my side> · <fixture code>" together —
 * splicing the player's permanent club onto an international fixture's
 * opponent produces a matchup that doesn't exist (e.g. "REA · GER" when
 * the real fixture is France vs Germany).
 */
export function playerFixtureParticipantLabel(player: Player): string {
  if (!player.fixture) return player.club.shortName;
  return player.fixture.isHome ? player.fixture.homeLabel : player.fixture.awayLabel;
}

export interface PlayerStatusLabel {
  text: string;
  tone: "destructive" | "warning" | "live" | "neutral";
}

/**
 * One player's real-time status for a dense row — availability flag first
 * (injured/suspended/doubtful), else the real fixture state (live points,
 * locked, final points, or just "available"). Pulled out of `BenchRow`
 * (Pass 12F) so the Matchup page's compact mobile rows can show the exact
 * same truth, never a second, possibly-divergent status derivation.
 */
export function playerStatusLabel(player: Player): PlayerStatusLabel {
  if (player.availability === "injured" || player.availability === "suspended") {
    return { text: availabilityLabel[player.availability], tone: "destructive" };
  }
  if (player.availability === "doubtful") {
    return { text: availabilityLabel.doubtful, tone: "warning" };
  }

  const fixture = player.fixture;
  if (!fixture) return { text: availabilityLabel.available, tone: "neutral" };

  if (fixture.state === "live") {
    return { text: `LIVE ${player.fantasyPoints}`, tone: "live" };
  }
  if (fixture.state === "locked") {
    return { text: "LOCKED", tone: "neutral" };
  }
  if (fixture.state === "final") {
    return { text: `FT · ${player.fantasyPoints}`, tone: "neutral" };
  }
  return { text: availabilityLabel.available, tone: "neutral" };
}

const namePrefixes = new Set(["van", "von", "de", "der", "den", "du", "la", "le", "el"]);

export function surnameFor(name: string) {
  const words = name.split(" ").filter(Boolean);
  if (words.length < 2) return name;
  const last = words[words.length - 1];
  const beforeLast = words[words.length - 2];
  if (namePrefixes.has(beforeLast.toLowerCase())) {
    return `${beforeLast} ${last}`;
  }
  return last;
}

export function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

/** Eleven's operational vocabulary — see DESIGN.md §12 (Status Vocabulary). */
export const availabilityLabel: Record<PlayerAvailability, string> = {
  available: "READY",
  doubtful: "DOUBTFUL",
  injured: "INJ",
  suspended: "SUSP",
};

export const matchStateLabel: Record<PlayerMatchState, string> = {
  upcoming: "UPCOMING",
  live: "LIVE",
  locked: "LOCKED",
  final: "FT",
};

/**
 * Pass 14.6: Eleven's ONE canonical player-state vocabulary — every page
 * (Home, Matchup, Team, the global status bar, Round Intelligence) must
 * read off this, never invent a second grouping (the exact bug this pass
 * fixes: a "LIVE/DONE/LEFT" summary that silently meant something
 * different from the "LIVE/LOCKED/REMAINING" readout right above it).
 *
 * LOCK STATE and FIXTURE STATE are related but different dimensions:
 *   - READY:   the player's first eligible lock instant has not occurred
 *              yet. Movable.
 *   - LOCKED:  the lock instant has occurred. Immovable for the rest of
 *              the round. Does NOT by itself imply the real match is
 *              currently live or has finished.
 *   - LIVE:    a locked player's eligible fixture is currently in
 *              progress. A player is never "live" without also being
 *              locked (kickoff already happened).
 *   - FT:      a locked player's eligible fixture has completed. The
 *              player remains exactly as locked as any other locked
 *              player — FT describes the FIXTURE, never a lesser degree
 *              of immovability.
 *
 * `PlayerMatchState` ("upcoming"/"live"/"locked"/"final") already encodes
 * exactly these four states one-to-one; this block is the formal
 * definition other code/comments should point back to instead of
 * re-deriving the vocabulary ad hoc.
 */

/**
 * Pass 14.6: restrained, position-specific accent for the position badge
 * every row (Home, Matchup, Team) shows -- "extremely easy to scan," but
 * never the only signal: the GK/DEF/MID/FWD text itself already identifies
 * the position with zero reliance on color (brief: "position must be
 * readable even without color"). Low-opacity tints only, consistent with
 * Eleven's restrained graphite/warm-white system -- never a saturated
 * rainbow badge.
 */
export const POSITION_BADGE_CLASS: Record<PlayerPosition, string> = {
  GK: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  DEF: "bg-red-500/10 text-red-700 dark:text-red-400",
  MID: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  FWD: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

/** Zero-pads a matchday/index number for operational labels, e.g. "MATCHDAY 05". */
export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** "MCI 2—0 BHA" when a score exists, else "MCI — BHA". */
export function fixtureCode(fixture: RoundFixture) {
  if (fixture.homeScore !== undefined && fixture.awayScore !== undefined) {
    return `${fixture.homeClub} ${fixture.homeScore}—${fixture.awayScore} ${fixture.awayClub}`;
  }
  return `${fixture.homeClub} — ${fixture.awayClub}`;
}

/** Leading state badge for a fixture row: minute, HT, FT, or kickoff time. */
export function fixtureStateBadge(fixture: RoundFixture) {
  if (fixture.state === "live") return `${fixture.minute}'`;
  if (fixture.state === "ht") return "HT";
  if (fixture.state === "final") return "FT";
  return formatKickoffTime(fixture.kickoff);
}

/** The starter with the soonest kickoff that hasn't locked yet, or null if none remain. */
export function nextLock(starters: LineupSlot[]) {
  const upcoming = starters
    .filter((slot) => slot.player.fixture?.state === "upcoming")
    .sort(
      (a, b) =>
        new Date(a.player.fixture!.kickoff).getTime() -
        new Date(b.player.fixture!.kickoff).getTime()
    );
  return upcoming[0] ?? null;
}

/** Starters bucketed by fixture state, for compact "round intelligence" readouts. */
export function starterBuckets(starters: LineupSlot[]) {
  const buckets = { live: 0, locked: 0, upcoming: 0, final: 0 };
  for (const slot of starters) {
    const state = slot.player.fixture?.state ?? "upcoming";
    buckets[state] += 1;
  }
  return buckets;
}

/**
 * Pass 13 (§4): how many of a manager's own starters belong to either club
 * in a given fixture -- real "telemetry," the brief's own anticipation-
 * state example ("4 OF YOUR XI INVOLVED"), never a fabricated number. Used
 * against `MatchupFixtureIntelligence.nextFixture`
 * (`src/data-access/matchups.ts`), which only ever contains a fixture that
 * genuinely exists in stored data.
 *
 * Pass 14: compares real club/national-team IDs, never
 * `club.shortName` (a display string, never a safe identity key, and
 * always wrong for a starter whose participating team in this specific
 * fixture is a national team rather than their permanent club).
 * `teamIdsByPlayerId` (from `getTeamIdsByPlayer`,
 * `lib/fantasy-engine/player-fixture-participation.ts`) supplies each
 * starter's full team-id set (club + any national teams); a starter
 * missing from it falls back to their own `club.id` alone, which is
 * exactly correct for a club-only fixture and for every caller that
 * hasn't been updated to pass the map yet.
 */
export function countStartersInFixture(
  starters: LineupSlot[],
  fixture: { homeClubId: string; awayClubId: string } | null,
  teamIdsByPlayerId?: Map<string, string[]>
): number {
  if (!fixture) return 0;
  return starters.filter((slot) => {
    const teamIds = teamIdsByPlayerId?.get(slot.player.id) ?? [slot.player.club.id];
    return teamIds.includes(fixture.homeClubId) || teamIds.includes(fixture.awayClubId);
  }).length;
}
