import { scoreStoredPerformance, type StoredScoringStats } from "./versions.ts";
import { isEligibleFixtureKickoff, isScoringEligibleCompetitionCode } from "../football-ingestion/competition-eligibility.ts";
import type { PlayerPosition } from "../../domain/football/types.ts";
export interface CalibrationSnapshot {
  capturedAt: string;
  tables: {
    player_match_stats: Array<StoredScoringStats & { player_id: string; fixture_id: string }>;
    players: Array<{ id: string; name: string; position: string; club_id: string }>;
    fixtures: Array<{ id: string; competition_id: string; home_club_id: string; away_club_id: string; home_score: number | null; away_score: number | null; kickoff_at: string; status: string; season: number }>;
    clubs: Array<{ id: string; name: string }>;
    competitions: Array<{ id: string; code: string }>;
    provider_mappings: Array<{ internal_entity_id: string; external_id: string; internal_entity_type: string }>;
    player_national_teams: Array<{ player_id: string; national_team_club_id: string }>;
  };
}
export function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (fraction: number) => {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * fraction, low = Math.floor(index), ratio = index - low;
    return sorted[low] * (1 - ratio) + sorted[Math.ceil(index)] * ratio;
  };
  return { count: values.length, mean: values.length ? values.reduce((n, v) => n + v, 0) / values.length : null,
    median: q(0.5), p25: q(0.25), p75: q(0.75), p90: q(0.9), p95: q(0.95), min: sorted[0] ?? null, max: sorted.at(-1) ?? null };
}
/** Offline analysis only: input is a previously captured read-only snapshot.
 * New-field unavailability is reported, never replaced by invented stats. */
export function calibrateStoredPerformances(snapshot: CalibrationSnapshot) {
  const t = snapshot.tables;
  const players = new Map(t.players.map(p => [p.id, p]));
  const fixtures = new Map(t.fixtures.map(f => [f.id, f]));
  const clubs = new Map(t.clubs.map(c => [c.id, c.name]));
  const comps = new Map(t.competitions.map(c => [c.id, c.code]));
  const national = new Map<string, string[]>();
  for (const row of t.player_national_teams) national.set(row.player_id, [...(national.get(row.player_id) ?? []), row.national_team_club_id]);
  const providerFixtureIds = new Set(t.provider_mappings.filter(m => m.internal_entity_type === "fixture").map(m => m.internal_entity_id));
  const performances = t.player_match_stats.flatMap(row => {
    if (!providerFixtureIds.has(row.fixture_id)) return [];
    const player = players.get(row.player_id), fixture = fixtures.get(row.fixture_id);
    if (!player || !fixture) return [];
    const code = comps.get(fixture.competition_id) ?? "UNKNOWN";
    const ownSides = [player.club_id, ...(national.get(player.id) ?? [])];
    const conceded = fixture.home_score !== null && fixture.away_score !== null
      ? ownSides.includes(fixture.home_club_id) ? fixture.away_score : ownSides.includes(fixture.away_club_id) ? fixture.home_score : null : null;
    const position = player.position as PlayerPosition;
    const v3 = scoreStoredPerformance("ELEVEN_STANDARD_V3", row, position, conceded);
    const v4 = scoreStoredPerformance("ELEVEN_STANDARD_V4", row, position, conceded, { allowIncompleteV4: true });
    if (!("entries" in v4)) throw new Error("Expected V4 breakdown");
    return [{ player: player.name, fixture: `${clubs.get(fixture.home_club_id)} vs ${clubs.get(fixture.away_club_id)}`,
      fixtureId: fixture.id, playerId: player.id, position, kickoff: fixture.kickoff_at, competition: code,
      eligibleFinal2026: fixture.season === 2026 && fixture.status === "final" && isScoringEligibleCompetitionCode(code) && isEligibleFixtureKickoff(code, new Date(fixture.kickoff_at)),
      minutes: row.minutes, conceded, stats: row, v3: v3.total, v4: v4.total, difference: Math.round((v4.total - v3.total) * 100) / 100,
      contributors: v4.entries.filter(e => e.units !== 0).sort((a, b) => b.units - a.units).map(e => ({ category: e.label, points: e.units / 100 })),
      coverage: Object.fromEntries(v4.entries.map(e => [e.key, e.count !== null])), components: v4.components,
    }];
  });
  function summary(rows: typeof performances) {
    const categories = [...new Set(rows.flatMap(r => Object.keys(r.components)))];
    return { v3: distribution(rows.map(r => r.v3)), v4Partial: distribution(rows.map(r => r.v4)),
      byPosition: Object.fromEntries((["GK", "DEF", "MID", "FWD"] as const).map(p => {
        const group = rows.filter(r => r.position === p);
        return [p, { v3: distribution(group.map(r => r.v3)), v4Partial: distribution(group.map(r => r.v4)) }];
      })), contributions: Object.fromEntries(categories.map(key => [key, { observedRows: rows.filter(r => r.coverage[key]).length,
        meanObserved: rows.some(r => r.coverage[key]) ? rows.filter(r => r.coverage[key]).reduce((n, r) => n + (r.components[key] ?? 0), 0) / rows.filter(r => r.coverage[key]).length : null,
        meanPartial: rows.some(r => r.coverage[key]) ? rows.reduce((n, r) => n + (r.components[key] ?? 0), 0) / rows.length : null }])),
      coverageByCompetition: Object.fromEntries([...new Set(rows.map(r => r.competition))].sort().map(code => {
        const group = rows.filter(r => r.competition === code);
        return [code, { count: group.length, reportedSnapshots: group.filter(r => r.stats.reported_stats != null).length,
          available: Object.fromEntries(categories.map(key => [key, group.filter(r => r.coverage[key]).length])) }];
      })),
    };
  }
  const eligible = performances.filter(r => r.eligibleFinal2026);
  const appearances = eligible.filter(r => r.minutes > 0);
  const strip = (row: typeof performances[number] | undefined) => row ? {
    player: row.player, fixture: row.fixture, kickoff: row.kickoff, competition: row.competition, position: row.position,
    stats: { minutes: row.minutes, goals: row.stats.goals, assists: row.stats.assists, shotsOnTarget: row.stats.shots_on_target,
      keyPasses: row.stats.chances_created, tackles: row.stats.tackles, interceptions: row.stats.interceptions, blocks: row.stats.blocks,
      saves: row.stats.saves, yellowCards: row.stats.yellow_cards, redCards: row.stats.red_cards, concededByOwnTeam: row.conceded, duelsWon: null, shots: null },
    v3: row.v3, v4Partial: row.v4, difference: row.difference, contributors: row.contributors.slice(0, 5),
  } : null;
  const best = (predicate: (r: typeof performances[number]) => boolean) => strip([...appearances].filter(predicate).sort((a, b) => b.v4 - a.v4)[0]);
  const lowest = (predicate: (r: typeof performances[number]) => boolean) => strip([...appearances].filter(predicate).sort((a, b) => a.v4 - b.v4)[0]);
  return { capturedAt: snapshot.capturedAt, warning: "V4 PARTIAL/INCOMPLETE: historical shots, duels, dribbles, fouls and penalties were not stored. Unknown contributions are NOT measured zero. Legacy counts lost provider null provenance.",
    excludedUnmappedRows: t.player_match_stats.length - performances.length,
    allStored: summary(performances), eligibleFinal2026: summary(eligible), appearancesOnly: summary(appearances),
    duelsWonByPosition: Object.fromEntries(["GK", "DEF", "MID", "FWD"].map(p => [p, { observedRows: 0, meanContribution: null }])),
    archetypes: {
      eliteGoalscorer: best(r => r.stats.goals >= 2), creativeMidfielder: best(r => r.position === "MID" && r.stats.chances_created >= 4),
      defensiveMidfielder: best(r => r.position === "MID" && /^Rodri$|Tchouam|D\. Rice|M\. Caicedo|Kanté|Palhinha/i.test(r.player) && r.stats.tackles + r.stats.interceptions >= 2),
      centerBack: best(r => r.position === "DEF" && /van Dijk|Konaté|Rüdiger|Saliba|Bastoni|Gabriel Magal/i.test(r.player)),
      attackingFullback: best(r => r.position === "DEF" && /Hakimi|Alexander|Theo|Frimpong|Dumfries|Robertson|Davies/i.test(r.player)),
      goalkeeper: best(r => r.position === "GK"),
      physicalStrikerCandidate: best(r => r.position === "FWD" && /Haaland|Kane|Lukaku|Gyökeres/i.test(r.player)),
      lowEventStarter: lowest(r => r.minutes >= 90 && r.stats.goals === 0 && r.stats.assists === 0 && r.stats.shots_on_target === 0 && r.stats.chances_created === 0 && r.stats.tackles + r.stats.interceptions + r.stats.blocks === 0),
      substitute: best(r => r.minutes > 0 && r.minutes < 20),
    },
    topPartial: [...appearances].sort((a, b) => b.v4 - a.v4).slice(0, 8).map(strip),
    lowChecks: { poor90: lowest(r => r.minutes >= 90), cards: lowest(r => r.stats.yellow_cards + r.stats.red_cards > 0),
      concedingKeeper: lowest(r => r.position === "GK" && r.conceded !== null && r.conceded >= 4 && r.minutes >= 60),
      quietSubstitute: lowest(r => r.minutes < 20 && r.stats.goals === 0 && r.stats.assists === 0 && r.stats.shots_on_target === 0 && r.stats.chances_created === 0 && r.stats.tackles + r.stats.interceptions + r.stats.blocks === 0 && r.stats.yellow_cards + r.stats.red_cards === 0), wastefulShooter: null },
    missingBackfill: { fixtures: new Set(eligible.map(r => r.fixtureId)).size, rows: eligible.length,
      from: eligible.map(r => r.kickoff).sort()[0], to: eligible.map(r => r.kickoff).sort().at(-1),
      byCompetition: Object.fromEntries([...new Set(eligible.map(r => r.competition))].sort().map(code => [code, { fixtures: new Set(eligible.filter(r => r.competition === code).map(r => r.fixtureId)).size, rows: eligible.filter(r => r.competition === code).length }])) },
  };
}
