-- current_shop_id only reads the caller's own profile, whose SELECT policy
-- already enforces id = auth.uid(); it does not need SECURITY DEFINER.
create or replace function public.current_shop_id()
returns uuid
language sql
stable
security invoker
set search_path = public, auth
as $$
  select shop_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_shop_id() from public, anon, authenticated;
grant execute on function public.current_shop_id() to authenticated;
