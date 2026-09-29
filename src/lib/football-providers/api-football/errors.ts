import type { ProviderQuota } from "@/lib/football-providers/types";

/** Base class for every API-Football failure — lets calling code catch "any provider problem" with one `instanceof`. */
export class ApiFootballError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiFootballError";
  }
}

/** `API_FOOTBALL_KEY` is missing or empty. Thrown before any network call is made. */
export class ApiFootballConfigError extends ApiFootballError {
  constructor(message: string) {
    super(message);
    this.name = "ApiFootballConfigError";
  }
}

/** The request never got a response: DNS/connection failure, or it was aborted by the timeout. */
export class ApiFootballNetworkError extends ApiFootballError {
  constructor(message: string) {
    super(message);
    this.name = "ApiFootballNetworkError";
  }
}

/** HTTP 429 — the request budget (daily or per-minute) is exhausted. */
export class ApiFootballRateLimitError extends ApiFootballError {
  quota: ProviderQuota;

  constructor(message: string, quota: ProviderQuota) {
    super(message);
    this.name = "ApiFootballRateLimitError";
    this.quota = quota;
  }
}

/** A non-2xx HTTP status, or a 2xx response whose own `errors` field is non-empty. */
export class ApiFootballResponseError extends ApiFootballError {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiFootballResponseError";
    this.status = status;
  }
}
