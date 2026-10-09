/**
 * Autonomous stabilization pass, Phase D (PLAYER_NOT_FOUND investigation):
 * structured, safe server-side logging for an RPC failure already
 * classified as a genuine ERROR (never an expected game-rule outcome --
 * see each error-copy module's own `..._KIND` map). Before this, a
 * PLAYER_NOT_FOUND (or any other "error"-kind) RPC failure left no trace
 * anywhere; if it recurs, Vercel's server logs now carry exactly the ids
 * involved and when, closing the observability gap the Pass 1/3
 * investigations hit ("not verifiable from available evidence").
 *
 * Deliberately logs only opaque identifiers Eleven already treats as
 * safe to pass around client-side (league/draft/player/team UUIDs,
 * never an email, name, or session token) -- see AGENTS.md-adjacent
 * security guidance on never logging credentials or PII.
 */
export function logUnexpectedActionError(context: {
  action: string;
  code: string;
  ids: Record<string, string>;
}): void {
  console.error(
    `[action-error] ${context.action} failed with ${context.code}`,
    JSON.stringify({ ...context.ids, timestamp: new Date().toISOString() })
  );
}
