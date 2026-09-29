/**
 * Hand-written subset of the generated Supabase database types, covering
 * only the tables/RPCs `src/data-access/*` actually touches. Shaped to
 * match what @supabase/postgrest-js's generics expect (Row/Insert/Update/
 * Relationships per table, Views/Functions alongside Tables) so `.from()`/
 * `.rpc()` calls stay properly typed instead of silently collapsing to
 * `never`.
 *
 * TEMPORARY: this file exists because generating the real thing
 * (`supabase gen types typescript`) requires either a linked remote
 * project or a running local Postgres instance, neither of which was
 * available while writing this pass — see the "manual steps" note in the
 * Pass 6 report. Once the project is linked, replace this file with:
 *
 *   npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 *
 * and delete this comment. Do not hand-add tables here in the meantime —
 * extend `src/domain/*` (the application's own domain types) instead, and
 * only widen this file with the columns a new data-access function
 * actually reads/writes.
 */

type LeagueSettingsJson = {
  maxTeams: number;
  squadSize: number;
  starterCount: number;
  waiverMode: "priority" | "faab";
  playoffEnabled: boolean;
  draftType: "snake";
  pickTimerSeconds: number;
  tradeDeadline?: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { display_name?: string; avatar_url?: string | null };
        Relationships: [];
      };
      fantasy_leagues: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          status: "draft" | "active" | "completed" | "archived";
          created_by_user_id: string;
          settings: LeagueSettingsJson;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      league_memberships: {
        Row: {
          league_id: string;
          user_id: string;
          role: "manager" | "commissioner";
          joined_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      fantasy_teams: {
        Row: {
          id: string;
          league_id: string;
          owner_user_id: string;
          name: string;
          abbreviation: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { name?: string; abbreviation?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_league: {
        Args: {
          p_name: string;
          p_team_name: string;
          p_team_abbreviation: string;
          p_settings?: Partial<LeagueSettingsJson> | null;
        };
        Returns: { league_id: string; invite_code: string; fantasy_team_id: string }[];
      };
      join_league_by_invite_code: {
        Args: {
          p_invite_code: string;
          p_team_name: string;
          p_team_abbreviation: string;
        };
        Returns: { league_id: string; fantasy_team_id: string }[];
      };
    };
  };
}
