# SEO (Pass 10C)

## Canonical origin
`https://elevenfantasy.com` — never a Vercel/preview URL. Set once in
`src/lib/site-config.ts` (`SITE_URL`), consumed everywhere else
(`metadataBase` in `src/app/layout.tsx`, `robots.ts`, `sitemap.ts`).

## Index / noindex strategy
- **Public, indexable:** `/`, `/about`, `/contact`, `/terms`, `/privacy`,
  `/cookies`, `/disclaimer`, `/data-sources`, `/accessibility`, `/login`,
  `/signup`.
- **Noindex:** everything under `(app)` — `/home`, `/team`, `/draft`,
  `/league`, `/matchup`, `/players` — set ONCE via `robots: { index:
  false, follow: false }` in `src/app/(app)/layout.tsx`'s own `metadata`
  export (inherited by every page in the group, not repeated per page).
  `src/app/robots.ts` disallows the same paths plus `/auth/` and `/api/`
  as a second, coarser layer. Neither is a security boundary — the real
  protection is the Supabase session check already in `(app)/layout.tsx`.

## Metadata architecture
`src/app/layout.tsx` sets the shared defaults: `metadataBase`, title
template (`%s — Eleven`), description, OpenGraph, Twitter card, icons,
manifest link, and default `robots: { index: true, follow: true }`. Every
public page under `src/app/(public)/*` only needs to export its own
`{ title, description, alternates: { canonical } }` — everything else is
inherited. The landing page (`src/app/page.tsx`) exports no metadata at
all; the root default already describes it exactly.

**Adding a new public page:** put it under `src/app/(public)/`, export
`metadata` with at least `title` and `alternates.canonical`, and add its
path to `src/app/sitemap.ts`'s `staticRoutes` list.

## Sitemap / robots
`src/app/sitemap.ts` lists only the public pages above (served at
`/sitemap.xml`). `src/app/robots.ts` allows `/` and disallows the
authenticated + internal paths (served at `/robots.txt`).

## Structured data
`src/components/seo/structured-data.tsx`, rendered once in the root
layout: `Organization` + `WebSite` + `SoftwareApplication` JSON-LD, built
entirely from `site-config.ts` constants (no user-controlled input).
Deliberately omits ratings, reviews, prices/offers, user counts, awards,
social profiles, and partnership claims — none of those are verified
facts.

## Social image / favicon / manifest
See `docs/LEGAL-COMPLIANCE.md`'s brand-asset section for how
`brand-assets/socialshare11-source.png` (the approved reference, kept
out of `public/` since only the processed 1200×630 crop should be
served) became `public/og-image.jpg`. Icons: `src/app/icon.svg` (favicon,
tiny-size-optimized), `src/app/apple-icon.png` (180×180),
`src/app/favicon.ico` (16/32/48 multi-res), `public/icon-192.png` /
`public/icon-512.png` (manifest). `src/app/manifest.ts` generates
`/manifest.webmanifest`. `public/brand/mark.svg` is the refined gradient
mark used inline by `Wordmark` — not the same file as the favicon (which
needs a bolder, simpler version to stay legible at 16px; see that file's
own comment).

## Known limitation
`/login` and `/signup` have minimal per-page metadata (title only) and
are not in the sitemap (low search value; reachable from the landing
page). Not addressed further in this pass.
