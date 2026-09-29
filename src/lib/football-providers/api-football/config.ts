import { ApiFootballConfigError } from "./errors.ts";

/**
 * Reads `API_FOOTBALL_KEY` and throws a typed, non-secret-leaking error if
 * it's missing — split out of `client.ts` (which carries `"server-only"`)
 * so the "missing key" behavior is testable without needing the
 * `--conditions=react-server` flag plain `node --test` doesn't pass. This
 * file itself performs no I/O and holds no risk if ever imported
 * elsewhere: `API_FOOTBALL_KEY` has no `NEXT_PUBLIC_` prefix, so Next
 * never inlines its value into a client bundle regardless.
 */
export function getApiKey(): string {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new ApiFootballConfigError(
      "API_FOOTBALL_KEY is missing. Add it directly to .env.local and try again."
    );
  }
  return key;
}
