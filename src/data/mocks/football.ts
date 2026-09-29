/**
 * Canonical-shaped sample data for `@/domain/football`.
 *
 * This is deliberately small — a handful of records, not a full dataset —
 * because its job is to prove the shapes in `@/domain/football/types` are
 * usable and to give a future migration something concrete to seed a
 * Postgres schema from. It is NOT wired into any screen — the live UI
 * reads real (possibly empty) Supabase data via `@/data-access/*`. See
 * docs/product-state.md and docs/architecture.md "Mock data — test/
 * illustration only, never runtime."
 */

import type {
  Club,
  Competition,
  Fixture,
  Player,
  PlayerMatchStats,
  ProviderMapping,
} from "@/domain/football/types";

export const competitions: Competition[] = [
  { id: "cmp_eng", name: "Premier League", code: "ENG", country: "England" },
  { id: "cmp_esp", name: "La Liga", code: "ESP", country: "Spain" },
];

export const clubs: Club[] = [
  { id: "clb_ars", competitionId: "cmp_eng", name: "Arsenal", shortName: "Arsenal", code: "ARS" },
  { id: "clb_tot", competitionId: "cmp_eng", name: "Tottenham Hotspur", shortName: "Tottenham", code: "TOT" },
  { id: "clb_rma", competitionId: "cmp_esp", name: "Real Madrid", shortName: "Real Madrid", code: "RMA" },
];

export const players: Player[] = [
  {
    id: "plr_saka",
    clubId: "clb_ars",
    competitionId: "cmp_eng",
    name: "Bukayo Saka",
    shortName: "Saka",
    position: "MID",
    shirtNumber: 7,
    nationality: "England",
    active: true,
    availabilityStatus: "available",
  },
  {
    id: "plr_bellingham",
    clubId: "clb_rma",
    competitionId: "cmp_esp",
    name: "Jude Bellingham",
    shortName: "Bellingham",
    position: "MID",
    shirtNumber: 5,
    nationality: "England",
    active: true,
    availabilityStatus: "available",
  },
];

export const fixtures: Fixture[] = [
  {
    id: "fix_ars_tot_md05",
    competitionId: "cmp_eng",
    homeClubId: "clb_tot",
    awayClubId: "clb_ars",
    kickoffAt: "2026-10-04T15:30:00.000Z",
    status: "scheduled",
  },
];

/** Raw stats only — no fantasy points. See `@/domain/football/types` doc comment. */
export const playerMatchStats: PlayerMatchStats[] = [
  {
    id: "pms_saka_md05",
    playerId: "plr_saka",
    fixtureId: "fix_ars_tot_md05",
    minutes: 90,
    goals: 1,
    assists: 1,
    shotsOnTarget: 3,
    chancesCreated: 2,
    tackles: 1,
    interceptions: 0,
    blocks: 0,
    saves: 0,
    yellowCards: 0,
    redCards: 0,
  },
];

/** Illustrative — a real ingestion pass would populate one row per entity per provider. */
export const providerMappings: ProviderMapping[] = [
  {
    internalEntityType: "player",
    internalEntityId: "plr_saka",
    provider: "mock-provider",
    externalId: "prov_00981",
  },
];
