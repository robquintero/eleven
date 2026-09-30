export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      clubs: {
        Row: {
          code: string
          competition_id: string
          created_at: string
          id: string
          name: string
          short_name: string
          updated_at: string
        }
        Insert: {
          code: string
          competition_id: string
          created_at?: string
          id?: string
          name: string
          short_name: string
          updated_at?: string
        }
        Update: {
          code?: string
          competition_id?: string
          created_at?: string
          id?: string
          name?: string
          short_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          code: string
          country: string
          created_at: string
          id: string
          name: string
          season: number | null
          updated_at: string
        }
        Insert: {
          code: string
          country: string
          created_at?: string
          id?: string
          name: string
          season?: number | null
          updated_at?: string
        }
        Update: {
          code?: string
          country?: string
          created_at?: string
          id?: string
          name?: string
          season?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      domain_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          fantasy_team_id: string | null
          id: string
          league_id: string | null
          payload: Json
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          fantasy_team_id?: string | null
          id?: string
          league_id?: string | null
          payload?: Json
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          fantasy_team_id?: string | null
          id?: string
          league_id?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_events_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_orders: {
        Row: {
          draft_id: string
          fantasy_team_id: string
          position: number
        }
        Insert: {
          draft_id: string
          fantasy_team_id: string
          position: number
        }
        Update: {
          draft_id?: string
          fantasy_team_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_orders_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_orders_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_picks: {
        Row: {
          draft_id: string
          fantasy_team_id: string
          id: string
          pick_number: number
          picked_at: string
          player_id: string
          round: number
        }
        Insert: {
          draft_id: string
          fantasy_team_id: string
          id?: string
          pick_number: number
          picked_at?: string
          player_id: string
          round: number
        }
        Update: {
          draft_id?: string
          fantasy_team_id?: string
          id?: string
          pick_number?: number
          picked_at?: string
          player_id?: string
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_picks_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          completed_at: string | null
          created_at: string
          current_pick: number
          current_round: number
          id: string
          league_id: string
          started_at: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_pick?: number
          current_round?: number
          id?: string
          league_id: string
          started_at?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_pick?: number
          current_round?: number
          id?: string
          league_id?: string
          started_at?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drafts_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_leagues: {
        Row: {
          created_at: string
          created_by_user_id: string
          id: string
          invite_code: string
          name: string
          settings: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          id?: string
          invite_code: string
          name: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          id?: string
          invite_code?: string
          name?: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      fantasy_player_scores: {
        Row: {
          breakdown: Json
          calculated_at: string
          fantasy_round_id: string | null
          fixture_id: string
          id: string
          player_id: string
          points: number
          scoring_rule_version: string
        }
        Insert: {
          breakdown?: Json
          calculated_at?: string
          fantasy_round_id?: string | null
          fixture_id: string
          id?: string
          player_id: string
          points?: number
          scoring_rule_version?: string
        }
        Update: {
          breakdown?: Json
          calculated_at?: string
          fantasy_round_id?: string | null
          fixture_id?: string
          id?: string
          player_id?: string
          points?: number
          scoring_rule_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_player_scores_fantasy_round_id_fkey"
            columns: ["fantasy_round_id"]
            isOneToOne: false
            referencedRelation: "fantasy_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_player_scores_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_player_scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_rounds: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          league_id: string
          number: number
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          league_id: string
          number: number
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          league_id?: string
          number?: number
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_rounds_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_teams: {
        Row: {
          abbreviation: string
          created_at: string
          id: string
          league_id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          abbreviation: string
          created_at?: string
          id?: string
          league_id: string
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          created_at?: string
          id?: string
          league_id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      fixtures: {
        Row: {
          away_club_id: string
          away_score: number | null
          competition_id: string
          created_at: string
          home_club_id: string
          home_score: number | null
          id: string
          kickoff_at: string
          season: number
          status: string
          updated_at: string
        }
        Insert: {
          away_club_id: string
          away_score?: number | null
          competition_id: string
          created_at?: string
          home_club_id: string
          home_score?: number | null
          id?: string
          kickoff_at: string
          season: number
          status?: string
          updated_at?: string
        }
        Update: {
          away_club_id?: string
          away_score?: number | null
          competition_id?: string
          created_at?: string
          home_club_id?: string
          home_score?: number | null
          id?: string
          kickoff_at?: string
          season?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_away_club_id_fkey"
            columns: ["away_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_home_club_id_fkey"
            columns: ["home_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      league_memberships: {
        Row: {
          joined_at: string
          league_id: string
          role: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          league_id: string
          role?: string
          user_id: string
        }
        Update: {
          joined_at?: string
          league_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_memberships_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_player_ownership: {
        Row: {
          created_at: string
          fantasy_team_id: string
          league_id: string
          player_id: string
          roster_entry_id: string
        }
        Insert: {
          created_at?: string
          fantasy_team_id: string
          league_id: string
          player_id: string
          roster_entry_id: string
        }
        Update: {
          created_at?: string
          fantasy_team_id?: string
          league_id?: string
          player_id?: string
          roster_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_player_ownership_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_player_ownership_roster_entry_id_league_id_fantasy__fkey"
            columns: [
              "roster_entry_id",
              "league_id",
              "fantasy_team_id",
              "player_id",
            ]
            isOneToOne: false
            referencedRelation: "roster_entries"
            referencedColumns: [
              "id",
              "league_id",
              "fantasy_team_id",
              "player_id",
            ]
          },
        ]
      }
      lineup_slots: {
        Row: {
          created_at: string
          fantasy_round_id: string
          id: string
          locked_at: string | null
          roster_entry_id: string
          slot: string
          starter: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          fantasy_round_id: string
          id?: string
          locked_at?: string | null
          roster_entry_id: string
          slot: string
          starter?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          fantasy_round_id?: string
          id?: string
          locked_at?: string | null
          roster_entry_id?: string
          slot?: string
          starter?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineup_slots_fantasy_round_id_fkey"
            columns: ["fantasy_round_id"]
            isOneToOne: false
            referencedRelation: "fantasy_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_slots_roster_entry_id_fkey"
            columns: ["roster_entry_id"]
            isOneToOne: false
            referencedRelation: "roster_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      matchup_scores: {
        Row: {
          fantasy_team_id: string
          final_points: number | null
          id: string
          live_points: number
          matchup_id: string
          projected_points: number | null
          updated_at: string
        }
        Insert: {
          fantasy_team_id: string
          final_points?: number | null
          id?: string
          live_points?: number
          matchup_id: string
          projected_points?: number | null
          updated_at?: string
        }
        Update: {
          fantasy_team_id?: string
          final_points?: number | null
          id?: string
          live_points?: number
          matchup_id?: string
          projected_points?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchup_scores_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchup_scores_matchup_id_fkey"
            columns: ["matchup_id"]
            isOneToOne: false
            referencedRelation: "matchups"
            referencedColumns: ["id"]
          },
        ]
      }
      matchups: {
        Row: {
          away_fantasy_team_id: string
          created_at: string
          fantasy_round_id: string
          home_fantasy_team_id: string
          id: string
          league_id: string
          status: string
          updated_at: string
        }
        Insert: {
          away_fantasy_team_id: string
          created_at?: string
          fantasy_round_id: string
          home_fantasy_team_id: string
          id?: string
          league_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          away_fantasy_team_id?: string
          created_at?: string
          fantasy_round_id?: string
          home_fantasy_team_id?: string
          id?: string
          league_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchups_away_fantasy_team_id_fkey"
            columns: ["away_fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchups_fantasy_round_id_fkey"
            columns: ["fantasy_round_id"]
            isOneToOne: false
            referencedRelation: "fantasy_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchups_home_fantasy_team_id_fkey"
            columns: ["home_fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchups_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_stats: {
        Row: {
          assists: number
          blocks: number
          chances_created: number
          clean_sheet: boolean | null
          created_at: string
          fixture_id: string
          goals: number
          id: string
          interceptions: number
          minutes: number
          player_id: string
          red_cards: number
          saves: number
          shots_on_target: number
          started: boolean
          tackles: number
          updated_at: string
          yellow_cards: number
        }
        Insert: {
          assists?: number
          blocks?: number
          chances_created?: number
          clean_sheet?: boolean | null
          created_at?: string
          fixture_id: string
          goals?: number
          id?: string
          interceptions?: number
          minutes?: number
          player_id: string
          red_cards?: number
          saves?: number
          shots_on_target?: number
          started?: boolean
          tackles?: number
          updated_at?: string
          yellow_cards?: number
        }
        Update: {
          assists?: number
          blocks?: number
          chances_created?: number
          clean_sheet?: boolean | null
          created_at?: string
          fixture_id?: string
          goals?: number
          id?: string
          interceptions?: number
          minutes?: number
          player_id?: string
          red_cards?: number
          saves?: number
          shots_on_target?: number
          started?: boolean
          tackles?: number
          updated_at?: string
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_match_stats_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          active: boolean
          availability_status: string | null
          club_id: string
          competition_id: string
          created_at: string
          id: string
          name: string
          nationality: string | null
          position: string
          shirt_number: number | null
          short_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          availability_status?: string | null
          club_id: string
          competition_id: string
          created_at?: string
          id?: string
          name: string
          nationality?: string | null
          position: string
          shirt_number?: number | null
          short_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          availability_status?: string | null
          club_id?: string
          competition_id?: string
          created_at?: string
          id?: string
          name?: string
          nationality?: string | null
          position?: string
          shirt_number?: number | null
          short_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_mappings: {
        Row: {
          created_at: string
          external_id: string
          id: string
          internal_entity_id: string
          internal_entity_type: string
          provider: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          internal_entity_id: string
          internal_entity_type: string
          provider: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          internal_entity_id?: string
          internal_entity_type?: string
          provider?: string
        }
        Relationships: []
      }
      roster_entries: {
        Row: {
          acquired_at: string
          acquisition_type: string
          created_at: string
          fantasy_team_id: string
          id: string
          league_id: string
          player_id: string
          status: string
          updated_at: string
        }
        Insert: {
          acquired_at?: string
          acquisition_type: string
          created_at?: string
          fantasy_team_id: string
          id?: string
          league_id: string
          player_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          acquired_at?: string
          acquisition_type?: string
          created_at?: string
          fantasy_team_id?: string
          id?: string
          league_id?: string
          player_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_entries_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_rules: {
        Row: {
          created_at: string
          id: string
          league_id: string | null
          multiplier: number
          position_modifier: Json | null
          stat: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id?: string | null
          multiplier: number
          position_modifier?: Json | null
          stat: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string | null
          multiplier?: number
          position_modifier?: Json | null
          stat?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rules_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_assets: {
        Row: {
          from_team_id: string
          id: string
          player_id: string
          to_team_id: string
          trade_id: string
        }
        Insert: {
          from_team_id: string
          id?: string
          player_id: string
          to_team_id: string
          trade_id: string
        }
        Update: {
          from_team_id?: string
          id?: string
          player_id?: string
          to_team_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_assets_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_assets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_assets_to_team_id_fkey"
            columns: ["to_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_assets_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          accepted_at: string | null
          completed_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          league_id: string
          proposing_team_id: string
          receiving_team_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          league_id: string
          proposing_team_id: string
          receiving_team_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          league_id?: string
          proposing_team_id?: string
          receiving_team_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_proposing_team_id_fkey"
            columns: ["proposing_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_receiving_team_id_fkey"
            columns: ["receiving_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          actor_user_id: string | null
          created_at: string
          fantasy_team_id: string | null
          id: string
          league_id: string
          metadata: Json | null
          reference: string | null
          type: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          fantasy_team_id?: string | null
          id?: string
          league_id: string
          metadata?: Json | null
          reference?: string | null
          type: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          fantasy_team_id?: string | null
          id?: string
          league_id?: string
          metadata?: Json | null
          reference?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_claims: {
        Row: {
          drop_player_id: string | null
          fantasy_team_id: string
          id: string
          league_id: string
          priority: number
          processed_at: string | null
          status: string
          submitted_at: string
          target_player_id: string
        }
        Insert: {
          drop_player_id?: string | null
          fantasy_team_id: string
          id?: string
          league_id: string
          priority: number
          processed_at?: string | null
          status?: string
          submitted_at?: string
          target_player_id: string
        }
        Update: {
          drop_player_id?: string | null
          fantasy_team_id?: string
          id?: string
          league_id?: string
          priority?: number
          processed_at?: string | null
          status?: string
          submitted_at?: string
          target_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiver_claims_drop_player_id_fkey"
            columns: ["drop_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_claims_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_claims_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_claims_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_league: {
        Args: {
          p_name: string
          p_settings?: Json
          p_team_abbreviation: string
          p_team_name: string
        }
        Returns: {
          fantasy_team_id: string
          invite_code: string
          league_id: string
        }[]
      }
      generate_invite_code: { Args: { p_length?: number }; Returns: string }
      is_league_commissioner: {
        Args: { p_league_id: string }
        Returns: boolean
      }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      join_league_by_invite_code: {
        Args: {
          p_invite_code: string
          p_team_abbreviation: string
          p_team_name: string
        }
        Returns: {
          fantasy_team_id: string
          league_id: string
        }[]
      }
      shares_league_with: { Args: { p_user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
