import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { bigFiveLeagueFromCompetitionCode } from "@/lib/leagues";
import type { Player } from "@/lib/types/fantasy";

/**
 * The real football player database (`public.players`), mapped to the UI's
 * `Player` view-model. `[]` until Pass 8's ingestion pass writes real rows
 * — this reads whatever exists, it never falls back to a mock roster.
 *
 * Deliberately does not compute `fantasyPoints`/`ownership`/`recentForm`/
 * `seasonStats`: those depend on the scoring engine and league-scoped
 * ownership, neither of which exist yet. Leaving them at their honest
 * defaults (0 / undefined) is correct — Pass 8 wires the real values in
 * once ingestion + scoring exist, without this function's shape changing.
 */
export async function getPlayerDatabase(): Promise<Player[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("players")
    .select(
      "id, name, position, shirt_number, availability_status, club_id, clubs(id, name, short_name, competition_id, competitions(code))"
    )
    .eq("active", true)
    .order("name", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => {
    const club = row.clubs;
    const competitionCode = club?.competitions?.code ?? null;

    return {
      id: row.id,
      externalId: "",
      name: row.name,
      club: {
        id: club?.id ?? "unknown",
        name: club?.name ?? "Unknown club",
        shortName: club?.short_name ?? "—",
        league: bigFiveLeagueFromCompetitionCode(competitionCode),
        crestColor: "#6e6e73",
      },
      position: row.position as Player["position"],
      number: row.shirt_number ?? undefined,
      fantasyPoints: 0,
      availability: (row.availability_status as Player["availability"]) ?? "available",
    };
  });
}
