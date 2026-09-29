# Eleven

A draft-style fantasy football platform covering Europe's Big Five leagues
(Premier League, La Liga, Bundesliga, Serie A, Ligue 1). Next.js 16 App
Router, Tailwind v4, Supabase (Postgres + Auth).

See `DESIGN.md` for the visual/interaction system and `docs/domain-model.md`
/ `docs/architecture.md` / `docs/data-flow.md` for the domain model this
schema implements.

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**The Dashboard, Team, and Players screens run entirely on mock data and
need no setup at all** — they work the moment you run `npm run dev`, with
or without Supabase configured. Only the real backend features (sign up/
sign in, creating a league, joining a league) need the Supabase setup
below.

## Supabase setup

Eleven uses Supabase for authentication and for the fantasy-league domain
(leagues, memberships, teams — see `supabase/migrations/`). Real football
data (players, clubs, fixtures) stays mocked until a future ingestion pass
— see `docs/architecture.md`.

### 1. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com/dashboard) if
you don't already have one for this app.

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the three values from your project's **Settings → API** page:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `publishable` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key — not used by any code yet, reserved for a future trusted-ingestion pass. **Never** expose this to the browser or prefix it with `NEXT_PUBLIC_`. |

`.env.local` is gitignored — never commit real credentials.

### 3. Apply the database migrations

The schema is fully defined as version-controlled SQL in
`supabase/migrations/` — nothing is created by hand through the dashboard.

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

`<your-project-ref>` is the short id in your project's URL
(`https://supabase.com/dashboard/project/<ref>`).

Alternatively, for fully local development with Docker:

```bash
npx supabase start   # spins up local Postgres + Auth + Studio
npx supabase db reset  # applies every migration from scratch
```

then point `.env.local` at the local URL/keys `supabase start` prints out.

### 4. (Optional) Regenerate database types

`src/lib/supabase/database.types.ts` is currently a small **hand-written**
subset of the real generated types (see the comment at the top of that
file for why). Once your project is linked, regenerate the real thing:

```bash
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

### What's real vs. mocked right now

| Real (Supabase) | Still mocked |
|---|---|
| Auth (sign up/in/out) | Football players, clubs, fixtures, stats |
| User profiles | Current matchup / standings content |
| Fantasy leagues, memberships, teams | Draft, scoring, waivers, trades |

## Tests, lint, build

```bash
npm test        # node's built-in test runner, no framework installed
npm run lint
npm run build
npx tsc --noEmit
```
