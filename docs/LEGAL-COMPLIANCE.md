# Legal / Compliance (Pass 10C)

**None of this constitutes legal advice or legal clearance.** It documents
what was implemented and what still needs human legal review before a
broad public launch — see the TODO list at the bottom.

## Implemented pages
`/about`, `/contact`, `/terms`, `/privacy`, `/cookies`, `/disclaimer`,
`/data-sources`, `/accessibility` — all under `src/app/(public)/`, sharing
`src/components/public/legal-page.tsx` for consistent typography and
`src/app/(public)/layout.tsx` for the header/footer shell.

## Storage/tracking audit (actually observed, not assumed)
Audited the real codebase (`grep` for `localStorage`/`sessionStorage`/
analytics SDKs, and the Supabase client setup): **the only browser storage
is Supabase Auth's own session cookies** (`src/lib/supabase/client.ts`,
`src/proxy.ts`). No analytics, advertising, or marketing tracking exists
anywhere in the app. Documented plainly on `/cookies` and `/privacy`
rather than a generic cookie-policy template, and explicitly explains why
no consent banner was added (strictly-necessary cookies are exempt from
consent requirements under common frameworks; a banner with nothing
optional to consent to would misrepresent the product).

## Data-provider disclosure
`/data-sources` discloses API-Football as the football-data provider,
explains normalization into Eleven's own system, states scoring is
calculated by Eleven (not the provider), and disclaims official
partnership. **Attribution-obligation audit result: inconclusive** — no
attribution/license terms were found already documented anywhere in this
project (`docs/`, provider client code). Rather than inventing a
requirement, this is flagged as a human/legal TODO.

## Brand assets
The approved reference (`socialshare11.png`, provided for this pass) was
audited and found to already match the brief's preferred OG content
hierarchy and aspect ratio almost exactly (1734×907 ≈ 1.912:1 vs. the
1200×630 target's 1.905:1). It was center-cropped by ~3px/side (no
stretch) and re-encoded as JPEG for file size, producing
`public/og-image.jpg` — no redesign was needed. The original is kept at
`brand-assets/socialshare11-source.png` (outside `public/`, not served)
as the reference source. The geometric "11" mark was recreated as an
original SVG (`src/app/icon.svg`, `public/brand/mark.svg`) inspired by
the reference's proportions/visual language, not traced from the raster
file.

## Attribution / Beta status
`Developed solely by Quintero Digital` + `© 2026 Quintero Digital LLC.
All rights reserved.` appear once, understated, in
`src/components/shell/site-footer.tsx` (public pages) and a small block
in `src/components/shell/app-shell.tsx`'s sidebar (authenticated shell) —
not repeated per component. An `ELEVEN · BETA` indicator appears in both
of the same two places. All values are centralized in
`src/lib/site-config.ts`.

## Human/legal review required before broad public launch
- Terms of Use (`/terms`) — no jurisdiction/governing-law clause, no
  arbitration clause, no confirmed age-eligibility restriction; these
  were deliberately left unwritten rather than invented.
- Privacy Policy (`/privacy`) — no confirmed data-retention period for
  closed accounts; no jurisdiction-specific rights language (GDPR/CCPA
  etc.).
- "Eleven" name/trademark clearance.
- Any league/club/player marks referenced in product copy.
- API-Football data licensing and attribution obligations (see above).
- This entire document set, as a whole, before public launch.
