import type { PlayerAvailability, PlayerOwnership, PlayerPosition } from "@/lib/types/fantasy";

/**
 * Filter/sort vocabulary for the Players workspace — option lists only.
 * The actual filtering/sorting/pagination happens server-side in
 * `getPlayerDatabase` (src/data-access/players.ts), never client-side over
 * a fully-fetched array — see docs/football-data-system.md "Players
 * workspace performance." This module just describes the choices the
 * toolbar renders and turns them into URL search params.
 */

export type SortKey = "points" | "name" | "club";

export interface PlayerFilters {
  query: string;
  position: "ALL" | PlayerPosition;
  competitionId: "ALL" | string;
  clubId: "ALL" | string;
  ownership: "ALL" | Extract<PlayerOwnership, "free" | "owned" | "mine">;
  availability: "ALL" | PlayerAvailability;
  sort: SortKey;
}

export const defaultFilters: PlayerFilters = {
  query: "",
  position: "ALL",
  competitionId: "ALL",
  clubId: "ALL",
  ownership: "ALL",
  availability: "ALL",
  sort: "points",
};

export const positionOptions: { value: PlayerFilters["position"]; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "GK", label: "GK" },
  { value: "DEF", label: "DEF" },
  { value: "MID", label: "MID" },
  { value: "FWD", label: "FWD" },
];

export const availabilityOptions: { value: PlayerFilters["availability"]; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "available", label: "READY" },
  { value: "doubtful", label: "DOUBTFUL" },
  { value: "injured", label: "INJ" },
  { value: "suspended", label: "SUSP" },
];

export const sortOptions: { value: SortKey; label: string }[] = [
  { value: "points", label: "POINTS HIGH–LOW" },
  { value: "name", label: "NAME A–Z" },
  { value: "club", label: "CLUB A–Z" },
];

/**
 * Real ownership/market-availability options, only shown when an active
 * league exists (see PlayersWorkspace). Pass 11: the Players page is now
 * the free-agent market -- "FREE" means genuinely available to sign
 * first-come-first-served, "MY PLAYERS" scopes to the caller's own
 * roster. No WAIVERS option — waivers are out of scope for this product.
 */
export const ownershipOptions: { value: PlayerFilters["ownership"]; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "free", label: "AVAILABLE" },
  { value: "owned", label: "OWNED" },
  { value: "mine", label: "MY PLAYERS" },
];

export type SearchParamsInput = Record<string, string | string[] | undefined>;

/** Parses the Players page's URL search params into a `PlayerFilters` + page number — pure, so the URL <-> filters mapping is unit-testable without a Next.js request. */
export function parseFiltersFromSearchParams(sp: SearchParamsInput): { filters: PlayerFilters; page: number } {
  const get = (key: string) => {
    const value = sp[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const isPosition = (v: string | undefined): v is PlayerFilters["position"] =>
    v === "GK" || v === "DEF" || v === "MID" || v === "FWD";
  const isAvailability = (v: string | undefined): v is PlayerFilters["availability"] =>
    v === "available" || v === "doubtful" || v === "injured" || v === "suspended";
  const isOwnership = (v: string | undefined): v is PlayerFilters["ownership"] =>
    v === "free" || v === "owned" || v === "mine";
  const isSort = (v: string | undefined): v is SortKey => v === "points" || v === "name" || v === "club";

  const positionRaw = get("pos");
  const availabilityRaw = get("avail");
  const ownershipRaw = get("own");
  const sortRaw = get("sort");

  const page = Math.max(1, Number(get("page") ?? "1") || 1);

  return {
    filters: {
      query: get("q") ?? "",
      position: isPosition(positionRaw) ? positionRaw : "ALL",
      competitionId: get("comp") || "ALL",
      clubId: get("club") || "ALL",
      ownership: isOwnership(ownershipRaw) ? ownershipRaw : "ALL",
      availability: isAvailability(availabilityRaw) ? availabilityRaw : "ALL",
      sort: isSort(sortRaw) ? sortRaw : "points",
    },
    page,
  };
}

/** Inverse of `parseFiltersFromSearchParams` — builds the query string for a filters+page state, omitting any field at its default. */
export function filtersToSearchParams(filters: PlayerFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.position !== "ALL") params.set("pos", filters.position);
  if (filters.competitionId !== "ALL") params.set("comp", filters.competitionId);
  if (filters.clubId !== "ALL") params.set("club", filters.clubId);
  if (filters.ownership !== "ALL") params.set("own", filters.ownership);
  if (filters.availability !== "ALL") params.set("avail", filters.availability);
  if (filters.sort !== "points") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  return params;
}

export function isFiltersActive(filters: PlayerFilters) {
  return (
    filters.query.trim() !== "" ||
    filters.position !== "ALL" ||
    filters.competitionId !== "ALL" ||
    filters.clubId !== "ALL" ||
    filters.ownership !== "ALL" ||
    filters.availability !== "ALL"
  );
}
