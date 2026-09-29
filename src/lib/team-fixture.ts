import type {
  LineupSlot,
  Player,
  PlayerAvailability,
  PlayerMatchState,
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
