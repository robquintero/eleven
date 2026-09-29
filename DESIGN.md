# DESIGN.md — Eleven Visual Language (v2)

This is the source of truth for UI work on Eleven. It documents the design
system established by the dashboard and Team screen, plus the principles
that keep every future screen consistent with it.

When in doubt, match what already exists rather than inventing a new
pattern. This file is updated in place as the system evolves — see the
version history implied by section content, not a changelog.

---

## 1. Design Philosophy

**"Football Command System."**

Eleven is not a fantasy sports website with football words pasted onto a
generic dashboard. It's the operating system a manager uses to run a
football squad — professional enough to feel like real football-operations
software, polished enough that a consumer genuinely enjoys using it.

Three reference points, combined, none copied outright:

- **Professional football operations terminal** — the information
  discipline: precise alignment, operational vocabulary, status codes,
  keyboard-first interaction.
- **Premium sports/fantasy interface** — the emotional core: player
  identity, club color, scores, matchday drama.
- **Consumer-grade product design** — the finish: restraint, whitespace,
  calm motion, nothing that needs a manual to read.

This is explicitly **not**: retro terminal cosplay, cyberpunk, hacker UI,
a Football Manager clone, a betting-slip interface, a Bloomberg terminal
imitation, a generic Linear clone, EA FC/FIFA menus, or neon gamer UI. We
borrow interaction philosophy and information architecture from
"operations software," not the visual skin of any one product.

**The core tension — and Eleven's actual identity — is the contrast
between two registers used side by side:**

1. **Human / football** — player names, team names, major scores, club
   and league identity, headings, imagery. Set in the primary typeface.
   Beautiful, emotional, editorial.
2. **System / operational** — statuses, timestamps, positions, fixture
   codes, fantasy points inside tables, draft/transaction information,
   keyboard shortcuts, metadata. Set in the data typeface. Precise,
   compact, quietly technical.

Every screen should let a reader feel both registers without confusing
them — see §2 for exactly which typeface each side uses, and the
**Quality Check** at the end of this document for how to self-test any new
screen against this principle.

Football itself — positions, clubs, crests, fixtures, live states, pitch
geometry — should increasingly carry the visual identity as the product
grows. It should never need a purple gradient or a trophy emoji to feel
like a sports product.

---

## 2. Typography — the dual system

Eleven deliberately uses **two typefaces with two jobs.** Never make the
whole application monospace, and never use the data typeface for prose,
player names, or headings.

```css
/* Human / football — names, scores, headings, readable prose */
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display",
  "SF Pro Text", "Inter", "Helvetica Neue", Arial, sans-serif;

/* System / operational — statuses, codes, timestamps, positions,
   fixtures, fantasy points inside tables, shortcuts, metadata */
--font-mono: var(--font-jetbrains-mono), "SF Mono", ui-monospace, "Menlo",
  "Consolas", monospace;
```

**Why JetBrains Mono, self-hosted via `next/font/google`:** the primary
typeface stays a system-font stack by design (see the v1 reasoning below —
it still holds), but a system-only mono stack (`SF Mono` first) only
renders as a real, distinctive monospace on Apple devices; everywhere else
it silently falls back to whatever generic monospace the OS ships. That's
invisible, which defeats the point of this pass: the "system" register is
supposed to be part of Eleven's *recognizable* identity, not an
accident of platform. JetBrains Mono is self-hosted (`app/layout.tsx`,
`--font-jetbrains-mono`), has excellent numeral clarity and true tabular
figures, and doesn't read as "retro terminal" the way e.g. a classic VT323
or IBM Plex Mono would. `--font-mono` keeps the system stack as a fallback
chain after it.

The primary typeface itself is unchanged from v1: it renders as real SF
Pro on Apple devices and a close, restrained grotesque elsewhere. There's
still no material upside to replacing it — the identity work this pass
does is on the *data* side, not the *human* side.

`font-feature-settings: "cv11", "ss01"` stays set globally on `html` for
SF/Inter's sharper alternate figures.

**The `.label-system` utility** (`globals.css`) is the shorthand for the
operational register: `font-family: var(--font-mono)`, tabular numerals,
`letter-spacing: 0.04em`, uppercase. Reach for it any time you're styling
a status, code, timestamp, position, or count — never for a name or
sentence.

**Established scale:**

| Role | Register | Class | Used for |
|---|---|---|---|
| Hero / page title | Human | `text-3xl sm:text-4xl font-semibold tracking-tight` | Team name, page H1 |
| Score display (hero) | Human | `text-5xl sm:text-6xl font-semibold tracking-tight tabular-nums` | Matchup score — emotional, not tabular data |
| Section title | Human | `text-lg font-semibold tracking-tight` | "Starting XI", "Standings" |
| Sheet/panel title | Human | `text-xl font-semibold tracking-tight` | Empty-state titles, sheet headers |
| Body / row primary | Human | `text-sm font-medium` | Player names, team names |
| Operational label | System | `.label-system text-[10px]`–`text-xs` | Positions, statuses, codes, timestamps, matchday |
| Stat value (in-row) | System | `.label-system` or `font-mono tabular-nums` | Fantasy points in a table, squad numbers, counts |
| Secondary metadata | System (usually) | `text-foreground-tertiary` + mono when it's a code/number | Club · league, kickoff times |

**Rules:**

- **Tabular numerals** everywhere a number changes or needs to align —
  `.label-system` includes this; use the bare `.tabular-nums` utility when
  a number stays in the human register (e.g. the hero score).
- **Which register for which number?** A number that's part of the
  emotional moment (the live matchup score) stays human/sans. A number
  that's a *stat* — fantasy points in a row, a squad number, a count, a
  projection — is system/mono. When genuinely unsure, prefer mono; it's
  the more distinctive, more "Eleven" choice.
- **Weight, not size, carries most human-register hierarchy.**
  `font-semibold` / `font-medium` / default do most of the work.
- Never uppercase normal prose, sentences, or player names. Uppercase is
  reserved for `.label-system` operational text.
- No arbitrary one-off font sizes outside the table above.

---

## 3. Color

Near-black neutral interface. Color is not decoration — it's status.

```css
/* dark (default) */
--background: #000000;        /* page canvas */
--surface: #131316;            /* first elevation — cards, bars */
--surface-elevated: #1c1c1f;   /* second elevation — popovers, active nav */

--foreground: #f5f5f7;            /* primary text */
--foreground-secondary: #98989d;  /* secondary text */
--foreground-tertiary: #6e6e73;   /* metadata, timestamps */

--border: rgb(255 255 255 / 9%);  /* hairline separators only */
--accent: #2997ff;                 /* the one system accent */
--live: #32d74b;                   /* LIVE / positive / success */
--warning: #ff9f0a;                 /* doubtful / caution */
--destructive: #ff453a;            /* injured / suspended / error */
```

**Semantic status colors — use consistently, never decoratively:**

| Color | Token | Means | Example |
|---|---|---|---|
| Green | `--live` | Live / success / positive | Live match dot, confirmed swap |
| Amber | `--warning` | Caution / doubtful | Doubtful player status, warning banner |
| Red | `--destructive` | Error / injured / suspended | INJ/SUSP status, destructive actions |
| Blue | `--accent` | The one system accent | Primary actions, active nav, selection |

**Rules:**

- The app runs dark by default (`<html class="dark">`); treat dark as the
  primary identity, light as a supported fallback.
- `--live` green is never decorative — no green buttons, no green icons
  "for flavor," only live/positive state.
- `--warning` amber is new in this pass: it's specifically for *doubtful*
  player status and any future soft-caution state. Don't reach for it as
  a generic highlight color.
- `--accent` blue is the **one** system accent. Resist adding a second.
- Club/team identity color (`crestColor`) is the only place arbitrary hue
  is allowed — always low-opacity background with full color reserved for
  text/border (`team-crest.tsx`, `player-node.tsx`). This is the seed of
  "football provides the color," and will expand as crests/photography
  land.
- Never purple/indigo. Never rainbow-coded UI. Color stays semantic.

---

## 4. Spacing

Base unit 4px. Tailwind spacing utilities used directly and consistently:

- **Section rhythm**: `space-y-10` / `space-y-12` between major page
  sections.
- **List row padding**: `py-3` (dashboard rows), `py-2.5` (denser roster
  tables like the bench).
- **Card/surface padding**: `p-6 sm:p-8` for hero surfaces; `px-4 py-2.5`
  for compact strip headers (e.g. the pitch's formation/legend bar).
- **Row/item gaps**: `gap-3` between an icon/crest/marker and its text
  block.

Don't invent a parallel spacing variable system — raw Tailwind utilities,
applied consistently, are the system.

---

## 5. Surfaces

Hierarchy comes from, in this order:

1. **Typography** (register + weight/size — see §2)
2. **Whitespace**
3. **Alignment** (increasingly literal — see §7, Grid + Alignment)
4. **Background hierarchy** (`background` → `surface` → `surface-elevated`)
5. **Borders**, only for genuine separation (sticky header, a sheet edge,
   a strip header inside a card)

**Do not wrap every section in a card.** Information can live directly on
the workspace background — think information surfaces, not dashboard
cards. The dashboard's bare sections (`Greeting`, `StandingsPreview`,
`ActivityFeed`) plus one deliberate hero (`MatchupHero`) is still the
model. The Team screen's pitch card is the other legitimate hero surface
per screen — reserve `bg-surface-elevated` + `border` + `rounded-2xl` for
one or two such moments, not a default container.

---

## 6. Radii

Superseded by the terminal-first scale in §20 — this section now just
states the current numbers. See §20 for the *why* and the exception list.

```css
--radius-terminal: 0px;    /* panels, tables, database regions, section containers */
--radius-control: 0.125rem; /* 2px — chips, inputs, small controls (= --radius-sm) */
--radius-soft: 0.25rem;     /* 4px — buttons, dropdown triggers, rare softened surfaces (= --radius-lg) */

--radius-sm: 0.125rem;  /* 2px */
--radius-md: 0.1875rem; /* 3px */
--radius-lg: 0.25rem;   /* 4px */
--radius-xl: 0.375rem;  /* 6px — menus, dropdown panels */
--radius-2xl: 0.5rem;   /* 8px — the few remaining hero surfaces */
```

Fully-round (`rounded-full`) is a *separate* value from this scale,
reserved exclusively for human/football identity: avatars, crests,
tactical player markers, and live-indicator/status dots. It is never used
for a control, button, or navigation element — see §20.

---

## 7. Grid + Alignment

The interface should feel *engineered*, without turning into a spreadsheet.

- **Tabular alignment**: any list of comparable numeric/status values
  (the bench roster, standings, the player database) aligns on a real CSS
  grid (`grid-cols-[...]`) with fixed-width columns for index/position/
  status, not ad-hoc flex gaps. See `bench-row.tsx`, `player-table.tsx`.
- **Column headers**: a dense roster table gets a quiet mono column-header
  row above it (`POS · PLAYER · CLUB · FIXTURE · STATUS`) on `sm+` only —
  mobile collapses to fewer, self-labeling columns. See the Team page's
  bench section.
- **Hairline structure**: a single `border-t` under the wordmark, a strip
  header inside the pitch card, a column-header row, a bordered control
  strip — small, precise dividers that signal "this is a system," used
  deliberately rather than sparingly (§20 goes further on this).
- **Precise baselines**: index numbers, position chips, and status text
  in a row should sit on the same baseline as the row's primary text, not
  float independently.

This is not a literal HTML-table-from-2005 aesthetic — generous spacing,
tabular numerals, and restrained accent color keep it premium even
though row selection is now a square left-edge indicator with hard cell
borders rather than a rounded highlight (§20).

---

## 8. Motion

Fast, subtle, purposeful. Premium software doesn't bounce.

- **Hover**: ~150ms.
- **Panels / sheets**: ~180–220ms slide + fade (see `sheet.tsx`'s
  `data-starting-style`/`data-ending-style` pattern) — reuse for any new
  overlay.
- **Command palette**: fast entrance, slightly faster exit — both still
  within the 150ms band; scale from 0.98→1 + fade, never a slide or
  bounce (see `command-palette.tsx`).
- **Properties**: opacity, transform (translate/scale) only. Avoid
  animating layout-affecting properties.
- **Easing**: default ease-out. No spring/bounce easings anywhere.
- **Live-only pulse**: the `animate-ping` dot is reserved for genuinely
  live state (matchup hero, live player/bench status) — never used as a
  generic "new" or "active" indicator.
- **Selection movement** (command palette, keyboard-navigated lists):
  instant background-color change on the selected row, no animated
  slide-between-rows.

---

## 9. Iconography

[Lucide](https://lucide.dev) exclusively, via `lucide-react`. No emoji as
interface icons, ever.

- Nav icons: `size-[18px]` desktop, `size-[22px]` mobile, `strokeWidth`
  toggles between `1.75` (inactive) and `2.25` (active).
- Inline/metadata icons: `size-3.5` to `size-4`.
- Empty-state icons: `size-5` inside a `size-12` muted circle.
- Command palette / search affordances: `size-3.5`–`size-4`, always
  paired with a `.label-system` shortcut hint, never floating alone.

---

## 10. Status Vocabulary & Football Abbreviations

Eleven has a consistent operational vocabulary. Use these exact tokens —
don't invent synonyms.

**Player availability** (`availabilityLabel`, `team-fixture.ts`):

| State | Label | Color |
|---|---|---|
| `available` | `READY` | neutral |
| `doubtful` | `DOUBTFUL` | `--warning` |
| `injured` | `INJ` | `--destructive` |
| `suspended` | `SUSP` | `--destructive` |

**Match/fixture state** (`matchStateLabel`, `team-fixture.ts`) — a
player's own fixture, relevant to lineup locking:

`UPCOMING` · `LIVE` · `LOCKED` · `FT` (full time)

**Round fixture state** (`RoundFixture["state"]`, `mock/fixtures.ts`) — a
real match's own clock, independent of any one roster. Rendered via
`fixtureStateBadge()` as a minute (`63'`), `HT`, `FT`, or a kickoff time:

`scheduled` · `live` · `ht` · `final`

**Operational labels seen across the app:** `MATCHDAY 05` (always
zero-padded via `pad2()`), `STARTING XI`, `BENCH / 05` (heading + padded
count), column headers (`POS` / `PLAYER` / `CLUB` / `FIXTURE` / `STATUS`).

**Football abbreviations:**

- **Position labels** (`GK`/`DEF`/`MID`/`FWD`): uppercase mono chip
  (`.label-system`, `rounded-md bg-muted`). Never color-coded by hue —
  position is typographic, not chromatic.
- **Club · position**, compact: `"ARS · MID"` — used in command palette
  results and tactical markers. **Club · league**, descriptive:
  `"ARS · Premier League"` — used in list rows and detail sheets. Pick
  based on which pairing the context needs; never show a club code with
  no second field.
- **Fixture, contextual (single-player perspective)**: `vs CHE` (home) /
  `@ CHE` (away) — used on the pitch marker and in the detail sheet.
- **Fixture, tabular (roster row)**: `CHE (H)` / `CHE (A)` — used in the
  bench table where a dedicated column exists.
- **Squad numbers**: mono, tabular, zero-padded only when compared as an
  index (`01`–`05` for bench order); shown bare (`9`, `22`) when it's a
  real shirt number on a tactical marker.

**Ownership** (`ownershipLabel`, `players/ownership-status.tsx`) — a real
player's roster status league-wide, distinct from availability:

| State | Label | Color |
|---|---|---|
| `free` | `FREE` | neutral |
| `mine` | `MINE` | `--accent` |
| `owned` | `OWNED / <TEAM>` (first word of the owning team's name) | neutral |
| `waivers` | `WAIVERS` | `--warning` |

`FA` is reserved shorthand for `free` in dense future contexts; not
currently rendered anywhere (`FREE` is used in full since there's room).

---

## 11. Tactical Visualization (Team screen / pitch)

- **The pitch** is a `surface-elevated` card with a hairline strip header
  (formation code + status legend, both `.label-system`) above a portrait
  `aspect-[4/4.6]` canvas. Field markings are `border-foreground/6` —
  present enough to read as a pitch, never literal grass/texture.
- **Player markers** are the tactical identity unit, replacing generic
  avatar-with-initials:

  ```
       09          ← squad number, mono, club-color
     HAALAND        ← surname, human/sans, bold
    MCI · FWD        ← club · position, mono, tertiary
     vs BHA          ← contextual status line (fixture / LIVE n / LOCKED / INJ)
  ```

  This is the clearest expression of the dual-typography principle at the
  smallest unit of the interface: number (system) / name (human) / code
  (system) / status (system), stacked.
- **Graceful fallback**: no player photography or club crests yet.
  Squad number in a club-color ring *is* the fallback identity — not a
  placeholder to be replaced later, but the intended look until
  photography exists. When photos/crests do arrive, they slot into the
  same marker shape; the number moves to a small corner badge rather than
  disappearing (shirt numbers stay useful even with a photo).
- **Roster tables** (bench) use the grid/alignment system from §7 — see
  `bench-row.tsx` for the canonical column set and status-tone mapping.

---

## 12. Workspace Philosophy & Density Levels

**"Every region should earn its space."**

Eleven should feel like a workspace, not a web page — a football
manager's operational monitor, where glancing anywhere on the screen
surfaces useful context. Large empty regions are acceptable **only** when
they improve comprehension (breathing room around the matchup hero,
margin around the pitch's tactical geometry); they are never acceptable
as leftover space nobody bothered to use. Empty space must be
intentional, not incidental.

- **Desktop is a professional command center.** It may expose
  meaningfully more at once: extra table columns, the sidebar nav's index
  numbers, a full round fixtures list, a system status strip. Prefer
  asymmetric columns and structured information rails over simply making
  existing surfaces bigger — see the Team page's `[1.15fr_0.85fr]` pitch/
  rail split and the Dashboard's full-width Round Status + Live Fixtures
  strip (`page.tsx`).
- **Mobile is a focused handheld console.** Fewer columns, decisions over
  data, and — critically — **different priority order, not just a
  narrower version of the desktop layout.** The dashboard's Round Status
  strip is `order-3 lg:order-2` against a `flex flex-col` root
  specifically so it appears *after* Starting XI/Standings/Activity on
  mobile but *before* them on desktop — the same content, reordered by
  priority per breakpoint, not hidden or shrunk. Never attempt a
  "terminal" mobile view.
- **Natural scrolling is acceptable and expected.** Don't force content
  to fill `100vh` for its own sake — a tall right-hand rail (Bench →
  Squad Availability → Round Intelligence → Next Lock → full Round
  Fixtures on the Team screen) is the correct outcome of "more useful
  information," not a bug to fix by shrinking things.
- **Every new module must correspond to a plausible real Eleven system**
  (fixtures, lineup locks, live scores, standings, waivers, transactions).
  Never invent decorative charts, fake "analytics," or system-monitor
  flavor (CPU/logs/uptime) that doesn't map to an actual football-ops
  concept.

**Three density levels — use them deliberately, not interchangeably:**

| Level | Purpose | Typical size/class | Examples |
|---|---|---|---|
| **Primary** | Large, highly readable, human register | `text-3xl`–`text-6xl` | Hero score, team name, player name on the pitch, matchup |
| **Secondary** | Compact managerial information | `text-sm`, `text-xs` | Fixtures rows, bench rows, standings rows, squad availability |
| **System** | Smallest information — still legible | `text-[10px]`–`text-[11px]`, `.label-system` | Timestamps, status codes, shortcut hints, lock countdowns |

System-level text has a floor: `text-[10px]`/`text-[9px]` is as small as
Eleven goes (see the pitch legend, fixture-row minute badges). Never go
smaller in pursuit of density — that's clutter, not information
architecture.

**The two-second test:** at desktop width, the most important
information on screen (score, next decision, live state) must be
identifiable within two seconds despite the added density. If a new panel
makes that harder, it's competing for attention rather than supporting
it — cut it or move it further down the rail.

**"Alive" data, used sparingly:** a ticking `Countdown` component
(`components/football/countdown.tsx`) and the Round Fixtures list's live
minute/HT badges are the *only* places Eleven animates in response to
real-feeling time — never add a second, competing "live" treatment.
`animate-ping` stays reserved for genuinely live state (§8).

---

## 13. Keyboard Interaction

Keyboard shortcuts are part of Eleven's identity, introduced without ever
overriding a real browser shortcut.

- **⌘K / Ctrl+K** — opens the command palette from anywhere (global
  listener in `command-palette.tsx`). The only shortcut that calls
  `preventDefault()` unconditionally.
- **`G` then a letter** — sequential navigation shortcut (`G H` → Home,
  `G M` → Matchup, `G T` → Team, `G P` → Players, `G L` → League). Only
  armed when: the command palette is closed, the previous keydown was a
  bare `g` within 600ms, and focus isn't inside an input/textarea/
  contenteditable element. Never fires while the user is typing anywhere.
- **Escape** — closes the command palette (native to the underlying
  `Dialog` primitive; no custom handling needed).
- **Arrow keys / Enter** inside the command palette — native `cmdk`
  roving selection; don't hand-roll this.
- Shortcuts are discoverable, not hidden: the desktop nav shows a mono
  index (`01`–`05`) per item and a `title` tooltip with the full
  shortcut; the command palette lists `G <letter>` next to each nav
  result.

---

## 14. Command Palette Behavior

`src/components/command/command-palette.tsx` is Eleven's first signature
interaction — it must never read as a generic component dropped in.

- **Structure**: `ELEVEN COMMAND` label + search input + `ESC` hint in the
  header row; sections below are `Navigation`, `Actions`, and (only once
  the user has typed something) `Players`, each with a `.label-system`
  group heading.
- **Actions that don't exist yet** (`Draft Room`, `Waivers`, `Propose
  Trade`, `Transactions`) are rendered `disabled` with a trailing `SOON`
  label — never fake-functional.
- **Player search** is manual (`shouldFilter={false}` on the `Command`
  root), matched against `allPlayers` from `@/lib/mock/team`, capped at 6
  results, rendered as name (human) + `CLUB · POS · LEAGUE` (system) —
  exactly the club·position compact format from §10.
- **Visuals**: centered high (`top-[16vh]`), `max-w-xl`, `surface-elevated`
  with a `border` and `shadow-2xl` — not vertically centered like a
  standard dialog, not full-width, not glassy. Selection state is
  `bg-accent/10`, never the generic gray `bg-muted` a default shadcn
  command dialog would use.
- Reuses `cmdk` primitives directly (not the generic `ui/command.tsx`
  wrapper shadcn generated) so every visual detail is bespoke to Eleven.

---

## 15. Responsiveness

Every primary screen supports three explicit targets:

- **Mobile ≈ 390px** — single column, current task only. Bottom tab bar
  owns the bottom `env(safe-area-inset-bottom)` region; page content gets
  `pb-28` to clear it.
- **Tablet** — transitional, via the same `sm:` breakpoint lever used
  everywhere else.
- **Desktop ≈ 1440px** — sidebar nav with index numbers, content
  constrained to `max-w-[1440px]`, multi-column layouts that expose more
  simultaneously.

Long names (`Alexander-Arnold`) must never break layout: `truncate` +
`min-w-0` on every name container.

---

## 16. Mobile Philosophy

Mobile inherits Eleven's identity but never role-plays as a terminal.

- Keep: bottom navigation, touch-friendly targets, strong/large scores,
  simplified operational metadata (fewer table columns, not smaller
  text).
- The bench roster table collapses its `CLUB`/`FIXTURE` columns into one
  subtext line under the player name on mobile — the data doesn't
  disappear, it consolidates.
- The command palette's `ELEVEN COMMAND` label and shortcut hints hide on
  the smallest screens where they'd crowd the search input; the palette
  itself remains fully available via the header search button (no ⌘K
  keyboard dependency required to reach it on mobile).

---

## 17. Component Reuse

Inventory — check here before writing a new component:

**Shell** (`@/components/shell`)
- `AppShell` — page chrome, do not reimplement
- `DesktopNav` (now with mono index numbers `01`–`05`), `MobileNav`
- `LeagueSwitcher`, `ProfileControl`, `Wordmark`
- `StatusBar` — desktop-only (`hidden lg:flex`) operational strip stacked
  inside the sticky header, below the logo/search/profile row; matchday,
  fixtures-complete count, live count, next-lock countdown
- `ComingSoon` — placeholder pattern for unbuilt screens

**Command** (`@/components/command`)
- `CommandPalette` — mounts its own trigger button *and* the dialog;
  drop `<CommandPalette />` once in the shell header, nowhere else

**Football** (`@/components/football`) — shared across Dashboard and Team,
check here first for any new round/fixture/status surface
- `OperationalRow` — label/value row for terminal-style readouts (Round
  Status, Round Intelligence); handles the optional trailing secondary
  value (e.g. `Proj 84`)
- `FixturesList` — renders a `RoundFixture[]` as aligned rows (state
  badge, `fixtureCode()`, optional featured-player subtext); pass the
  full round for Team's rail, a `live`/`ht` filter for Dashboard's ticker
- `Countdown` — ticking `T−HH:MM:SS` (or `T−ND HH H` beyond a day) to an
  ISO target; renders a placeholder until mounted to avoid a hydration
  mismatch — the only clock-driven component in the app
- `FormSparkline` — the one recent-form bar visualization, shared by the
  Team screen's player detail sheet and the Players inspector; don't
  reimplement a second bar chart

**Dashboard** (`@/components/dashboard`)
- `Greeting`, `ActivityFeed`, `StartingXI`, `TeamCrest` — `.label-system`
  applied to their operational metadata
- `MatchupCommand` — the primary work surface (§22); replaced `MatchupHero`.
  Bordered module, not a floating gradient card: score + crests up top,
  then a `PROJECTED`/`ACTIVE`/`REMAINING` aligned readout per team, then a
  shared `DELTA` row. Takes `starters` (for the user's own buckets) and a
  small hand-authored `opponentBuckets` mock (`opponentLineupBuckets`,
  `mock/dashboard.ts`) since no full opposing roster is mocked.
- `OperationsRail` — the persistent secondary rail (§22); replaced the
  old `RoundStatus` + `StandingsPreview` main-content sections. One
  `divide-y divide-border border` column of `RailModule`s:
  `ROUND_INTELLIGENCE`, `LIVE_FIXTURES`, `NEXT_LOCK`, `LEAGUE_TABLE`.

**Players** (`@/components/players`)
- `PlayerRow` (dashboard Starting XI) — compact list-row pattern,
  position/club/points now mono, clickable (`onSelect`/`selected`) to open
  the shared inspector
- `PlayerDatabaseToolbar`, `PlayerTable`, `PlayerListMobile`,
  `PlayerInspector` + `PlayerInspectorContent`, `OwnershipStatus`,
  `AvailabilityStatus` — the `/players` scouting terminal (§19); also the
  cross-screen shared inspector (§21) — check here before building any new
  player-browsing or player-detail surface anywhere in the app

**Team** (`@/components/team`)
- `Pitch`, `PlayerNode` (tactical marker, §11), `BenchRow` (roster table,
  §7 — now a 5-column `POS/PLAYER/CLUB/STATUS` grid, `FIXTURE` dropped to
  fit the narrower operations-rail column, §22), `SquadAvailability` —
  reuse before building any new squad-management UI. Selecting a pitch or
  bench player opens the shared `PlayerInspector` (`@/components/players`,
  §21) with a `lineupContext` rather than a Team-specific detail sheet.
  `SquadAvailability`/`RoundIntelligence`/`NextLock` are now bare content
  (no own `<h2>`) — the page wraps each in a `RailModule` for its header.
- `RoundIntelligence` — PTS/PROJECTED/ACTIVE/REMAINING/LOCKED readout for
  the operations rail, derived from `starterBuckets()`
- `NextLock` — soonest still-upcoming starter + live `Countdown` to their
  kickoff

**UI primitives** (`@/components/ui`, base-ui/react + shadcn `base-nova`
style)
- `Avatar`/`AvatarFallback`, `Badge`, `Button`, `ScrollArea`, `Separator`,
  `Tabs`, `Sheet`, `Dialog`, `Input`, `InputGroup`, `Textarea`
- `TerminalPanel` / `TerminalPanelSection` — the bordered-pane primitive
  (§20); check here before building a new rounded-card container anywhere
- `ModuleHeader` — standalone section header (§22): mono uppercase title +
  right-aligned meta + its own `border-b`. Use for a section that isn't
  nested inside a rail (`STARTING_XI`, `OPERATIONS_FEED`, `PLAYER_DATABASE`).
- `RailModule` — one module inside a persistent operations rail (§22): same
  header language as `ModuleHeader` but no border of its own — meant to be
  stacked with siblings inside one `divide-y divide-border border` column
  so the rail reads as one instrument. Used on both Dashboard
  (`OperationsRail`) and Team (bench/squad-status/round-intelligence/
  next-lock/fixture-feed rail).
- `Command` (generic `cmdk` wrapper, shadcn-styled) — available but *not*
  what the command palette uses; kept for any future simple
  command-style picker that doesn't need Eleven-specific chrome

**Lib**
- `@/lib/types/fantasy` — extend, don't duplicate; includes `RoundFixture`/
  `FixtureMatchState` for round-wide (not per-player) match data, and
  `PlayerOwnership`/`SeasonStats`/`totalPoints`/`averagePoints` on
  `Player` for the scouting database
- `@/lib/mock/*` — typed mock data, always separate from presentation.
  `team.ts` exports `allPlayers` and `clubs`; `fixtures.ts` exports
  `roundFixtures` (kept consistent with the `live`/`locked` states
  already on rostered players' own `fixture` field); `players-database.ts`
  exports `playerDatabase` — built from a `Seed[]` + `buildPlayer()`
  pair, not hand-written `Player` literals, and folds in `team.ts`'s
  roster rather than duplicating it (§19)
- `@/lib/players-filters` — `PlayerFilters` type, option lists
  (`positionOptions`/`leagueOptions`/`clubOptions`/…), and the pure
  `filterAndSortPlayers()` used by `/players`; extend this rather than
  writing filter logic inline in a component
- `@/lib/leagues` (`leagueLabels` + `leagueCode` for `ENG`/`ESP`/`GER`/
  `ITA`/`FRA`), `@/lib/time`, `@/lib/team-fixture` (fixture formatting,
  the status vocabulary — `availabilityLabel`, `matchStateLabel`, `pad2`,
  `playerFixtureCode` — **and** round-fixture helpers — `fixtureCode`,
  `fixtureStateBadge`, `nextLock`, `starterBuckets`), `@/lib/utils` (`cn`)
- `@/lib/navigation` — `primaryNav` now carries `shortcutKey` for both
  the sidebar tooltip and the command palette

---

## 18. Forbidden Patterns

- Generic three/four-card stat-row dashboards
- Wrapping a section in a card just because it's a section
- Purple/indigo gradients or any decorative gradient beyond the single
  restrained radial blur used once in `MatchupHero`
- Neon gaming aesthetics, glow effects, esports-style accent colors,
  cyberpunk/hacker styling
- Retro terminal cosplay — scanlines, CRT glow, `>` prompts, ASCII borders
- A Bloomberg-terminal imitation, or a Football Manager UI clone
- A generic shadcn command dialog dropped in unstyled — the command
  palette must always look native to Eleven (§14)
- Making the *entire* application monospace — mono is for the system
  register only (§2)
- Glassmorphism as a default surface treatment (backdrop-blur is reserved
  for functional sticky bars, not decoration)
- Heavy or stacked shadows (`shadow-2xl` is the ceiling, used for hero
  surfaces and the command palette only)
- Pills/badges for information that could just be inline text
- Borders around every box — borders are for genuine separation
- Random per-feature accent colors — one system accent, plus
  club/team `crestColor` at low opacity, full stop
- Using `--warning` amber as a generic highlight instead of doubtful/
  caution state specifically
- Emoji as UI icons
- Fake/decorative charts with no real data behind them
- Fake system-monitor flavor (CPU/memory readouts, decorative terminal
  logs, meaningless graphs) — every module must map to a real football-ops
  concept (§12)
- Lorem ipsum or generic placeholder copy
- Uppercasing prose, sentences, or player names (uppercase is
  `.label-system`-only)
- Inconsistent spacing — pull from the rhythm in §4
- Rebuilding a component that already exists in §17
- Default pill buttons, capsule navigation, or pill dropdowns — `rounded-
  full` is reserved for human/football identity, never a control (§20)
- Excessive rounded cards or floating SaaS-style panels — reach for
  `TerminalPanel` or a bare bordered region instead (§20)
- Rounded rectangles used without a semantic reason from the §6/§20 table
  — a radius now requires justification, not the other way around
- Rounded (ring-based) row/nav selection — selection is a square left
  edge indicator, not a highlight capsule (§20)

---

## 19. Player Database / Scouting Terminal

`/players` is the clearest single demonstration of the dual-register
principle (§1): the database itself is pure system register, and
selecting a player shifts into human register for the inspector — the
same contrast the pitch marker expresses at a smaller scale (§11), now
expressed at screen scale.

- **The database is a dense CSS grid, not an HTML table and not cards.**
  `PlayerTable` follows the exact `grid-cols-[...]` row pattern from
  `bench-row.tsx` (§7) — fixed-width system columns (`#`, `POS`, `LGE`,
  `NEXT`, `PTS`, `FORM`), one flexible human column (`PLAYER`), one
  right-aligned status column (`OWNERSHIP`). Column headers double as
  sort triggers where a sort makes sense (`PLAYER`/`PTS`/`FORM`/`NEXT`);
  static labels (`POS`/`CLUB`/`LGE`/`STATUS`) don't pretend to sort.
- **Row states are never color-only.** An unavailable player gets both a
  colored `.label-system` tag (`INJ`/`SUSP`/`DOUBTFUL`) next to their
  name *and* the semantic color — never a bare colored dot standing in
  for text.
- **The inspector is a `TerminalPanel`, not a floating card** (§20):
  square border, a `PLAYER_RECORD` header strip with the record's padded
  index on the right, hard `border-b` separators between Identity/Next/
  Fantasy/Recent_form/Season/Action sections. At `xl` (1280px)+ it sits
  inline as a grid sibling of the table, `divide-x` between them so it
  reads as one attached split-pane rather than a card with a gap next to
  it (database stays visible — you're inspecting a record from a larger
  system, not leaving it); below that it's the same `Sheet` pattern as
  the Team screen's player detail panel (side on tablet/small desktop,
  bottom on mobile), with the `TerminalPanel` sitting inside the sheet's
  padding rather than the sheet itself carrying the border.
- **Ownership actions never fake a transaction.** `free`/`owned`/
  `waivers` all resolve to a real `Button` that, on click, reveals a
  quiet inline note ("Roster moves unlock once league drafting is
  live.") — never a browser `alert`, never an optimistic UI update that
  implies something happened. `mine` is the one real action: it
  navigates to `/team`, because that page actually exists.
- **Mobile gets its own list, not a squeezed table.** `PlayerListMobile`
  reuses the same row-content hierarchy (position chip → name +
  availability tag → club/league → points + ownership) but as a single
  flexible row, no grid columns to collapse. The filter control strip
  (§20) stays the same bordered instrument at every width — it scrolls
  horizontally rather than collapsing into pills, which is the mobile
  adaptation this pass replaced the old position-pill row with.
- **Keyboard model**: `/` focuses search (from anywhere, unless already
  typing); `↑`/`↓` move a highlight ring through the current filtered/
  sorted list without opening anything; `Enter` opens the inspector for
  the highlighted row; `Escape` closes the inspector, or clears the
  highlight if the inspector is already closed. `⌘K` still opens the
  global command palette on top of all of this — the two systems don't
  conflict because the database's own shortcuts always check
  `isEditableTarget()` first and the command palette's `G`-sequence
  shortcuts stay disabled while it's open.
- **Data stays a typed mock layer, never inline in JSX.**
  `mock/players-database.ts` builds its ~55 players from a compact
  `Seed[]` + `buildPlayer()`, and folds in the 16 players already on
  Robert FC's squad (via `mock/team.ts`'s `allPlayers`, enriched with
  season totals) rather than inventing a disconnected second roster —
  browsing the database and seeing `Erling Haaland · MINE` correctly
  reflects the Team screen's own state.

---

## 20. Terminal Geometry System

A recurring problem showed up once enough of Eleven existed to see it
clearly: the *information* architecture was already a football operations
terminal, but the *geometry* was still modern-SaaS/iOS — pills, capsules,
soft floating cards, rounded selectors. This section is the fix, and it's
now as load-bearing as §2 (Typography) and §10 (Vocabulary). Reference:
studied (not installed) [terminal.css](https://terminalcss.xyz)'s
Bulma-style component set — square controls, border-driven grouping, hard
separators, inverted/edge-indicated selection — and translated the parts
that fit Eleven's own tokens, not its ANSI palette or literal styling.

**The 80/20 rule.** Roughly 80% of functional UI geometry is square or
near-square. The remaining 20% — radius that still requires justification
— exists only where there's a specific product reason (§6 lists the exact
numbers):

| Radius | Value | Used for |
|---|---|---|
| `rounded-terminal` (0) | 0px | Panels, tables, database regions, section containers, the pitch's outer frame, control strips |
| `rounded-control` / `rounded-sm` | 2px | Inputs, chips, small compact controls |
| `rounded-md` | 3px | Button size-variant clamps |
| `rounded-soft` / `rounded-lg` | 4px | Buttons, dropdown triggers, the command palette popup |
| `rounded-xl` | 6px | Menus, dropdown panels (league switcher) |
| `rounded-2xl` | 8px | The few remaining hero surfaces (`MatchupHero`) |
| `rounded-full` | — | **Not part of this scale at all.** Human/football identity only: avatars, crests, tactical player markers (§11), live/status dots. Never a control. |

A radius now requires a reason. If you reach for `rounded-2xl` or
`rounded-full` on anything that isn't in the table above, that's the
signal to stop and use a bordered pane instead.

**Pane vs. card.** Before wrapping anything in a rounded bordered box, ask
"does this actually need to be a floating card?" Prefer, in order: a bare
page region (no border at all — most of the dashboard), a hairline
divider, a bordered *pane* (`TerminalPanel`, `ui/terminal-panel.tsx`) that
sits flush in the workspace, a control strip. A full `rounded-2xl` card is
now reserved for the two or three genuine hero surfaces per app
(`MatchupHero`, and arguably the pitch before this pass — the pitch's
outer frame is now `rounded-terminal` because its *content*, not its
container, is the football-specific exception).

**`TerminalPanel`** (`ui/terminal-panel.tsx`) is the reusable pane
primitive: square border, an optional header strip (`PLAYER_RECORD` +
right-aligned meta like a zero-padded index), and `TerminalPanelSection`
children separated by hard `border-b` rules instead of `space-y-*` gaps.
Reach for it instead of inventing a new bordered-box style per screen —
the Player Inspector (§19) is the canonical example.

**Control strip.** Where the old pattern was a row of independently
bordered, individually rounded selects (reading as unrelated floating
pills), the new pattern is one bordered instrument: a flex row with
`divide-x divide-border` between cells and a single `border` around the
whole group, each cell just padding + label + control, no per-cell
border or radius. See `player-database-toolbar.tsx`'s filter row. On
narrow viewports the strip scrolls horizontally rather than wrapping —
wrapping a divide-x row produces orphaned borders at the start of each
wrapped line, so horizontal scroll is the correct mobile adaptation here,
not a second layout.

**Buttons are now square controls, not capsules.** `buttonVariants`
(`ui/button.tsx`) carries `.label-system` in its base class — every
button label is mono, uppercase, tracked (`[ ADD PLAYER ]`, `[ VIEW IN
SQUAD ]`, `[ EDIT LINEUP ]` in spirit, without literal brackets) — because
a button is control chrome (system register), not prose, and this is the
one place §2's human/machine split explicitly puts short action verbs on
the machine side. Radius comes from the token scale (`rounded-lg` → 4px)
so no button-specific radius override should be needed.

**Selection state moves from rings to edges.** A selected/active row or
nav item is never a rounded highlight anymore. The pattern, used
identically in `desktop-nav.tsx`, `player-table.tsx`, and
`standings-preview.tsx`: a persistent `border-l-2 border-l-transparent`
on *every* row (so nothing shifts when selection changes) that becomes
`border-l-accent` plus a light `bg-accent/10` tint when active/selected.
Keyboard-highlighted-but-not-selected (the player database's arrow-key
roving cursor) instead uses `ring-1 ring-inset ring-accent/50` — inset so
it stays flush with the row's own square edges rather than floating
outside them. Hover stays a plain, quiet `bg-surface`.

**Top-bar controls are rectangular.** The league switcher and command
palette trigger both moved from `rounded-full` pills to `rounded-control`
rectangles with a `LEAGUE /` / mono `⌘K` structural label rather than
just looking like a generic search pill. `RQ`, the profile avatar, stays
circular — it represents a human, which is the one identity exception
that was never in question.

**Mobile exception.** Sheets (`ui/sheet.tsx`) are deliberately left at
their existing 0px radius rather than forced toward more softness — but
if a future mobile-only surface genuinely needs a touch-native rounded
corner, that's the one place on the 80/20 rule's "20%" side where it's
pre-approved without further justification. Don't extend that allowance
to anything else on mobile: the geometry language (fewer pills, hard
separators, terminal typography) carries through unchanged, only the
density relaxes.

---

## 21. Professional Workstation Principle

Eleven's desktop identity is not "terminal themed." It is a **professional
football operations workstation** — closer to a trading/analytics desk's
information architecture than to retro terminal cosplay. Studied (not
copied) from a professional trading-terminal reference: high information
density, strong alignment, specialized instrument-like controls, restrained
color, and data that stays visible without opening a separate page. None of
its crypto branding, candlestick charts, or buy/sell vocabulary belongs
here — only the seriousness and density discipline transfers.

Rough formula, useful as a gut check when a new module feels off: **50%
professional workstation information architecture, 30% premium sports
interface, 20% terminal/operator interaction language.** Not 80% literal
terminal — see §1's three reference points, which this refines rather than
replaces.

**Three surface levels** — use deliberately, not interchangeably:

| Level | Purpose | Example |
|---|---|---|
| **Workspace** | The default page canvas, usually open. Information grouped through alignment/spacing/rules, not containers. | Dashboard's bare sections, the Team page's right rail |
| **Module** | A defined functional region — thin border or `TerminalPanel`. | The pitch, the Player Inspector, the bench table |
| **Focus surface** | Rare; the current high-value action or headline information, may take slightly stronger contrast. | `MatchupCommand`'s score block |

Most of a screen is Workspace. Module is common. Focus surface is one
moment per screen, not a default — treating every section as a Focus
surface is the "dashboard tile overload" failure mode this principle
exists to prevent.

**Density philosophy**: every region earns its space (§12) — closes gaps
where a module *could* say more without becoming noise. §22 documents the
full desktop recomposition this principle drove.

**Shared player inspection**: a manager should learn one rule — *selecting
a footballer opens their dossier* — and have it hold everywhere. Dashboard's
Starting XI, the Team screen's pitch/bench, and the Players database all
open the same `PlayerInspector` / `PlayerInspectorContent` (`@/components/
players`). The one variation point is `lineupContext`: when present (Team
screen), the record's action slot shows "Move to bench"/"Move to starting
XI" instead of the ownership-based action (add/trade/claim/view-in-squad).
Never fork a second inspector body per screen — extend the shared one.
Squad players opened this way are enriched with the same `ownership`/
`seasonStats` the scouting database shows (`enrichMine()`,
`@/lib/mock/players-database`) so the dossier reads identically regardless
of where it was opened from.

**Keyboard interaction philosophy**: keyboard shortcuts exist to make
*focused* actions faster (⌘K anywhere, `/` to search, arrow-key roving
selection in the Players database, `Escape` to step back one level), never
to gate an action a mouse can't also complete. Team's edit mode follows the
same rule: `Escape` cancels a pending swap selection, or exits edit mode
entirely if nothing is pending — a small, local affordance, not a new
navigation engine.

**Semantic data color** stays exactly as defined in §3 — this pass adds no
new colors. `DELTA` and similar derived numbers reuse `--live`/
`--destructive` for positive/negative, never a new hue.

**Additional forbidden patterns**, on top of §18:

- Dashboard tile overload — three-plus Focus-surface treatments on one
  screen competing for attention
- Excessive empty space defended as "minimalism" when a real number could
  fill it usefully (see Density philosophy above)
- A second, independent player detail component instead of extending the
  shared `PlayerInspectorContent`

---

## 22. Desktop Recomposition

§21 stated the professional-workstation *principle*; this section documents
the concrete structural rebuild that made it visible. All three primary
screens were rebuilt around the same pattern: a **primary work surface**, a
**persistent operations rail** next to it, and — on Dashboard — a
**full-width lower workspace** below both. This is a structural change, not
a density/label pass — verify against a screenshot, not this text.

**Shell**: `AppShell`'s outer container grew from `max-w-[1440px]` to
`max-w-[1920px]` so real monitors wider than 1440px stop centering the app
in a narrow column with black bars either side. The sidebar/header/main
regions themselves are unchanged.

**Dashboard** (`src/app/page.tsx`) — previously: `Greeting` → `MatchupHero`
→ a `RoundStatus`/`FixturesList` 2-col row → a `StartingXI`/`Standings`+
`ActivityFeed` 2-col row. Now:

```
Greeting
┌─────────────────────────────────┬───────────────────┐
│ MatchupCommand (primary surface) │ OperationsRail     │
│ StartingXI                       │  ROUND_INTELLIGENCE│
│                                   │  LIVE_FIXTURES     │
│                                   │  NEXT_LOCK         │
│                                   │  LEAGUE_TABLE      │
├─────────────────────────────────┴───────────────────┤
│ OPERATIONS_FEED (full width)                          │
└───────────────────────────────────────────────────────┘
```

`grid-cols-1 lg:grid-cols-[1fr_360px]` — one primary column, one
fixed-ish rail column, collapsing to a single mobile stack in the same
priority order (matchup → squad → operational rail → feed) rather than a
different order per breakpoint this time; the earlier per-breakpoint
`order-*` trick wasn't needed because the new source order already reads
correctly on mobile. `MatchupHero`, `RoundStatus`, and `StandingsPreview`
were deleted outright — their content lives in `MatchupCommand` and
`OperationsRail` now, not in three separate components plus a hero.

**MatchupCommand**: no more `rounded-2xl` card with a decorative radial
blur. It's a `border border-border` module: header strip (`MATCHUP_COMMAND`
+ live/matchday meta) → crests/score/progress bar → a
`grid-cols-2 divide-x` readout (`PROJECTED`/`ACTIVE`/`REMAINING` per team)
→ a shared `DELTA` row. The opponent's `ACTIVE`/`REMAINING` numbers come
from a small hand-authored `opponentLineupBuckets` mock
(`lib/mock/dashboard.ts`) — no full second roster exists, and this was the
one case where a coherent, clearly-commented mock addition was preferable
to leaving the opponent side data-empty.

**Team** (`src/app/team/page.tsx`) — previously: a caption line, then
`[1.15fr_0.85fr]` pitch/`space-y-8` loose section stack (Bench, Squad
Availability, Round Intelligence, Next Lock, Fixtures each with their own
`<h2>` and a large gap to the next). Now: a `MODE/FORMATION/ACTIVE/LOCKED/
REMAINING` control strip above the pitch (the literal bordered-instrument
row requested — `MODE` reflects `editing` state live), then
`lg:grid-cols-[1.5fr_0.5fr]` with the pitch given real dominance and the
right side rebuilt as **one** `divide-y divide-border border` rail:
`BENCH` / `SQUAD_STATUS` / `ROUND_INTELLIGENCE` / `NEXT_LOCK` /
`FIXTURE_FEED`, each a `RailModule` instead of a standalone section with
its own heading and `space-y-8` gap. `SquadAvailability`, `RoundIntelligence`,
and `NextLock` had their own `<h2>` stripped since the rail now supplies
the header. `BenchRow`'s desktop column set dropped the `FIXTURE` column
(5 columns instead of 6, tighter fixed widths) — the old 6-column template
was sized for the previous, wider `0.85fr` rail and overflowed badly in
the new narrower one; club/status still communicate enough context, and
the dropped fixture code is available in `FIXTURE_FEED` /`NEXT_LOCK` below.

**Players** (`src/app/players/page.tsx` + `player-database-toolbar.tsx` +
`player-inspector-content.tsx`) — the split-pane/inspector-on-select
structure from §19 was already correct and stayed; three things changed to
make the *instrumentation* itself feel denser and more attached:
- The search input and the six filter cells are now **one**
  `divide-x divide-border border` strip (search was previously a separate
  rounded `border` box sitting above the filter strip).
- `PlayerTable` rows tightened (`py-2` from `py-2.5`, header `py-1.5` from
  `py-2`); the selected row's name goes `font-semibold` (from `font-medium`)
  so an active record reads as visually "current," not just left-edge
  tinted.
- `PlayerInspectorContent`'s identity block now shows `OWNERSHIP` and
  `STATUS` as two aligned readout rows (previously one combined
  `STATUS: <badge> <badge>` line), and the `Next` section gives the
  kickoff its own row rather than sharing one with HOME/AWAY — both changes
  make the record read as a denser, more structured pane rather than prose
  with badges inline.
- Header renamed `Player database` → `PLAYER_DATABASE` to match the
  module-header vocabulary used everywhere else (see below).

**Module headers**: `ModuleHeader` (standalone) and `RailModule` (nested in
a rail) are the two new shared primitives (§17) — every section title that
used to be a `text-lg font-semibold` human-register heading
(`Starting XI`, `Standings`, `Recent activity`, `Bench`, `Squad
availability`, `Round intelligence`, `Next lock`) is now one of these two:
mono, uppercase, `STARTING_XI`/`LEAGUE_TABLE`/`OPERATIONS_FEED`/`BENCH`/
`SQUAD_STATUS`/`ROUND_INTELLIGENCE`/`NEXT_LOCK`, with a right-aligned meta
slot (count, a link, a formation code) instead of a second floating link
element. Player and team names inside those sections stay human-register —
only the section's own label moved to the system register.

---

## Quality Check

Before shipping any new screen or component, ask:

1. **Could this belong to a generic AI SaaS product if the football words
   were swapped out?** If yes — not distinctive enough; reach for the
   operational register (§2, §10) and tactical visualization patterns
   (§11) harder.
2. **Could this plausibly be software used to operate a football team?**
   If no — it's missing football-specific information architecture
   (positions, fixtures, availability, club identity).
3. **Could a normal fantasy player still understand it immediately?** If
   no — it's tipped too far into terminal/system territory. Pull back:
   more human register, fewer codes, a plainer label.

The target is the middle of all three — never fully satisfied by
optimizing just one.
