import type {
  BigFiveLeague,
  Player,
  PlayerAvailability,
  PlayerOwnership,
  PlayerPosition,
} from "@/lib/types/fantasy";
import { leagueCode } from "@/lib/leagues";
import { playerDatabase } from "@/lib/mock/players-database";

export type SortKey = "points" | "form" | "name" | "kickoff";

export interface PlayerFilters {
  query: string;
  position: "ALL" | PlayerPosition;
  league: "ALL" | BigFiveLeague;
  ownership: "ALL" | PlayerOwnership;
  availability: "ALL" | PlayerAvailability;
  club: "ALL" | string;
  sort: SortKey;
}

export const defaultFilters: PlayerFilters = {
  query: "",
  position: "ALL",
  league: "ALL",
  ownership: "ALL",
  availability: "ALL",
  club: "ALL",
  sort: "points",
};

export const positionOptions: { value: PlayerFilters["position"]; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "GK", label: "GK" },
  { value: "DEF", label: "DEF" },
  { value: "MID", label: "MID" },
  { value: "FWD", label: "FWD" },
];

export const leagueOptions: { value: PlayerFilters["league"]; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "premier-league", label: leagueCode["premier-league"] },
  { value: "la-liga", label: leagueCode["la-liga"] },
  { value: "bundesliga", label: leagueCode["bundesliga"] },
  { value: "serie-a", label: leagueCode["serie-a"] },
  { value: "ligue-1", label: leagueCode["ligue-1"] },
];

export const ownershipOptions: { value: PlayerFilters["ownership"]; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "free", label: "FREE" },
  { value: "mine", label: "MINE" },
  { value: "owned", label: "OWNED" },
  { value: "waivers", label: "WAIVERS" },
];

export const availabilityOptions: { value: PlayerFilters["availability"]; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "available", label: "READY" },
  { value: "doubtful", label: "DOUBTFUL" },
  { value: "injured", label: "INJ" },
  { value: "suspended", label: "SUSP" },
];

export const sortOptions: { value: SortKey; label: string }[] = [
  { value: "points", label: "PTS ↓" },
  { value: "form", label: "FORM ↓" },
  { value: "name", label: "NAME A–Z" },
  { value: "kickoff", label: "NEXT KICKOFF" },
];

/** Club filter options, derived from the actual dataset rather than hardcoded. */
export const clubOptions: { value: string; label: string }[] = [
  { value: "ALL", label: "ALL" },
  ...[...new Map(playerDatabase.map((p) => [p.club.id, p.club.shortName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label })),
];

export function filterAndSortPlayers(players: Player[], filters: PlayerFilters): Player[] {
  const q = filters.query.trim().toLowerCase();

  const filtered = players.filter((player) => {
    if (filters.position !== "ALL" && player.position !== filters.position) return false;
    if (filters.league !== "ALL" && player.club.league !== filters.league) return false;
    if (filters.club !== "ALL" && player.club.id !== filters.club) return false;
    if (filters.ownership !== "ALL" && (player.ownership ?? "free") !== filters.ownership) {
      return false;
    }
    if (
      filters.availability !== "ALL" &&
      (player.availability ?? "available") !== filters.availability
    ) {
      return false;
    }
    if (q) {
      const haystack = `${player.name} ${player.club.name} ${player.club.shortName}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (filters.sort) {
      case "points":
        return (b.totalPoints ?? b.fantasyPoints) - (a.totalPoints ?? a.fantasyPoints);
      case "form":
        return (b.averagePoints ?? b.fantasyPoints) - (a.averagePoints ?? a.fantasyPoints);
      case "name":
        return a.name.localeCompare(b.name);
      case "kickoff": {
        const ka = a.fixture ? new Date(a.fixture.kickoff).getTime() : Infinity;
        const kb = b.fixture ? new Date(b.fixture.kickoff).getTime() : Infinity;
        return ka - kb;
      }
      default:
        return 0;
    }
  });
}

export function isFiltersActive(filters: PlayerFilters) {
  return (
    filters.query.trim() !== "" ||
    filters.position !== "ALL" ||
    filters.league !== "ALL" ||
    filters.ownership !== "ALL" ||
    filters.availability !== "ALL" ||
    filters.club !== "ALL"
  );
}
