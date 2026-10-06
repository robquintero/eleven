import "server-only";
import { getApiKey } from "./config.ts";
import { ApiFootballNetworkError, ApiFootballResponseError } from "./errors.ts";
import {
  ensureSuccessfulStatus,
  extractPagination,
  hasProviderErrors,
  parseQuotaHeaders,
} from "./response-helpers.ts";
import type {
  ApiFootballEnvelope,
  ApiFootballFixtureItem,
  ApiFootballFixturePlayersItem,
  ApiFootballLeagueItem,
  ApiFootballPlayerItem,
  ApiFootballStatusResponse,
  ApiFootballTeamItem,
} from "@/lib/football-providers/api-football/types";
import type { ProviderResponseMeta } from "@/lib/football-providers/types";

/**
 * The one controlled API-Football client. Every provider request in the
 * codebase goes through `request()` below — nothing else should call
 * `fetch()` against api-sports.io directly. See docs/architecture.md
 * "Football data provider" for the full boundary this enforces.
 */

const BASE_URL = "https://v3.football.api-sports.io";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface RequestOptions {
  timeoutMs?: number;
}

async function request<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: RequestOptions = {}
): Promise<{ data: ApiFootballEnvelope<T>; meta: ProviderResponseMeta }> {
  const apiKey = getApiKey();
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "x-apisports-key": apiKey },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiFootballNetworkError(`API-Football request to ${path} timed out after ${timeoutMs}ms`);
    }
    throw new ApiFootballNetworkError(
      `API-Football request to ${path} failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timeout);
  }

  const quota = parseQuotaHeaders(response.headers);
  ensureSuccessfulStatus(response.status, path, quota);

  const json = (await response.json()) as ApiFootballEnvelope<T>;

  if (hasProviderErrors(json.errors)) {
    throw new ApiFootballResponseError(
      `API-Football returned errors for ${path}: ${JSON.stringify(json.errors)}`,
      response.status
    );
  }

  return {
    data: json,
    meta: { quota, pagination: extractPagination(json.paging) },
  };
}

// ---------------------------------------------------------------------
// Typed endpoint methods. Pagination (the `page` param) is always
// explicit and caller-controlled — this client never loops through pages
// on its own. See docs/architecture.md "Quota / rate-limit protection."
// ---------------------------------------------------------------------

export function getStatus() {
  return request<ApiFootballStatusResponse>("/status");
}

export function getLeagues(
  params: { id?: number; season?: number; search?: string; country?: string; type?: string } = {}
) {
  return request<ApiFootballLeagueItem>("/leagues", params);
}

export function getTeams(params: { league: number; season: number }) {
  return request<ApiFootballTeamItem>("/teams", params);
}

export function getPlayers(params: { team: number; season: number; page?: number }) {
  return request<ApiFootballPlayerItem>("/players", params);
}

export function getFixtures(params: {
  league: number;
  season: number;
  page?: number;
  /** YYYY-MM-DD — bounds a fixtures sync to a date range instead of an entire season at once. */
  from?: string;
  to?: string;
  /** Provider-documented completed-status filter, used only by scoped history refetch. */
  status?: "FT-AET-PEN";
}) {
  return request<ApiFootballFixtureItem>("/fixtures", params);
}

/** One completed fixture's per-player statistics, grouped by team (two items: home, away). */
export function getFixturePlayers(params: { fixture: number }) {
  return request<ApiFootballFixturePlayersItem>("/fixtures/players", params);
}
