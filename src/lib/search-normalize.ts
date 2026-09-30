/**
 * Strips diacritics/accents from Latin text for accent-insensitive search
 * (Pass 10.5B) — "mbappe" must find "Mbappé". Case-insensitivity is
 * handled separately by Postgres `ilike`; this only handles accents.
 * Decomposes to NFD (base letter + combining marks) then drops the
 * combining marks (U+0300–U+036F) — the standard, dependency-free way to
 * do this in JS. The SAME normalization is applied to both sides of a
 * comparison: the incoming search term here, and stored column values via
 * the matching `*_unaccented` generated columns
 * (supabase/migrations/20260930040000_accent_insensitive_search.sql),
 * which use Postgres's `unaccent()` — the two must produce equivalent
 * results for the same input, or search would silently stop matching.
 */
export function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
