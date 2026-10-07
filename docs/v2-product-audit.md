# Eleven V2 complete product migration

Baseline: `e37b70303efda88431e4c5d3f690b8f65d6462a9` on clean `main`.
The released six core pages and authenticated frame are the authority. This pass
migrates remaining entrances and secondary workflows; it does not recompose those
core pages or change game rules. Release SHA/deployment evidence is reported with
the release rather than embedded in this commit.

## 1. Complete surface inventory

| Category | Actual routes and states | Presentation / action boundary |
| --- | --- | --- |
| Public | `/`; `/about`, `/contact`, `/data-sources`, `/accessibility`, `/terms`, `/privacy`, `/cookies`, `/disclaimer` | LandingView/PublicShell; existing LegalPage prose and SiteFooter. Signed-in root redirect remains `/home`. |
| Authentication | `/login`, `/signup`, `/forgot-password`, `/reset-password` | Sign-in/up, submitted email confirmation/resend/cooldown, unconfirmed account, callback error, neutral reset-email sent, expired recovery, new password/error/success. `/auth/callback` is a redirect handler, not a separate screen. |
| Onboarding | No memberships on Home/Team/Matchup/Draft/League; Create/Join League dialogs | Existing league forms/actions. Home league setup, Draft waiting/ready/unavailable, commissioner's format and next-season controls are real lifecycle states, not additional routes. |
| Account | `/account`; shell profile menu | Identity/display-name update, password update, real league list, sign-out, blocked/typed-email account deletion. There is no separate preferences/profile/theme settings route. |
| Core | `/home`, `/team`, `/matchup`, `/players`, `/draft`, `/league` | Approved V2 presenters, with unchanged reads, streaming, retained client state and mutations. |
| Spectator/history | `/team/[teamId]`, `/matchup/[matchupId]`, `/league/seasons/[number]` | Read-only team/matchup and historical round views; existing permission checks and historical score sources. Season detail now uses V2 standings/results with original result ordering preserved. |
| System | Root `not-found.tsx`, `error.tsx`; six route loading files and two spectator loading files | Authentication redirects to sign-in; unauthorized/missing spectator/archive resources use the existing not-found path. No custom offline page, standalone unauthorized page or toast system exists. Empty/unavailable squad, catalog, fixtures, trades, records, results, standings and Inspector fields stay contextual. |
| Overlays/controls | Player Inspector inline/right/bottom; player drop confirmation; game rules/current and historical scoring; Create/Join; league deletion; trade manager/players/review/loading/error; account deletion inline | Existing Base UI Dialog/Sheet primitives and native controls. Command/search, profile menu, league switcher, native round/catalog selectors, draft position controls, native title tooltips, action feedback and navigation pending strip are also user-facing surfaces. |
| Non-UI endpoints/assets | Two cron route handlers, manifest, robots, sitemap, structured data and icons | Not product screens; unchanged except viewport metadata. No provider or cron endpoint invoked. |

Inactive legacy presenters and unused generic UI primitives are not new routes;
they were inspected for active imports, not promoted into the product.

## 2–5. Review frameworks and findings

Used `emil-design-eng`, `mobile-native`, `break-ui` (including its realistic-value
catalog), `apple-design`, `find-animation-opportunities` and
`animation-vocabulary`. Apple guidance informed response, restraint, type and
reduced motion; no Apple visual skin or glass layers were introduced. Existing
Base UI/native controls met the requirements, so no library selection was needed.

| Before | After | Why |
| --- | --- | --- |
| V1 public/auth palette, duplicated terminal captions and form titles | Canonical `.product-v2` token mapping, shared public shell and one calm auth surface | Secondary journeys now belong to the same product. |
| Landing's four boxed pillars and operational disclaimer | Specific football proposition, clearly illustrative formation, core loop, competitions, actual scoring/ownership/market benefits and CTA | Explain the product without fake metrics or a dashboard masquerading as marketing. |
| Create/Join both navigate to the same League destination | The selected existing form opens directly | First-run intent has an immediate next step. |
| Account repeats box boundaries and puts feedback into the control row | Divided sections and dedicated feedback rows | Settings hierarchy is calmer; errors remain readable. |
| Archive detail defaults to terminal table/results | Existing V2 standings and compact results, preserving chronological input order | History feels consistent without changing history. |
| Shell menus lack keyboard dismissal/roving focus | Focus first/selected item; arrows/Home/End; Escape returns focus; Tab exits normally | Menus work without a mouse. |
| Search portal's descendant-only V2 selectors miss its root | Correct root selectors, bounded dynamic-viewport list, no keyboard entry motion | Touch targets and bounds now apply to the real portal. |
| Small trade options, clipped names and one long combined mobile list | 44px wrapped options and two labelled, bounded roster lists | Both sides remain discoverable while selecting from 16-player rosters. |

| Severity | Field / realistic case | Failure and fix |
| --- | --- | --- |
| Broken | Password error at 375px | Flex-column wrapping put feedback in another column beyond the viewport. `product-v2.css`: mobile form wrapping disabled and feedback basis reset. |
| Broken | Champion `InternationalFootballCollectiveWithoutSpaces`, 320px | Champion text's flex minimum overflowed the panel. `season-panel.tsx`: shrink-proof icon, `min-width:0`, wrap anywhere. |
| Fragile | Shell profile / league menus | Escape and keyboard item navigation were absent. Shared `use-menu-focus.ts` adds focus behavior without changing actions. |
| Fragile | Emoji-first profile name | Indexing a UTF-16 character could split the glyph. `profile-control.tsx`: grapheme segments with first/last word and neutral empty fallback. |
| Fragile | Long team/player names in trade/search | Truncation or unbroken metadata could conceal identity/push controls. Dedicated wrapping columns, bounded metadata, full trade names and full-value titles. |
| Broken contrast | GK/MID/FWD tint on selected V2 canvas | Double tint could fall below 4.5:1. Shared position badge fill becomes 5%, keeping text hues and 20% border unchanged. Contrast tests now cover legacy and V2 palettes, hover/selected/warning surfaces. |

Fixtures use the same props/action boundaries as production. Display name is
1–60 characters; abbreviation 2–5; password minimum 8. League/team/player names
have no upper limit in the inspected action/presentation boundary, so realistic
long compounds and diacritics are tested. Email is the submitted/session string;
long addresses wrap. Numbers include real zero, missing values, negative values
and 1,234.56; lists cover empty, one and multiple entries, up to full 16-player
trade rosters. Core catalog remains paginated; no new large data render is added.
The fixtures are script-only, selected by `window.mount(state)`, never production
routes or data. No RTL product support is claimed.

## 6–13. Migration and core cohesion

- Landing: a consumer football entrance with labelled code-based product proof;
  no new imagery, remote data, invented scores, testimonials or counts.
- Auth: all four routes and their existing branches share the V2 shell/panel;
  human headings, labelled password independent of its recovery link, preserved
  field names/autocomplete/validation, email keyboard semantics, announced errors
  and busy forms. Confirmation/resend throttling and reset privacy stay intact.
- Onboarding: clear Create/Join choices; existing dialogs/actions; waiting and
  ready Draft states link to League where useful. No fabricated progress.
- Account: Profile, Password, Your leagues, Session, Delete account. Typed email
  and commissioner blocking remain unchanged. No preferences system added.
- System: shared recovery/lifecycle heading, description and useful action.
  Root error uses Next 16.3's retry when supplied, with reset fallback; existing
  logging remains. Not-found and unavailable states use the same language.
- Overlays: 20px task surfaces, consistent close targets, mobile action order,
  native focus traps/Escape, wrap-safe titles, bounded trade/search scrolling.
- Core corrections only: touch-capability hover gates, accessible badge tint,
  shared feedback geometry, human setup/loading/rule captions, keyboard menus and
  full trade identity. Scores, core compositions and selection/timer state stay.
- Left alone: useful position/status abbreviations, real scoring-version labels,
  Inspector missing/zero semantics, live freshness, existing route skeletons,
  retained/optimistic client state and the restrained hero atmosphere. These
  express actual football state or approved hierarchy, not design debt.

## 14–23. Quality decisions

Sans form/section headings replace terminal captions; mono stays on codes and
numbers. Entry layouts use bounded reading widths, 24/28/32px section rhythm and
20px module/10px control geometry from V2. Dense gameplay layout is unchanged.
Blue marks action/focus; green/red/amber are semantic. The existing premium
position hues remain GK gold, DEF blue, MID teal, FWD coral. V2 warning now shares
the readable amber already used by the core pages. Legal/policy prose is unchanged.

Mobile uses dynamic viewport bounds, contained overlay scrolling, safe-area
header insets, 16px inputs for coarse pointers, touch manipulation and immediate
press opacity. Document selection, pinch zoom and normal page scrolling remain.
Handwritten hover styles require hover/fine pointer; Tailwind4 already gates its
hover variant. Root viewport enables safe areas and keyboard content resizing;
theme color follows the actual default dark canvas. There is no existing theme
switcher to synchronize. Light rendering is tested through the fixture theme.

Actual fixes were verified with local Chromium fixtures. Physical iOS/Android
keyboard, safe area, sticky hover and installed-PWA feel still require a phone;
emulation is not a hardware claim. Enlarged-text checks exercise long-data Account,
Landing and email-confirmation states; this is not a complete 200% text audit.

Motion changes: search opens/closes without animation, sheets transition only
transform/opacity at 200ms ease-out, and button transitions name their properties.
Existing global reduced-motion behavior remains. No new animation library or
animated page entrance was introduced.

| Deferred opportunity | Purpose / frequency | Possible later recipe |
| --- | --- | --- |
| Confirmation replaces auth form (`auth-form.tsx`) | State indication; rare signup/recovery | 120ms opacity cross-fade, cubic-bezier(0.23,1,0.32,1); 80ms opacity for reduced motion. Keep actions immediately available. |
| New draft turn (`draft-workspace.tsx`) | State indication; occasional during a draft | 160ms background-color transition on the existing turn surface, same ease-out; reduced motion keeps a static state. No number ticker or delayed controls. |

Rejected: core navigation and command keyboard opening (too frequent); score
number tickers/sparkline reveals (move data being read); lineup shuffle animation
(could undermine instant optimistic confirmation); decorative landing loops
(no comprehension benefit). The product needs little additional motion.

## 24–30. Architecture and validation

Shared additions: data-free PublicShell/LandingView, AuthPanel/ExpiredRecovery,
AccountView, SystemState, the two-menu focus hook and scoped product CSS.
Canonical palette mapping is extended rather than duplicated. Global canvas and
viewport metadata align with V2. No dependencies added or removed; package and
lockfile unchanged. No server action, data-access, schema, domain or engine change.
No added reads, refreshes, polling, prefetch loops or client page wrapper.
Archive uses the same input scores/order; auth root redirect and all lifecycle,
permission, ownership and destruction guards remain unchanged.

Validation sources:

- `product-ui.test.ts`: auth field/autofill contracts, pending/errors, confirmation,
  reset privacy, direct onboarding, account deletion/identity and demo proof.
- Existing core/Home/spectator/performance/scoring UI, auth redirect/error,
  optimistic lineup and deletion tests; position contrast now covers V2.
- `product-v2-browser.mjs`: 36 states × dark/light × 1440/375/320 = 216 cases.
  All eight public information pages, auth form/error/pending/sent/unconfirmed/
  confirmation/expired/reset-success, onboarding Create/Join/error/focus return,
  Account long/empty/blocked/feedback, waiting/ready/setup/completed season,
  error retry/404/shared loading, delete gate, full trade selection/review and archive.
- Existing core browser matrix: 21 states × six combinations = 126 cases,
  including spectator/history, live/pending/final/upcoming, catalog empty/long,
  Team long/read-only and Draft completed/other-turn/long/waiting.
- Home: 11 states × six = 66 cases. League: both themes/all widths, normal and
  previous/member/empty/wide/trade; controls and dialogs. Shell: six routes,
  loading/no-league, menus/keyboard/focus/search/rules and Inspector.
- Existing performance browser fixture: instant optimistic paint, exact rejected/
  network rollback, pending conflicts, stable canonical placement, queued empty
  fill, Inspector retention/detail reads and native navigation at all three widths.
- Automated geometry/runtime checks plus representative manual screenshot review;
  not a claim of manually inspecting every screenshot or signed-in production.

Final test counts, build, deployment and smoke outcomes are recorded in the release
report. Browser harnesses block outbound requests and use isolated fake actions;
production integration guards are never bypassed. Build credentials are overridden
with an unreachable localhost Supabase and empty privileged/provider secrets.

## 31–37. Release safety

Expected and enforced: migrations **0**, provider requests **0**, production DB
mutations **0**. Production smoke uses public pages/authenticated boundaries only;
no real sign-in, signup, email, lineup, trade, deletion or draft action. A native
authenticated browser was unavailable. Release is a normal commit/push on `main`,
followed by commit-specific Vercel status verification and read-only smoke. Final
SHA, deployment URL and working-tree state are reported after those operations.
