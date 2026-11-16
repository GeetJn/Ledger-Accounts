-- Bound cancellation-reason size at the database boundary as well as in the API.
create or replace function public.cancel_finalized_bill(
  p_bill_id uuid,
  p_token_hash text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  sid uuid := public.current_shop_id();
  b public.bills%rowtype;
begin
  if auth.uid() is null or sid is null then
    raise exception 'Sign in and a valid shop profile are required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A cancellation reason of at least five characters is required';
  end if;
  if char_length(trim(p_reason)) > 500 then
    raise exception 'Cancellation reason must be 500 characters or fewer';
  end if;
  if not exists (
    select 1 from public.owner_verifications
    where token_hash = p_token_hash and owner_id = auth.uid()
      and shop_id = sid and purpose = 'bill_edit' and expires_at > now()
  ) then
    raise exception 'Fresh owner verification required';
  end if;
  select * into b from public.bills
  where id = p_bill_id and shop_id = sid and status = 'finalized'
  for update;
  if not found then raise exception 'Finalized invoice not found'; end if;
  if coalesce(b.amount_paid, 0) > 0 or exists (
    select 1 from public.payments p
    where p.shop_id = sid and p.bill_id = b.id and p.reversed_at is null
  ) then
    raise exception 'Reverse all recorded payments before cancelling this invoice';
  end if;
  update public.bills
  set status = 'cancelled', cancelled_at = now(),
      cancellation_reason = trim(p_reason), updated_at = now(), updated_by = auth.uid()
  where id = b.id and shop_id = sid and status = 'finalized';
  delete from public.owner_verifications
  where token_hash = p_token_hash and owner_id = auth.uid()
    and shop_id = sid and purpose = 'bill_edit';
  insert into public.security_logs(shop_id, actor_id, event, success, details)
  values (sid, auth.uid(), 'bill_cancelled', true,
    jsonb_build_object('bill_id', b.id, 'bill_number', b.bill_number, 'reason', trim(p_reason)));
end;
$$;
revoke all on function public.cancel_finalized_bill(uuid, text, text) from public, anon;
grant execute on function public.cancel_finalized_bill(uuid, text, text) to authenticated;
