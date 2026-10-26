# Card Vault

A Pokémon card collecting app for iPad (and any other device). Track the cards you own, see what's missing from the sets you're collecting, and watch what the collection is worth. It installs to the home screen as a PWA and syncs through Supabase.

Built with Vite, React, TypeScript, Tailwind, TanStack Query, Recharts and Supabase. Card data, images and USD prices come from [pokemontcg.io](https://pokemontcg.io); EUR prices come from [TCGdex](https://tcgdex.dev).

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev
```

With no Supabase keys in `.env.local`, the app runs in **device-only mode**: everything is saved in the browser on that device and nothing syncs. That's handy for trying it out, but use Supabase for real.

```bash
npm test          # unit tests for pricing, set progress, smart-set filters, snapshots
npm run build     # type-check and build to dist/
```

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and press **Run**.
3. Turn off sign-ups and email confirmations, since you'll create every account yourself:
   - **Authentication → Sign In / Providers → Email**: turn off **Confirm email**.
   - **Authentication → Sign In / Providers**: turn off **Allow new users to sign up**.
4. Create the family account: **Authentication → Users → Add user → Create new user**. Enter the email and password, and tick **Auto Confirm User**.

   To let someone else use the app (a friend, a sibling), create another user the same way. Each account gets its own separate collection, sets, value history and avatar; nobody can see anyone else's cards. Send them the app link and the email and password you set. Once signed in, anyone can change their own name and password from Settings (tap the avatar on the home screen); changing the password asks for the current one first. To remove someone later, delete their user and all their data goes with it.
5. Get the two values the app needs:
   - **Publishable key**: **Project Settings → API Keys**. It starts with `sb_publishable_`. (Use the publishable key, never a secret key.)
   - **Project URL**: it's `https://<project-ref>.supabase.co`. The project ref is the random string in your dashboard's address bar (`supabase.com/dashboard/project/<project-ref>`). You can also copy the full URL from the **Connect** button at the top of the dashboard, or from **Project Settings → Data API**.

   Both are safe to put in the app; Row Level Security stops anyone reading or changing your rows without signing in.

For local development, put them in `.env.local`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

## 2. Deploy to GitHub Pages

1. Create a GitHub repository (e.g. `card-vault`) and push this project to its `main` branch.
2. **Settings → Secrets and variables → Actions → New repository secret**, and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_POKEMONTCG_API_KEY` (optional; a free key from [dev.pokemontcg.io](https://dev.pokemontcg.io) makes the card API more reliable)
3. **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**.
4. Push to `main` (or run the workflow from the **Actions** tab). The app is published at `https://<your-username>.github.io/<repo-name>/`.

The workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) runs the tests, builds with the repo name as the base path, and deploys `dist/`. The app uses hash URLs (`…/#/set/sv7`) so links always work on Pages.

## 3. Add it to the iPad home screen

1. Open the Pages URL in **Safari** on the iPad.
2. Sign in with your account.
3. Tap the **Share** button, then **Add to Home Screen**, then **Add**.

It now opens full screen like an app and stays signed in. Sign out is under Settings (tap the avatar on the home screen).

## Design

Dark "neon" theme from the design handoff: Sora and JetBrains Mono, violet accents, glowing set colours, and a floating tab bar (Home, Sets, Add, Trends) on every screen size. Shared styles live in `src/index.css` (tokens and component classes like `.surface`, `.chip-btn`, `.opt`, `.cta`, `.seg`). Trends opens the value chart.

The app icon is `public/icon.svg`. After editing it, regenerate the PNGs with `npm run icons`.

## Editing the app's data

### Upcoming sets — `src/data/upcoming-sets.json`

The "Coming next" card first looks for a future-dated set in the card API. Neither pokemontcg.io nor TCGdex lists sets before they're released (checked October 2026), and there's no free API for announced sets, so in practice it uses this file:

```json
[
  { "name": "Example Set", "code": "ME6", "releaseDate": "2026-11-14", "cardCount": 130 }
]
```

`releaseDate` is `YYYY-MM-DD`. Past dates are skipped automatically, and the soonest future entry is shown; with no future entries the card is hidden. Main English sets are announced a few months ahead (roughly four a year), so add the next one when it's announced and push.

### Set colours — `src/data/set-colors.ts`

Each official set's colour is used for its icon ring, glow and progress bar. Use bright colours: the app is dark, so they're meant to glow. Add a line using the set's pokemontcg.io id (the part before the dash in a card id, like `sv7` in `sv7-128`):

```ts
export const SET_COLORS: Record<string, string> = {
  sv7: '#2dd4bf',
  me6: '#38bdf8', // add new sets like this
}
```

Sets without an entry get a colour from `NEON_PALETTE`, picked from the set id, so they always keep the same one.

### Avatar options — `src/data/avatar-options.ts`

The nine Pokémon on the Settings screen each point at a card id. Change one to a different card id to use different art, or set it to `null` and the app picks the newest card with that name.

## Good to know

- **Prices.** USD is TCGplayer's market price via pokemontcg.io. EUR is Cardmarket's trend price via TCGdex, updated daily and covering new sets; pokemontcg.io's own EUR prices stopped updating in November 2025, so they're only used when TCGdex doesn't have a card. TCGdex has no bulk price endpoint, so prices are fetched card by card and cached in Supabase for a day (`src/lib/tcgdex.ts`).
- **Prices show in pounds by default.** There's no GBP price source, so £ is Cardmarket's EUR price × 0.85 (`EUR_TO_GBP` in `src/lib/pricing.ts`); cards with no EUR price show in dollars instead. **Settings → Show prices in** switches to USD or EUR. (The database stores the GBP choice as `both`, its old "USD and EUR" value, so no migration is needed.)
- **2026 sets have no USD prices** in pokemontcg.io (as of October 2026), so dollar totals leave those cards out. GBP and EUR totals are the most complete.
- **eBay sold prices** have a placeholder (`ebaySoldGbp` in `src/lib/pricing.ts`) that returns nothing for now; the card screen says "Sold prices not available".
- **The card API is flaky without a key.** Requests are retried with backoff, and everything fetched is cached in Supabase (`card_cache`, `set_cache`) and by the service worker, so pages still open offline.
- **pokemontcg.io's future:** Scrydex says it is the official successor to pokemontcg.io, and that an end-of-life date for the old API will be announced. The API code is all in `src/lib/tcg.ts` if it ever needs swapping.
- **Value history** builds up one point per day, recorded when the app is opened. "Biggest movers" compares each card with the price saved about a week earlier, so it starts filling in after a few days of use.
