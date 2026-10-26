# Build "Card Vault": a Pokémon card collecting PWA

## What this is

A web app for my son to track the Pokémon cards he owns, see what he's missing from the sets he's collecting, and watch what his collection is worth. He'll use it mainly on an iPad (portrait and landscape), saved to the home screen as a PWA, and it must sync so it also works on another device. The framing is **collecting and mastering sets**, with value as a secondary stat. Keep the UI simple and friendly for a child: big tap targets, card images front and centre, minimal text.

I've designed the screens already. The mockups are described in detail under "Screens" below; follow them closely.

## Stack (non-negotiable)

- Vite + React + TypeScript
- Tailwind CSS
- `vite-plugin-pwa` for manifest + service worker
- TanStack Query for all data fetching and caching
- Recharts for the value chart
- Supabase (Postgres + Auth) for synced data. Front-end only talks to Supabase via `@supabase/supabase-js`; no custom server.
- Deployed to GitHub Pages via a GitHub Actions workflow. The app lives under a repo subpath, so set Vite `base` correctly and use hash routing so deep links don't 404 on Pages.
- Card data and prices from the Pokémon TCG API (`https://api.pokemontcg.io/v2`). Read https://docs.pokemontcg.io before writing the client. It works without a key; support an optional `VITE_POKEMONTCG_API_KEY` env var.

Put Supabase URL and anon key in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. These are public by design; security comes from Row Level Security. Provide `.env.example` and wire the env vars into the GitHub Actions workflow via repository secrets.

## Data model (Supabase)

Write `supabase/migrations/0001_init.sql` I can run in the Supabase SQL editor.

**Ownership lives on the card, never on the set.** A set (official or custom) is just a list of card IDs; "got" and "missing" are computed at render time by intersecting the set's cards with the user's owned cards. This means adding a card once makes it count towards every set that contains it, with no extra writes.

**collection_items** (cards the user owns)
- `id uuid pk default gen_random_uuid()`
- `user_id uuid references auth.users not null default auth.uid()`
- `card_id text not null` (pokemontcg.io card id, e.g. `sv7-128`)
- `variant text not null` one of `normal`, `holofoil`, `reverseHolofoil`, `1stEditionHolofoil`, `1stEditionNormal` (matches TCGplayer price keys)
- `condition text not null default 'near_mint'` one of `near_mint`, `lightly_played`, `played`, `damaged`
- `quantity int not null default 1 check (quantity > 0)`
- `created_at timestamptz default now()`
- unique on `(user_id, card_id, variant, condition)`

**tracked_sets** (official sets the user is collecting)
- `user_id uuid not null default auth.uid()`
- `set_id text not null` (pokemontcg.io set id, e.g. `sv7`)
- `created_at timestamptz default now()`
- pk `(user_id, set_id)`

**custom_sets**
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null default auth.uid()`
- `name text not null`
- `color text not null` (hex)
- `kind text not null` one of `smart`, `picked`
- `query text` (for smart sets: the pokemontcg.io `q` string, e.g. `name:pikachu`)
- `exclusions jsonb default '{}'` (for smart sets: `{ "promos": true, "beforeYear": 2020, "secretRares": false, "trainers": false }`)
- `icon_card_id text` (optional card whose art represents the set)
- `created_at timestamptz default now()`

**custom_set_cards** (membership; for picked sets this is the source of truth, for smart sets it's a cache of the last query resolution)
- `custom_set_id uuid references custom_sets on delete cascade`
- `card_id text not null`
- `resolved_at timestamptz default now()`
- pk `(custom_set_id, card_id)`

**card_cache**
- `card_id text pk`
- `data jsonb not null` (full card object from the API: `images`, `set`, `number`, `rarity`, `types`, `subtypes`, `hp`, `tcgplayer`, `cardmarket`)
- `fetched_at timestamptz not null default now()`
- Shared, world-readable, writable by any authenticated user.

**set_cache**
- `set_id text pk`
- `data jsonb not null` (set object: `name`, `series`, `printedTotal`, `total`, `releaseDate`, `images`)
- `fetched_at timestamptz not null default now()`
- Shared like card_cache.

**value_snapshots**
- `id bigint generated always as identity pk`
- `user_id uuid not null default auth.uid()`
- `taken_on date not null`
- `total_usd numeric(12,2) not null`
- `total_eur numeric(12,2) not null`
- `card_count int not null`
- unique on `(user_id, taken_on)`

**profiles**
- `user_id uuid pk references auth.users`
- `display_name text not null`
- `avatar_mode text not null default 'initials'` one of `initials`, `card`
- `avatar_card_id text` (card whose art is cropped into the avatar circle)
- `currency_display text not null default 'both'` one of `both`, `usd`, `eur`

Enable RLS everywhere. Users read/write only their own rows in collection_items, tracked_sets, custom_sets, custom_set_cards, value_snapshots, profiles. The two cache tables are readable by anyone, insert/update by authenticated users.

## Auth

Email + password only. One shared family account. Minimal login screen, stays logged in indefinitely. Sign out lives on the Settings screen only.

## Pricing logic

Each card has `tcgplayer.prices` (USD, keyed by variant, with `market`, `low`, `mid`, `high`) and `cardmarket.prices` (EUR, with `averageSellPrice`, `trendPrice`, `reverseHoloTrend`, not keyed by variant). Implement `priceFor(card, variant, condition)` returning `{ usd, eur }`:

- USD: `tcgplayer.prices[variant].market`, falling back to `mid`, then to any other variant's market.
- EUR: `cardmarket.prices.reverseHoloTrend` for `reverseHolofoil`, otherwise `trendPrice`, falling back to `averageSellPrice`.
- Condition multiplier on both: near_mint 1.0, lightly_played 0.85, played 0.7, damaged 0.5. Keep as a constant.
- Return `null` when no data; show "—" in the UI, never $0.

Show USD and EUR per the profile's `currency_display` setting (default both), with EUR also shown as approximate GBP using a constant `EUR_TO_GBP = 0.85` labelled "approx". No exchange-rate API.

Price freshness: if cached card data is older than 24h, refetch and update `card_cache`. Batch refreshes for whole sets (fetch by `set.id:` with pagination, or `id:` OR-queries; check the docs and pick whatever minimises requests). Cap concurrency, retry with backoff on 429.

Leave a slot in the data layer and on the card screen for an eBay "recently sold" GBP price (`ebaySoldGbp: number | null`). Render "Recently sold on eBay: £X" when present and "Sold prices not available" when null. Don't integrate a source now; I may add PriceCharting or similar later.

## Sets logic

- An **official set** is a pokemontcg.io set. Its card list is `GET /cards?q=set.id:sv7` (all pages), cached in `card_cache`. The user tracks a set by adding a `tracked_sets` row.
- A **smart custom set** resolves its `query` against the API, applies `exclusions` client-side (promos = sets whose series or name contains "Promo"; beforeYear = set releaseDate; secretRares = card number > set printedTotal; trainers = supertype Trainer), writes the resulting card IDs into `custom_set_cards`, and re-resolves if `resolved_at` is older than 24h or the user pulls to refresh.
- A **picked custom set** has exactly the cards the user added to `custom_set_cards`.
- Progress for any set = owned card IDs ∩ set card IDs, as count and percentage. Mastered = 100%.
- A set's value = sum of priceFor over owned cards in that set.
- "Missing" cards are set cards not owned; "priciest missing" is the one with the highest USD market price.
- Removing a card from the collection just deletes/decrements the `collection_items` row; every set recomputes.

## Upcoming set

On the dashboard show a "Coming next" card. Try the API first: any set in `GET /sets` whose `releaseDate` is in the future, soonest first. If none, fall back to `src/data/upcoming-sets.json` (array of `{ name, code, releaseDate, cardCount }`) which I'll maintain by hand. Show name, release date, card count, and a days-to-go counter. Seed the JSON with two placeholder entries I can edit.

## Visual design

Glassmorphism, playful but clean. Typeface: Outfit from Google Fonts (weights 500 to 800). Colours:

- Ink: `#15172B` for text and all primary buttons and the nav pill. Buttons are dark, never coloured.
- Secondary text `#5B6480`, muted `#8A93AD`.
- Each screen has a single soft background wash: a light base plus one large blurred blob (`filter: blur(110px)`, ~0.7 opacity) in one corner. Neutral screens (dashboard, search, value, settings) use base `#F4F5F9` and blob `#D7DBE8`. A set screen uses the set's colour at low saturation. A card screen uses the card's primary type colour at low saturation. Never more than one hue per screen.
- A subtle grain overlay on every screen: an inline SVG `feTurbulence` filter at ~0.07 opacity with `mix-blend-mode: multiply`, `pointer-events: none`.
- Glass cards: `background: rgba(255,255,255,0.55); backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.8); border-radius: 22px; box-shadow: 0 8px 30px rgba(21,23,43,0.06)`. Include `-webkit-backdrop-filter` for Safari. Only blur elements that don't scroll (nav pill, header chrome, modals); long scrolling lists of cards use the same rgba white without backdrop-filter to keep iPad scrolling smooth.
- Segmented controls and filter pills: a glass pill container with a dark `#15172B` active segment.
- Progress bars: 10px, fully rounded, track `rgba(21,23,43,0.08)`, fill in the set colour.
- Green for positive change `#1F7A4C`, red for negative `#B3261E`.

**Set colours**: a hand-curated map `src/data/set-colors.ts` from set id to hex (seed with sv7 teal `#0E9F8A`, sv3 orange-red `#E8542F`, sv3pt5 yellow `#F2B705`, sv2 purple `#7C4DDB`, sv6pt5 blue `#3B6FD6`), with a neutral `#5B6480` fallback. Custom sets use their stored colour.

**Type tints** for card tiles, `src/data/type-colors.ts`, a two-stop gradient per type: Grass `#DDF5D2→#B6E6A3`, Fire `#FFE3B8→#FFC58F`, Water `#D6EEFF→#A9D6F7`, Lightning `#FFF3BF→#FFE07A`, Psychic `#FFE0EE→#F7BDD8`, Fighting `#F5E1D0→#E2B894`, Darkness `#E3E3EA→#B9BAC8`, Metal `#E9ECF2→#C5CAD6`, Fairy `#FFE4F3→#F6C0E3`, Dragon `#E6E0FF→#C3B4F5`, Colorless `#EDE7FF→#D3C6FA`, Trainer/Energy `#EEF0F6→#D5D9E6`. Used behind card images while loading and as the tint behind the card on the card screen.

**Nav**: a floating dark pill, horizontally centred, 28px from the bottom (respecting safe-area inset), `background: rgba(21,23,43,0.92)`, blur, fully rounded, 8px padding. Three items: Sets, Add, Value. The active item shows an icon plus label on a lighter pill; inactive items are icon-only in `#B9BFD6`. Settings is reached via the avatar on the dashboard, not the nav.

**Icons**: inline stroke SVGs, never emoji. No Pokémon, Pokéball or trademark imagery anywhere in the app chrome or the PWA icon; make a simple original icon.

**Responsive**: iPad portrait is ~820 to 834pt wide and landscape ~1180 to 1194pt. Set the main breakpoint at 900px (not Tailwind's 768). Below 900 (portrait): content stacks. At 900+ (landscape): the card screen goes two-column (see below), the dashboard stats row and set list sit side by side if there's room, grids get one more column. Everything must also work at phone width.

## Screens

### Dashboard (home, route `/`)
- Header: small date line ("Sunday 26 October"), big "My cards" title. Top right: the **avatar pill** (glass pill containing a 48px circle with initials or the cropped card art, the display name, and "Settings" as a secondary line). Tapping it opens Settings. No add button here; Add is in the nav.
- **Three stat tiles** in a row (glass): Cards (count, "+N this week"), Value (USD total, "▲ $X · €Y"), Mastered ("0 / 4", "Closest: <set> at N%").
- **Coming next** card: dark glass (`rgba(21,23,43,0.92)`, white text) with "COMING NEXT" eyebrow, set name, "Releases <date> · N cards", and a days-to-go block on the right.
- "Sets" heading with a **My sets / All sets** segmented toggle on the right. My sets = tracked official sets plus all custom sets, sorted by progress descending. All sets = every official set from the API newest first (plus custom sets at the top), untracked ones shown with no progress and a "Track" affordance; tapping an untracked set opens it and tracking happens from there.
- **Set rows** (glass, full width, tappable): 64px rounded square logo block in the set colour (use the set's symbol image from the API if available, else the set code as text) on the left; name, "owned / total · $value" on the right of the name line; progress bar; big percentage in the set colour on the far right. Custom sets show a small "SMART SET" or "PICKED" badge next to the name and a circular icon (the icon card's art, or a star icon on the set colour).
- Last row: a dashed "New set" row, which opens a chooser: "Track an official set" (list of sets from the API with a search box) or "Make a custom set" (goes to the custom set screen).

### Set detail (route `/set/:id` and `/custom/:id`)
- Background washed in the set colour.
- Top row: glass "Sets" back pill; on the right a glass pill with set code and release date (custom sets: "Smart set · N cards" or "Picked · N cards").
- Hero glass card: set logo block + big set name; "12 of 142 cards · worth $214.10 · 130 to go"; progress bar; on the right a 140px conic-gradient progress ring with the percentage and "mastered".
- Filter pills: All N / Got N / Missing N. On the right a line "Priciest missing: <card> · $X".
- Card grid: 5 columns portrait, 7 landscape. Owned cards: image on a type-tinted gradient, rounded 14px, soft shadow, with "Holo"/"Reverse" badge top-left when not normal and "×N" badge top-right when quantity > 1, price under the tile. Missing cards: the image at 35% opacity inside a dashed border, number and price in muted grey. Tap an owned card for the card detail; tap a missing card to open the add-card screen for it.
- For custom sets: an "Edit set" affordance (rename, recolour, change query/exclusions for smart sets, add/remove cards for picked sets, delete set). Adding cards to a picked set reuses the search screen with the button reading "Add to <set name>" and does NOT mark cards as owned.
- Tracking an untracked official set from here: a single "Start collecting this set" dark button in the hero.

### Add: search (route `/add`)
- Big "Add a card" title. One large search input (glass, dark 2px border, 22px rounded, search icon, large text) that searches by name with `name:<term>*`. Also accept a number pattern like "128/142" or "128" and search `number:128`. Debounce 300ms, minimum 2 characters.
- Under the input: "N cards match "<term>"" on the left, an All / My sets toggle on the right (My sets filters results to tracked sets and custom set members).
- Results list: glass rows with a 54×75 thumbnail (type-tinted gradient behind the image), name, "Set · number · rarity", price, chevron. Sorted newest set first. Tap goes to the add-card screen.
- Footer hint: "Can't find it? Try the number on the card, like 128/142".
- Empty state before typing: a friendly prompt and the 6 most recently added cards as quick re-add shortcuts.

### Add: card (route `/add/:cardId`)
- Background washed in the card's primary type colour.
- Top row: glass "Results" back pill (or "Back to <set>" when arriving from a set); on the right a glass pill reading "You don't have this one yet" or "You have N".
- **Portrait (< 900px)**: centred title block (big name, "Set · number · rarity", then type / subtype / HP chips in the type colour at 10% opacity), then the card image centred at 300px wide with a strong soft shadow in the type colour, then one glass panel with three columns: Which kind? (vertical list of variant buttons, each labelled "Holo · $38.50", only variants present in `tcgplayer.prices`, first selected by default), Condition (vertical list, Near mint default), How many? (−/+ stepper with 56px buttons, plus the eBay sold line underneath). Then the full-width dark "Add to my collection" button, then two small glass pills: "+ $X to your total" (green) and "<set> → N of M" (set colour) for each set this card belongs to (show up to two, "+N more" after).
- **Landscape (≥ 900px)**: two columns, card image (360px wide) on the left, everything else on the right, both vertically centred in the space above the nav. The variant/condition rows are horizontal pill rows; the stepper and eBay line share a row; the button and the two summary lines share a row.
- Adding the same card/variant/condition again increments quantity. Optimistic update.
- **Celebration on add**: when the add succeeds, play a quick, satisfying animation (under 800ms total, no sound): the card image pops (scale 1 → 1.08 → 1 with a spring), a burst of 12 to 16 small confetti particles in the set colour and the type colour fires from behind the card and fades out, and the "+ $X" and "N of M" pills count up to their new values. If the add completes a set (100%), play a bigger version: full-screen confetti for ~1.5s and a "Set mastered!" glass toast with the set name. Use CSS keyframes or Framer Motion (add it if you use it), respect `prefers-reduced-motion` by reducing to a simple fade. After the animation, stay on the screen with the pill now reading "You have N" so he can add another.

### Card detail (route `/card/:cardId`, for owned cards)
- Same layout as Add: card but with the panel in edit mode: current variant/condition/quantity shown, change any of them, "Remove from collection" as a quiet destructive link. Shows every set this card counts towards.

### Value (route `/value`)
- "Value" title with USD / EUR toggle top right.
- Hero glass card: "TODAY" eyebrow, huge total, "€X · approx £Y" line; on the right two tinted tiles for 7-day and 30-day change (green or red). Then a Recharts line chart of `value_snapshots` with a soft gradient fill under the line in green, y-axis in the selected currency, x-axis dates; then a 7 days / 30 days / All time segmented control.
- Row of four small glass stat tiles: Priciest card, Average per card, Holos (value and % of total), Best set (value, set name in set colour).
- "Biggest movers this week" list: glass rows with thumbnail, name, "Set · number · variant", and the delta coloured green/red. Compute from the difference between the card's current price and the price stored in `card_cache` 7 days ago; if you don't have history yet, keep a `card_price_history` table (card_id, taken_on, usd, eur) that gets a row whenever card_cache is refreshed on a new day.
- Daily snapshot: on app open, if no `value_snapshots` row exists for today, compute totals from fresh prices and insert one.

### Settings (route `/settings`)
- Glass "Back" pill, "Settings" title.
- Account card: 88px avatar, display name (editable inline), email, "Family account", "Sign out" button.
- **Pick your Pokémon** card: a 5-column grid of 10 options. First is "Initials" (dark circle with initials). The other nine are Charizard, Pikachu, Gengar, Squirtle, Bulbasaur, Eevee, Snorlax, Mewtwo, Lucario. For each, resolve a card via the API (`name:<name>` sorted newest set first, first result with an image), cache the card id in a small `src/data/avatar-options.ts` map once resolved, and render the card's `images.small` cropped into a 72px circle with `object-fit: cover; object-position: 50% 18%`. Selecting one sets `profiles.avatar_mode = 'card'` and `avatar_card_id`; selecting Initials reverts. Also allow "Use one of my cards" which opens a picker of owned cards. Fall back to initials if an image fails to load.
- Preferences card with rows: Show prices in (Both / USD / EUR), Export collection (Download JSON), Import collection (file picker), Prices last updated (timestamp, with a "Refresh now" link), optional API key field stored in localStorage.
- Footer: app version and "Card data from pokemontcg.io".

### New custom set (route `/custom/new`)
- Background washed in the chosen colour (default yellow).
- Glass "Cancel" pill, "New custom set" title.
- Set name input (large, dark border) with a colour picker row to its right (5 swatches: yellow, teal, orange-red, purple, blue; selected swatch gets a dark ring).
- "How do cards get in?" with two large selectable cards: **Smart set** ("Every card matching a search. New cards join automatically.") and **Pick cards** ("Build the list yourself, one card at a time."). Smart is default.
- Smart panel (glass): "Cards named" search input; "Leave out" toggle pills: Promos (on by default), Before 2020 (on by default, year editable), Secret rares, Trainer cards; then a live preview strip in the set colour at 12% opacity: "N cards match", "You already own X of them · worth $Y to complete", and a row of 3 thumbnails plus a "+N" placeholder. Debounce the preview query.
- Pick panel: a short explanation and a "Choose cards" button that opens the search screen in add-to-set mode; chosen cards appear as a thumbnail grid with remove buttons.
- Full-width dark button: Create "<name>". Footer hint: "Cards you add anywhere count towards this set too".

## PWA requirements

- `manifest.webmanifest`: name "Card Vault", short name "Cards", original icon set, `display: standalone`, `orientation: any`, theme colour `#15172B`, background `#F4F5F9`.
- Service worker: precache the app shell. Card images from `images.pokemontcg.io` cache-first with a size cap (~300 entries). API responses network-first with cache fallback so the dashboard and set pages render offline from last-known data.
- iOS meta tags (`apple-mobile-web-app-capable`, status bar style, apple touch icons) so it looks right on the iPad home screen.
- Handle safe-area insets, especially for the floating nav pill.

## Engineering notes

- One typed pokemontcg.io client module; type what we use, don't hand-write the whole card type.
- Keep `priceFor`, set progress, smart-set exclusion filtering, and snapshot totals as pure functions with Vitest tests.
- Loading, empty and error states everywhere. Empty collection: a friendly "Add your first card" prompt. Empty sets list: a "Pick a set to collect" prompt that opens the official set list.
- Optimistic updates for add/remove/quantity.
- `README.md` with: Supabase setup (create project, run migration, create the family user as confirmed, disable email confirmations), GitHub secrets to add, enabling GitHub Pages with the Actions source, how to add the app to the iPad home screen, how to edit `upcoming-sets.json` and `set-colors.ts`.
- GitHub Actions workflow that builds on push to `main` and deploys `dist` to Pages.

## Process

Before writing code, read the pokemontcg.io docs and confirm: the exact shape of `tcgplayer.prices` and `cardmarket.prices`; the `q` syntax for `name:`, `set.id:`, `number:`, and wildcard/OR; pagination and page size; whether `/sets` includes future-dated sets; the set `images.symbol` and `images.logo` fields. Then build in this order: scaffold + Supabase client + auth + migration; the card/set API client with caching; Dashboard with official set tracking; Set detail; Add (search → card) with the celebration; Custom sets; Value; Settings and avatars; PWA polish and responsive pass on a 834×1194 and 1194×834 viewport. Commit as you go with clear messages. Ask me if anything in this brief is ambiguous rather than guessing.
