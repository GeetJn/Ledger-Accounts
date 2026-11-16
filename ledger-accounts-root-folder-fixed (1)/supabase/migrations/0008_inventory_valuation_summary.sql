-- Shop-scoped inventory valuation using current tracked stock and current purchase cost.
create or replace function public.inventory_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public, auth
as $$
  with sid as (select public.current_shop_id() as id)
  select jsonb_build_object(
    'tracked_products',
      count(*) filter (where i.stock_quantity is not null),
    'untracked_products',
      count(*) filter (where i.stock_quantity is null),
    'low_stock_products',
      count(*) filter (
        where i.stock_quantity is not null
          and i.stock_quantity <= i.low_stock_threshold
      ),
    'stock_cost_value',
      coalesce(sum(greatest(i.stock_quantity, 0) * i.cost_price)
        filter (where i.stock_quantity is not null), 0)
  )
  from public.items i, sid
  where i.shop_id = sid.id
    and i.archived_at is null
$$;

revoke all on function public.inventory_summary() from public, anon;
grant execute on function public.inventory_summary() to authenticated;
