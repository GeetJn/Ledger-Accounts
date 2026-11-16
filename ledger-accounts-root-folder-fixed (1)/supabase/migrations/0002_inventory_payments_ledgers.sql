-- Ledger Accounts: inventory movement ledger, stock safeguards and payment reversals.
-- Apply after 0001_initial_schema.sql. Stock is optional: NULL means "not tracked".
alter table public.items
  add column if not exists category text not null default 'General',
  add column if not exists cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  add column if not exists low_stock_threshold numeric(14,3) not null default 5 check (low_stock_threshold >= 0);

alter table public.bill_items
  add column if not exists cost_price numeric(14,2) not null default 0 check (cost_price >= 0);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  item_id uuid not null,
  bill_id uuid,
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  movement_type text not null check (movement_type in ('opening','adjustment','sale','bill_revision_sale','bill_revision_return','bill_cancelled')),
  reason text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (shop_id,item_id) references public.items(shop_id,id),
  foreign key (shop_id,bill_id) references public.bills(shop_id,id)
);
create index if not exists stock_movements_shop_created_idx
  on public.stock_movements(shop_id, created_at desc);
create index if not exists stock_movements_item_created_idx
  on public.stock_movements(shop_id,item_id,created_at desc);

alter table public.stock_movements enable row level security;
drop policy if exists stock_movements_shop_read on public.stock_movements;
create policy stock_movements_shop_read on public.stock_movements
  for select to authenticated using (shop_id = public.current_shop_id());
revoke all on public.stock_movements from anon,authenticated;
grant select on public.stock_movements to authenticated;

-- Every stock change is recorded here. NULL stock stays untracked until the owner sets
-- an opening quantity; sales of untracked items do not accidentally create stock.
create or replace function public.apply_item_stock_delta(
  p_shop_id uuid, p_item_id uuid, p_delta numeric, p_movement_type text,
  p_bill_id uuid default null, p_reason text default null
) returns void
language plpgsql security definer set search_path=public,auth as $$
declare current_qty numeric(14,3);
begin
  if p_delta = 0 then return; end if;
  select stock_quantity into current_qty
    from public.items
    where id=p_item_id and shop_id=p_shop_id and archived_at is null
    for update;
  if not found then raise exception 'Inventory item not found'; end if;
  if current_qty is null then return; end if;
  if current_qty + p_delta < 0 then
    raise exception 'Insufficient stock for item %. Available: %, required: %',
      p_item_id, current_qty, abs(p_delta);
  end if;
  update public.items
    set stock_quantity=current_qty+p_delta, updated_at=now()
    where id=p_item_id and shop_id=p_shop_id;
  insert into public.stock_movements(shop_id,item_id,bill_id,quantity_delta,movement_type,reason,actor_id)
    values(p_shop_id,p_item_id,p_bill_id,p_delta,p_movement_type,nullif(p_reason,''),auth.uid());
end $$;

-- Snapshot purchase cost into each invoice line, so later catalogue price changes
-- do not rewrite the historical cost of goods sold.
create or replace function public.snapshot_bill_item_cost() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.item_id is not null then
    select coalesce(i.cost_price,0) into new.cost_price
      from public.items i where i.id=new.item_id and i.shop_id=new.shop_id;
    if not found then raise exception 'Inventory item does not belong to this shop'; end if;
  end if;
  return new;
end $$;
drop trigger if exists snapshot_bill_item_cost_trigger on public.bill_items;
create trigger snapshot_bill_item_cost_trigger
  before insert on public.bill_items for each row execute function public.snapshot_bill_item_cost();

-- A bill consumes tracked stock when finalized. Revisions restore the removed lines
-- and consume the replacement lines. Any shortage aborts the entire database transaction.
create or replace function public.apply_bill_finalization_stock() returns trigger
language plpgsql security definer set search_path=public as $$
declare line record;
begin
  if old.status is distinct from new.status and new.status='finalized' then
    for line in
      select item_id, sum(quantity) as quantity
      from public.bill_items
      where shop_id=new.shop_id and bill_id=new.id and item_id is not null
      group by item_id
    loop
      perform public.apply_item_stock_delta(new.shop_id,line.item_id,-line.quantity,
        'sale',new.id,'Stock deducted when invoice was finalized');
    end loop;
  elsif old.status='finalized' and new.status in ('cancelled','archived') then
    for line in
      select item_id, sum(quantity) as quantity
      from public.bill_items
      where shop_id=new.shop_id and bill_id=new.id and item_id is not null
      group by item_id
    loop
      perform public.apply_item_stock_delta(new.shop_id,line.item_id,line.quantity,
        'bill_cancelled',new.id,'Stock returned because invoice was cancelled or archived');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists bill_finalization_stock_trigger on public.bills;
create trigger bill_finalization_stock_trigger
  after update of status on public.bills
  for each row execute function public.apply_bill_finalization_stock();

create or replace function public.apply_bill_item_stock_change() returns trigger
language plpgsql security definer set search_path=public as $$
declare parent_shop uuid; parent_status text;
begin
  if tg_op='DELETE' then
    select shop_id,status into parent_shop,parent_status from public.bills where id=old.bill_id;
    if parent_status='finalized' and old.item_id is not null then
      perform public.apply_item_stock_delta(parent_shop,old.item_id,old.quantity,
        'bill_revision_return',old.bill_id,'Stock returned while revising invoice');
    end if;
    return old;
  else
    select shop_id,status into parent_shop,parent_status from public.bills where id=new.bill_id;
    if parent_status='finalized' and new.item_id is not null then
      perform public.apply_item_stock_delta(parent_shop,new.item_id,-new.quantity,
        'bill_revision_sale',new.bill_id,'Stock deducted for revised invoice line');
    end if;
    return new;
  end if;
end $$;
drop trigger if exists bill_item_stock_change_trigger on public.bill_items;
create trigger bill_item_stock_change_trigger
  after insert or delete on public.bill_items
  for each row execute function public.apply_bill_item_stock_change();

-- Set an opening balance or perform a counted stock adjustment with a mandatory reason.
create or replace function public.set_item_stock(
  p_item_id uuid, p_quantity numeric, p_reason text
) returns numeric
language plpgsql security definer set search_path=public,auth as $$
declare sid uuid:=public.current_shop_id(); current_qty numeric(14,3); delta numeric(14,3);
begin
  if sid is null then raise exception 'Shop profile not found'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'Stock quantity must be zero or greater'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Enter a reason for this stock adjustment'; end if;
  select stock_quantity into current_qty from public.items
    where id=p_item_id and shop_id=sid and archived_at is null for update;
  if not found then raise exception 'Item not found'; end if;
  delta:=p_quantity-coalesce(current_qty,0);
  update public.items set stock_quantity=p_quantity,updated_at=now() where id=p_item_id and shop_id=sid;
  if delta<>0 then
    insert into public.stock_movements(shop_id,item_id,quantity_delta,movement_type,reason,actor_id)
      values(sid,p_item_id,delta,case when current_qty is null then 'opening' else 'adjustment' end,trim(p_reason),auth.uid());
  end if;
  insert into public.security_logs(shop_id,actor_id,event,success,details)
    values(sid,auth.uid(),'inventory_stock_adjusted',true,jsonb_build_object('item_id',p_item_id,'old_quantity',current_qty,'new_quantity',p_quantity,'reason',trim(p_reason)));
  return p_quantity;
end $$;

-- Payment corrections are reversals, not destructive deletes. The invoice balance is
-- recalculated under a row lock and the original payment remains in the audit trail.
create or replace function public.reverse_payment(p_payment_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare sid uuid:=public.current_shop_id(); p public.payments%rowtype; b public.bills%rowtype;
begin
  if sid is null then raise exception 'Shop profile not found'; end if;
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'A reversal reason of at least five characters is required'; end if;
  select * into p from public.payments
    where id=p_payment_id and shop_id=sid and reversed_at is null for update;
  if not found then raise exception 'Payment not found or already reversed'; end if;
  select * into b from public.bills where id=p.bill_id and shop_id=sid for update;
  if not found then raise exception 'Linked invoice not found'; end if;
  if b.amount_paid < p.amount then raise exception 'Payment ledger is inconsistent; reversal stopped';
  end if;
  update public.payments set reversed_at=now(),reversal_reason=trim(p_reason)
    where id=p.id and shop_id=sid and reversed_at is null;
  update public.bills set amount_paid=greatest(0,amount_paid-p.amount),updated_at=now(),updated_by=auth.uid()
    where id=b.id and shop_id=sid;
  insert into public.security_logs(shop_id,actor_id,event,success,details)
    values(sid,auth.uid(),'payment_reversed',true,jsonb_build_object('payment_id',p.id,'bill_id',b.id,'amount',p.amount,'reason',trim(p_reason)));
end $$;

revoke all on function public.apply_item_stock_delta(uuid,uuid,numeric,text,uuid,text) from public,anon,authenticated;
revoke all on function public.set_item_stock(uuid,numeric,text) from public,anon;
revoke all on function public.reverse_payment(uuid,text) from public,anon;
grant execute on function public.set_item_stock(uuid,numeric,text),public.reverse_payment(uuid,text) to authenticated;

-- Inventory quantities must only be changed through the stock RPC, so each change
-- has an auditable stock movement. Other catalogue fields remain editable.
revoke insert,update on public.items from authenticated;
grant insert (shop_id,name,mrp,unit,description,sku,tax_rate,photo_path,category,cost_price,low_stock_threshold)
  on public.items to authenticated;
grant update (name,mrp,unit,description,sku,tax_rate,photo_path,category,cost_price,low_stock_threshold,updated_at,archived_at)
  on public.items to authenticated;
