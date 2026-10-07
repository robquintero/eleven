/** Shared visual labels only. Never use for persisted keys or game state. */
const productLabels: Record<string, string> = {
  STARTING_XI: "Starting XI", OPERATIONS_FEED: "Activity", OPERATIONS: "Round overview",
  ROUND_INTELLIGENCE: "Round overview", LIVE_FIXTURES: "Live fixtures", NEXT_LOCK: "Next lock",
  SQUAD_STATUS: "Squad status", MATCHUP_COMMAND: "Matchup", FORM_INTELLIGENCE: "Player form",
  TRADE_DESK: "Trades", DRAFT_BOARD: "Draft board", YOUR_LEAGUES: "Your leagues",
  LEAGUE_TABLE: "Standings", FIXTURE_FEED: "Fixtures", AVAILABLE_PLAYERS: "Available players",
  DRAFT_STATUS: "Draft status", DRAFT_ORDER: "Draft order", RECENT_PICKS: "Recent picks", SQUAD: "Squad",
  PLAYER_RECORD: "Player record", BENCH: "Bench", FORWARDS: "Forwards", MIDFIELD: "Midfield", DEFENCE: "Defence", GOALKEEPER: "Goalkeeper", MEMBERS: "Managers", STANDINGS: "Standings", PLAYERS: "Players",
};
export function uiLabel(label: string): string {
  return productLabels[label] ?? label;
}
