-- Card Vault: let people delete their own account from Settings.
-- Run once in the Supabase SQL Editor, after 0001 and 0002.
--
-- Deleting the auth user removes everything they own: every table points at auth.users with
-- "on delete cascade" (collection, sets, custom sets, value history, profile, friendships).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
