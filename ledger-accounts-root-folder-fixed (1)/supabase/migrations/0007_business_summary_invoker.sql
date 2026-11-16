-- The summary reads only tables already protected by shop-scoped RLS.
-- Run it with the caller's privileges instead of bypassing RLS as a definer.
create or replace function public.business_summary(
  p_from date default null,
  p_to date default null
) returns jsonb
language sql
stable
security invoker
set search_path = public, auth
as $$
  with sid as (select public.current_shop_id() as id),
  bill_stats as (
    select count(*) as bill_count,
      coalesce(sum(final_amount),0) as billed_value,
      coalesce(sum(amount_paid),0) as amount_recorded,
      coalesce(sum(discount_amount),0) as discounts,
      coalesce(sum(greatest(0,final_amount-amount_paid)),0) as outstanding
    from public.bills, sid
    where shop_id=sid.id and status='finalized'
      and (p_from is null or bill_date>=p_from)
      and (p_to is null or bill_date<=p_to)
  ),
  payment_stats as (
    select coalesce(sum(amount),0) as payments_received
    from public.payments, sid
    where shop_id=sid.id and reversed_at is null
      and (p_from is null or paid_at>=p_from::timestamptz)
      and (p_to is null or paid_at<(p_to+1)::timestamptz)
  ),
  expense_stats as (
    select coalesce(sum(amount),0) as expenses
    from public.expenses, sid
    where shop_id=sid.id and archived_at is null
      and (p_from is null or expense_date>=p_from)
      and (p_to is null or expense_date<=p_to)
  ),
  counts as (
    select
      (select count(*) from public.items, sid where shop_id=sid.id and archived_at is null) as products,
      (select count(*) from public.customers, sid where shop_id=sid.id and archived_at is null) as customers
  )
  select jsonb_build_object(
    'bill_count',bill_count,
    'billed_value',billed_value,
    'amount_recorded',amount_recorded,
    'payments_received',payments_received,
    'outstanding',outstanding,
    'discounts',discounts,
    'expenses',expenses,
    'products',products,
    'customers',customers
  )
  from bill_stats,payment_stats,expense_stats,counts
$$;

revoke all on function public.business_summary(date,date) from public, anon;
grant execute on function public.business_summary(date,date) to authenticated;
