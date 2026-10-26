-- Card Vault: initial schema. Run once in the Supabase SQL editor.
-- Ownership lives on the card (collection_items), never on a set.

-- Cards the user owns -------------------------------------------------------
create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id text not null,
  variant text not null check (variant in ('normal', 'holofoil', 'reverseHolofoil', '1stEditionHolofoil', '1stEditionNormal')),
  condition text not null default 'near_mint' check (condition in ('near_mint', 'lightly_played', 'played', 'damaged')),
  quantity int not null default 1 check (quantity > 0),
  created_at timestamptz default now(),
  unique (user_id, card_id, variant, condition)
);
create index collection_items_user_idx on public.collection_items (user_id);

-- Official sets the user is collecting --------------------------------------
create table public.tracked_sets (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  set_id text not null,
  created_at timestamptz default now(),
  primary key (user_id, set_id)
);

-- Custom sets ---------------------------------------------------------------
create table public.custom_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  color text not null,
  kind text not null check (kind in ('smart', 'picked')),
  query text,
  exclusions jsonb default '{}'::jsonb,
  icon_card_id text,
  created_at timestamptz default now()
);
create index custom_sets_user_idx on public.custom_sets (user_id);

-- Picked sets: the source of truth. Smart sets: a cache of the last resolution.
create table public.custom_set_cards (
  custom_set_id uuid not null references public.custom_sets on delete cascade,
  card_id text not null,
  resolved_at timestamptz default now(),
  primary key (custom_set_id, card_id)
);

-- Shared caches of pokemontcg.io data ---------------------------------------
create table public.card_cache (
  card_id text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

create table public.set_cache (
  set_id text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

-- One row per card per day whenever card_cache is refreshed; feeds "Biggest movers".
create table public.card_price_history (
  card_id text not null,
  taken_on date not null,
  usd jsonb,   -- tcgplayer prices keyed by variant: { "holofoil": 1.20, ... }
  eur jsonb,   -- { "trend": 1.23, "reverseHoloTrend": 0.5, "average": 1.38 }
  primary key (card_id, taken_on)
);

-- Daily collection totals ---------------------------------------------------
create table public.value_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  taken_on date not null,
  total_usd numeric(12, 2) not null,
  total_eur numeric(12, 2) not null,
  card_count int not null,
  unique (user_id, taken_on)
);

-- Profile -------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  display_name text not null,
  avatar_mode text not null default 'initials' check (avatar_mode in ('initials', 'card')),
  avatar_card_id text,
  currency_display text not null default 'both' check (currency_display in ('both', 'usd', 'eur'))
);

-- Row Level Security --------------------------------------------------------
alter table public.collection_items enable row level security;
alter table public.tracked_sets enable row level security;
alter table public.custom_sets enable row level security;
alter table public.custom_set_cards enable row level security;
alter table public.card_cache enable row level security;
alter table public.set_cache enable row level security;
alter table public.card_price_history enable row level security;
alter table public.value_snapshots enable row level security;
alter table public.profiles enable row level security;

-- Own rows only.
create policy "own rows" on public.collection_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.tracked_sets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.custom_sets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.value_snapshots for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Membership rows belong to whoever owns the parent custom set.
create policy "own set rows" on public.custom_set_cards for all to authenticated
  using (exists (select 1 from public.custom_sets s where s.id = custom_set_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.custom_sets s where s.id = custom_set_id and s.user_id = auth.uid()));

-- Caches: anyone can read, signed-in users can write. No deletes.
create policy "read" on public.card_cache for select to anon, authenticated using (true);
create policy "insert" on public.card_cache for insert to authenticated with check (true);
create policy "update" on public.card_cache for update to authenticated using (true) with check (true);

create policy "read" on public.set_cache for select to anon, authenticated using (true);
create policy "insert" on public.set_cache for insert to authenticated with check (true);
create policy "update" on public.set_cache for update to authenticated using (true) with check (true);

create policy "read" on public.card_price_history for select to anon, authenticated using (true);
create policy "insert" on public.card_price_history for insert to authenticated with check (true);
create policy "update" on public.card_price_history for update to authenticated using (true) with check (true);
