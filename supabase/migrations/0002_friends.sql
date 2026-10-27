-- Card Vault: friends and swaps. Run once in the Supabase SQL editor, after 0001_init.sql.
--
-- Privacy model:
--   * Nobody can list or search users. A friend is found only by typing their exact email.
--   * Adding someone sends a request; nothing is shared until they accept.
--   * Friends can see each other's card ids and counts (to work out swaps), and display name
--     and avatar. Nothing else: no email, prices, sets or settings.
--   * All of this goes through the functions below (security definer), which check the caller.

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users on delete cascade,
  addressee uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz default now(),
  check (requester <> addressee)
);
-- One friendship per pair, whichever way round it was asked.
create unique index friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;
-- Either person can see and remove the friendship; creating and accepting go through functions.
create policy "parties read" on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
create policy "parties delete" on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));

-- Send a request to the account with exactly this email (case-insensitive).
-- Returns one row: result is 'requested', 'accepted' (they'd already asked you),
-- 'pending' (already asked), 'friends' (already friends), 'not_found' or 'self'.
create or replace function public.request_friend(friend_email text)
returns table (result text, friend_name text)
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  them uuid;
  existing public.friendships;
  their_name text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into them from auth.users where lower(email) = lower(trim(friend_email)) limit 1;
  if them is null then return query select 'not_found'::text, null::text; return; end if;
  if them = me then return query select 'self'::text, null::text; return; end if;
  select coalesce(display_name, 'Collector') into their_name from public.profiles where user_id = them;
  their_name := coalesce(their_name, 'Collector');

  select * into existing from public.friendships
    where least(requester, addressee) = least(me, them) and greatest(requester, addressee) = greatest(me, them);
  if found then
    if existing.status = 'accepted' then return query select 'friends'::text, their_name; return; end if;
    if existing.requester = them then
      -- They already asked us: adding them back accepts it.
      update public.friendships set status = 'accepted' where id = existing.id;
      return query select 'accepted'::text, their_name; return;
    end if;
    return query select 'pending'::text, their_name; return;
  end if;

  insert into public.friendships (requester, addressee) values (me, them);
  return query select 'requested'::text, their_name;
end $$;

-- Accept or decline a request sent to me.
create or replace function public.respond_friend(friendship uuid, accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if accept then
    update public.friendships set status = 'accepted' where id = friendship and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships where id = friendship and addressee = auth.uid() and status = 'pending';
  end if;
end $$;

-- My friendships, with the other person's display name and avatar.
create or replace function public.friend_list()
returns table (
  friendship_id uuid,
  friend_id uuid,
  status text,
  incoming boolean,
  display_name text,
  avatar_mode text,
  avatar_card_id text
)
language sql stable security definer set search_path = public
as $$
  select f.id,
         case when f.requester = auth.uid() then f.addressee else f.requester end,
         f.status,
         f.addressee = auth.uid(),
         coalesce(p.display_name, 'Collector'),
         coalesce(p.avatar_mode, 'initials'),
         p.avatar_card_id
  from public.friendships f
  left join public.profiles p on p.user_id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by f.created_at;
$$;

-- An accepted friend's cards: card id and total copies, nothing else.
create or replace function public.friend_cards(friend uuid)
returns table (card_id text, quantity int)
language sql stable security definer set search_path = public
as $$
  select c.card_id, sum(c.quantity)::int
  from public.collection_items c
  where c.user_id = friend
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and least(f.requester, f.addressee) = least(auth.uid(), friend)
        and greatest(f.requester, f.addressee) = greatest(auth.uid(), friend)
    )
  group by c.card_id;
$$;

-- Only signed-in users may call these.
revoke all on function public.request_friend(text) from public, anon;
revoke all on function public.respond_friend(uuid, boolean) from public, anon;
revoke all on function public.friend_list() from public, anon;
revoke all on function public.friend_cards(uuid) from public, anon;
grant execute on function public.request_friend(text) to authenticated;
grant execute on function public.respond_friend(uuid, boolean) to authenticated;
grant execute on function public.friend_list() to authenticated;
grant execute on function public.friend_cards(uuid) to authenticated;
