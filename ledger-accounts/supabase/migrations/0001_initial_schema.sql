-- Ledger Accounts: foundational PostgreSQL schema for Supabase.
-- All monetary values use NUMERIC, not floating-point types.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references auth.users(id) on delete restrict,
  owner_name text not null default '', name text not null default 'My Shop', country_code text not null default 'IN',
  currency text not null default 'INR' check(currency ~ '^[A-Z]{3}$'), locale text not null default 'en-IN', timezone text not null default 'Asia/Kolkata',
  phone_e164 text, email text, address text, logo_path text, tax_label text, tax_identifier text,
  default_tax_rate numeric(7,3) not null default 0 check(default_tax_rate between 0 and 100),
  invoice_footer text not null default E'Thank You!\nHave a Nice Day!', language text not null default 'en',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  shop_id uuid unique references public.shops(id) on delete set null,
  full_name text not null default '', language text not null default 'en', created_at timestamptz not null default now()
);
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete restrict,
  name text not null, phone_e164 text, email text, address text, photo_path text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique(shop_id,id)
);
create index if not exists customers_shop_name_idx on public.customers(shop_id, lower(name));
create index if not exists customers_shop_phone_idx on public.customers(shop_id, phone_e164);
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete restrict,
  name text not null, mrp numeric(14,2) not null default 0 check(mrp>=0), unit text not null default 'pcs',
  description text, sku text, tax_rate numeric(7,3) check(tax_rate between 0 and 100), photo_path text,
  stock_quantity numeric(14,3), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique(shop_id,id)
);
create index if not exists items_shop_name_idx on public.items(shop_id, lower(name));
create table if not exists public.invoice_counters (
  shop_id uuid primary key references public.shops(id) on delete restrict, next_number bigint not null default 1 check(next_number>0)
);
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete restrict,
  bill_number bigint, bill_title text, customer_id uuid, customer_name text, customer_phone_e164 text, customer_address text,
  status text not null default 'draft' check(status in ('draft','finalized','cancelled','archived')),
  bill_date date not null default current_date, due_date date, notes text,
  subtotal numeric(16,2) not null default 0, discount_amount numeric(16,2) not null default 0, bill_level_discount numeric(16,2) not null default 0,
  tax_rate numeric(7,3) not null default 0, tax_amount numeric(16,2) not null default 0,
  final_amount numeric(16,2) not null default 0, amount_paid numeric(16,2) not null default 0,
  created_by uuid not null references auth.users(id), updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), finalized_at timestamptz,
  last_autosaved_at timestamptz, cancelled_at timestamptz, timezone text not null default 'Asia/Kolkata',
  customer_snapshot jsonb not null default '{}'::jsonb,
  unique(shop_id,id), unique(shop_id,bill_number),
  constraint bill_customer_same_shop foreign key(shop_id,customer_id) references public.customers(shop_id,id),
  check(amount_paid>=0 and final_amount>=0 and (status='draft' or amount_paid<=final_amount))
);
create index if not exists bills_shop_created_idx on public.bills(shop_id, created_at desc);
create index if not exists bills_shop_number_idx on public.bills(shop_id, bill_number desc);
create index if not exists bills_shop_status_date_idx on public.bills(shop_id,status,bill_date desc);
create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete restrict,
  bill_id uuid not null, item_id uuid, item_name text not null, quantity numeric(14,3) not null check(quantity>0),
  unit text not null default 'pcs', mrp numeric(14,2) not null default 0 check(mrp>=0),
  rate numeric(14,2) not null check(rate>=0), discount numeric(14,2) not null default 0 check(discount>=0),
  line_total numeric(16,2) not null default 0, show_price_discount boolean not null default false,
  foreign key(shop_id,bill_id) references public.bills(shop_id,id) on delete cascade,
  foreign key(shop_id,item_id) references public.items(shop_id,id)
);
create index if not exists bill_items_bill_idx on public.bill_items(shop_id,bill_id);
create table if not exists public.bill_revision_history (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete restrict,
  bill_id uuid not null, revision_number integer not null, changed_by uuid not null references auth.users(id),
  previous_data jsonb not null, updated_data jsonb not null, changed_fields jsonb not null default '[]'::jsonb,
  change_reason text, changed_at timestamptz not null default now(), timezone text not null,
  foreign key(shop_id,bill_id) references public.bills(shop_id,id), unique(bill_id,revision_number)
);
create index if not exists bill_revision_lookup_idx on public.bill_revision_history(shop_id,bill_id,revision_number);
create table if not exists public.emergency_credentials (
  shop_id uuid primary key references public.shops(id) on delete cascade, password_hash text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.owner_verifications (
  token_hash text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade, purpose text not null check(purpose in ('bill_edit','bill_history')),
  expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists owner_verifications_expiry_idx on public.owner_verifications(expires_at);
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id), bill_id uuid not null,
  customer_id uuid, amount numeric(16,2) not null check(amount>0), method text not null check(method in ('cash','upi','bank_transfer','card','other')),
  reference text, notes text, paid_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  reversed_at timestamptz, reversal_reason text,
  foreign key(shop_id,bill_id) references public.bills(shop_id,id),
  foreign key(shop_id,customer_id) references public.customers(shop_id,id)
);
create index if not exists payments_shop_time_idx on public.payments(shop_id,paid_at desc);
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id), title text not null,
  amount numeric(16,2) not null check(amount>=0), expense_date date not null default current_date, category text not null default 'Other',
  method text not null default 'cash', description text, receipt_path text, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create table if not exists public.security_logs (
  id uuid primary key default gen_random_uuid(), shop_id uuid references public.shops(id), actor_id uuid references auth.users(id),
  event text not null, success boolean not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id), owner_id uuid not null references auth.users(id),
  title text not null default 'New conversation', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check(role in ('user','assistant')), content text not null, created_at timestamptz not null default now()
);

create or replace function public.current_shop_id() returns uuid language sql stable security definer set search_path=public,auth as $$
  select shop_id from public.profiles where id=auth.uid()
$$;
create or replace function public.prevent_profile_shop_transfer() returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  if new.shop_id is distinct from old.shop_id then raise exception 'Shop ownership cannot be reassigned'; end if;
  return new;
end $$;
drop trigger if exists protect_profile_shop_id on public.profiles;
create trigger protect_profile_shop_id before update on public.profiles for each row execute function public.prevent_profile_shop_transfer();
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,auth as $$
declare new_shop uuid;
begin
  insert into public.shops(owner_id,owner_name,name,country_code,currency,locale,timezone)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.raw_user_meta_data->>'shop_name','My Shop'),
    coalesce(new.raw_user_meta_data->>'country_code','IN'), coalesce(new.raw_user_meta_data->>'currency','INR'),
    coalesce(new.raw_user_meta_data->>'locale','en-IN'), coalesce(new.raw_user_meta_data->>'timezone','Asia/Kolkata')) returning id into new_shop;
  insert into public.profiles(id,shop_id,full_name) values(new.id,new_shop,coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.save_bill_draft(p_data jsonb) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare sid uuid:=public.current_shop_id(); bid uuid; cid uuid; line jsonb;
begin
  if sid is null then raise exception 'Shop profile not found'; end if;
  if nullif(p_data->>'customer_id','') is not null then
    select id into cid from public.customers where id=(p_data->>'customer_id')::uuid and shop_id=sid and archived_at is null;
    if cid is null then raise exception 'Customer not found in this shop'; end if;
  end if;
  if nullif(p_data->>'id','') is not null then
    select id into bid from public.bills where id=(p_data->>'id')::uuid and shop_id=sid and status='draft' for update;
    if bid is null then raise exception 'Draft not found'; end if;
    update public.bills set customer_id=cid, customer_name=nullif(p_data->>'customer_name',''), customer_phone_e164=nullif(p_data->>'customer_phone',''),
      customer_address=nullif(p_data->>'customer_address',''), bill_title=nullif(p_data->>'bill_title',''), bill_date=coalesce(nullif(p_data->>'bill_date','')::date,current_date),
      due_date=nullif(p_data->>'due_date','')::date, notes=nullif(p_data->>'notes',''), tax_rate=coalesce(nullif(p_data->>'tax_rate','')::numeric,0),bill_level_discount=coalesce(nullif(p_data->>'bill_discount','')::numeric,0),amount_paid=coalesce(nullif(p_data->>'amount_paid','')::numeric,0),
      updated_by=auth.uid(),updated_at=now(),last_autosaved_at=now(),timezone=coalesce(nullif(p_data->>'timezone',''),timezone)
      where id=bid;
    delete from public.bill_items where bill_id=bid and shop_id=sid;
  else
    insert into public.bills(shop_id,customer_id,customer_name,customer_phone_e164,customer_address,bill_title,bill_date,due_date,notes,tax_rate,bill_level_discount,amount_paid,created_by,updated_by,timezone)
    values(sid,cid,nullif(p_data->>'customer_name',''),nullif(p_data->>'customer_phone',''),nullif(p_data->>'customer_address',''),nullif(p_data->>'bill_title',''),
      coalesce(nullif(p_data->>'bill_date','')::date,current_date),nullif(p_data->>'due_date','')::date,nullif(p_data->>'notes',''),coalesce(nullif(p_data->>'tax_rate','')::numeric,0),
      coalesce(nullif(p_data->>'bill_discount','')::numeric,0),coalesce(nullif(p_data->>'amount_paid','')::numeric,0),auth.uid(),auth.uid(),coalesce(nullif(p_data->>'timezone',''),'Asia/Kolkata')) returning id into bid;
  end if;
  if jsonb_typeof(coalesce(p_data->'lines','[]'::jsonb))='array' then
    for line in select * from jsonb_array_elements(coalesce(p_data->'lines','[]'::jsonb)) loop
      if length(trim(coalesce(line->>'name','')))=0 or coalesce((line->>'quantity')::numeric,0)<=0 or coalesce((line->>'rate')::numeric,-1)<0 then raise exception 'Invalid bill item'; end if;
      if nullif(line->>'item_id','') is not null and not exists(select 1 from public.items where id=(line->>'item_id')::uuid and shop_id=sid) then raise exception 'Item does not belong to this shop'; end if;
      insert into public.bill_items(shop_id,bill_id,item_id,item_name,quantity,unit,mrp,rate,discount,line_total,show_price_discount)
      values(sid,bid,nullif(line->>'item_id','')::uuid,line->>'name',(line->>'quantity')::numeric,coalesce(line->>'unit','pcs'),coalesce(nullif(line->>'mrp','')::numeric,(line->>'rate')::numeric),
        (line->>'rate')::numeric,coalesce(nullif(line->>'discount','')::numeric,0),greatest(0,(line->>'quantity')::numeric*(line->>'rate')::numeric-coalesce(nullif(line->>'discount','')::numeric,0)),coalesce((line->>'show_price_discount')::boolean,false));
    end loop;
  end if;
  return bid;
end $$;

create or replace function public.finalize_bill(p_bill_id uuid,p_bill_discount numeric default 0,p_amount_paid numeric default 0) returns bigint language plpgsql security definer set search_path=public,auth as $$
declare sid uuid:=public.current_shop_id(); b public.bills%rowtype; n bigint; sub numeric(16,2); line_disc numeric(16,2); disc numeric(16,2); tax numeric(16,2); total numeric(16,2);
begin
  select * into b from public.bills where id=p_bill_id and shop_id=sid and status='draft' for update;
  if not found then raise exception 'Draft not found'; end if;
  select coalesce(sum(quantity*rate),0),coalesce(sum(least(discount,quantity*rate)),0) into sub,line_disc from public.bill_items where bill_id=p_bill_id and shop_id=sid;
  if not exists(select 1 from public.bill_items where bill_id=p_bill_id and shop_id=sid) then raise exception 'An empty bill cannot be finalized'; end if;
  disc:=least(sub,line_disc+greatest(0,coalesce(p_bill_discount,0)));
  tax:=round(greatest(0,sub-disc)*b.tax_rate/100,2); total:=round(greatest(0,sub-disc)+tax,2);
  if coalesce(p_amount_paid,0)<0 or coalesce(p_amount_paid,0)>total then raise exception 'Amount paid must be between zero and the final amount'; end if;
  insert into public.invoice_counters(shop_id,next_number) values(sid,2)
    on conflict(shop_id) do update set next_number=public.invoice_counters.next_number+1 returning next_number-1 into n;
  update public.bills set bill_number=n,status='finalized',subtotal=sub,discount_amount=disc,bill_level_discount=greatest(0,coalesce(p_bill_discount,0)),tax_amount=tax,final_amount=total,amount_paid=coalesce(p_amount_paid,0),
    finalized_at=now(),updated_at=now(),updated_by=auth.uid() where id=p_bill_id;
  update public.bill_items set line_total=round(greatest(0,quantity*rate-discount),2) where bill_id=p_bill_id;
  if p_amount_paid>0 then insert into public.payments(shop_id,bill_id,customer_id,amount,method,created_by) values(sid,p_bill_id,b.customer_id,p_amount_paid,'cash',auth.uid()); end if;
  return n;
end $$;

create or replace function public.revise_finalized_bill(p_bill_id uuid,p_data jsonb,p_token_hash text,p_reason text default null) returns integer language plpgsql security definer set search_path=public,auth as $$
declare sid uuid:=public.current_shop_id(); b public.bills%rowtype; rev integer; old_data jsonb; new_data jsonb; line jsonb; cid uuid; sub numeric(16,2); line_disc numeric(16,2); disc numeric(16,2); tax numeric(16,2); total numeric(16,2); field_list jsonb:='[]'::jsonb;
begin
  if not exists(select 1 from public.owner_verifications where token_hash=p_token_hash and owner_id=auth.uid() and shop_id=sid and purpose='bill_edit' and expires_at>now()) then raise exception 'Fresh owner verification required'; end if;
  select * into b from public.bills where id=p_bill_id and shop_id=sid and status='finalized' for update;
  if not found then raise exception 'Finalized bill not found'; end if;
  if nullif(p_data->>'customer_id','') is not null then select id into cid from public.customers where id=(p_data->>'customer_id')::uuid and shop_id=sid; if cid is null then raise exception 'Customer not found'; end if; end if;
  old_data:=jsonb_build_object('bill',to_jsonb(b),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) from public.bill_items i where i.bill_id=b.id));
  delete from public.bill_items where bill_id=b.id and shop_id=sid;
  for line in select * from jsonb_array_elements(coalesce(p_data->'lines','[]'::jsonb)) loop
    if length(trim(coalesce(line->>'name','')))=0 or coalesce((line->>'quantity')::numeric,0)<=0 or coalesce((line->>'rate')::numeric,-1)<0 then raise exception 'Invalid bill item'; end if;
    if nullif(line->>'item_id','') is not null and not exists(select 1 from public.items where id=(line->>'item_id')::uuid and shop_id=sid) then raise exception 'Item does not belong to this shop'; end if;
    insert into public.bill_items(shop_id,bill_id,item_id,item_name,quantity,unit,mrp,rate,discount,line_total,show_price_discount)
    values(sid,b.id,nullif(line->>'item_id','')::uuid,line->>'name',(line->>'quantity')::numeric,coalesce(line->>'unit','pcs'),coalesce(nullif(line->>'mrp','')::numeric,(line->>'rate')::numeric),
      (line->>'rate')::numeric,coalesce(nullif(line->>'discount','')::numeric,0),greatest(0,(line->>'quantity')::numeric*(line->>'rate')::numeric-coalesce(nullif(line->>'discount','')::numeric,0)),coalesce((line->>'show_price_discount')::boolean,false));
  end loop;
  select coalesce(sum(quantity*rate),0),coalesce(sum(least(discount,quantity*rate)),0) into sub,line_disc from public.bill_items where bill_id=b.id;
  if sub<=0 then raise exception 'A finalized bill cannot be empty'; end if;
  disc:=least(sub,line_disc+greatest(0,coalesce(nullif(p_data->>'bill_discount','')::numeric,0)));
  tax:=round(greatest(0,sub-disc)*coalesce(nullif(p_data->>'tax_rate','')::numeric,b.tax_rate)/100,2); total:=round(greatest(0,sub-disc)+tax,2);
  if total<b.amount_paid then raise exception 'New total cannot be lower than payments already recorded. Add a payment reversal or adjustment first.'; end if;
  update public.bills set customer_id=cid,customer_name=nullif(p_data->>'customer_name',''),customer_phone_e164=nullif(p_data->>'customer_phone',''),customer_address=nullif(p_data->>'customer_address',''),
    bill_title=nullif(p_data->>'bill_title',''),bill_date=coalesce(nullif(p_data->>'bill_date','')::date,bill_date),due_date=nullif(p_data->>'due_date','')::date,notes=nullif(p_data->>'notes',''),
    subtotal=sub,discount_amount=disc,bill_level_discount=greatest(0,coalesce(nullif(p_data->>'bill_discount','')::numeric,0)),tax_rate=coalesce(nullif(p_data->>'tax_rate','')::numeric,tax_rate),tax_amount=tax,final_amount=total,updated_at=now(),updated_by=auth.uid() where id=b.id;
  new_data:=jsonb_build_object('bill',(select to_jsonb(x) from public.bills x where x.id=b.id),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) from public.bill_items i where i.bill_id=b.id));
  select coalesce(jsonb_agg(changed.key),'[]'::jsonb) into field_list from (
    select coalesce(o.key,n.key) as key from jsonb_each(old_data->'bill') o full join jsonb_each(new_data->'bill') n using(key)
    where o.value is distinct from n.value and coalesce(o.key,n.key) not in ('updated_at','updated_by')
    union all select 'items' where old_data->'items' is distinct from new_data->'items'
  ) changed;
  select coalesce(max(revision_number),0)+1 into rev from public.bill_revision_history where bill_id=b.id;
  insert into public.bill_revision_history(shop_id,bill_id,revision_number,changed_by,previous_data,updated_data,changed_fields,change_reason,timezone)
  values(sid,b.id,rev,auth.uid(),old_data,new_data,field_list,nullif(p_reason,''),b.timezone);
  delete from public.owner_verifications where token_hash=p_token_hash;
  insert into public.security_logs(shop_id,actor_id,event,success,details) values(sid,auth.uid(),'bill_revision_saved',true,jsonb_build_object('bill_id',b.id,'revision',rev));
  return rev;
end $$;

create or replace function public.record_payment(p_bill_id uuid,p_amount numeric,p_method text,p_reference text default null,p_notes text default null) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare sid uuid:=public.current_shop_id(); b public.bills%rowtype; pid uuid;
begin
  if p_amount<=0 then raise exception 'Payment must be greater than zero'; end if;
  if p_method not in ('cash','upi','bank_transfer','card','other') then raise exception 'Invalid payment method'; end if;
  select * into b from public.bills where id=p_bill_id and shop_id=sid and status='finalized' for update;
  if not found then raise exception 'Bill not found'; end if;
  if b.amount_paid+p_amount>b.final_amount then raise exception 'Payment exceeds outstanding amount'; end if;
  insert into public.payments(shop_id,bill_id,customer_id,amount,method,reference,notes,created_by) values(sid,b.id,b.customer_id,p_amount,p_method,p_reference,p_notes,auth.uid()) returning id into pid;
  update public.bills set amount_paid=amount_paid+p_amount,updated_at=now(),updated_by=auth.uid() where id=b.id;
  return pid;
end $$;

create or replace function public.owner_bill_history(p_bill_number bigint,p_token_hash text) returns table(original_data jsonb,revision_number integer,previous_data jsonb,updated_data jsonb,changed_fields jsonb,change_reason text,changed_at timestamptz,timezone text)
language plpgsql security definer set search_path=public,auth as $$
declare sid uuid:=public.current_shop_id(); bid uuid;
begin
  if not exists(select 1 from public.owner_verifications where token_hash=p_token_hash and owner_id=auth.uid() and shop_id=sid and purpose='bill_history' and expires_at>now()) then raise exception 'Fresh owner verification required'; end if;
  select b.id into bid from public.bills b where b.shop_id=sid and b.bill_number=p_bill_number;
  if bid is null then return; end if;
  return query select coalesce((select h0.previous_data from public.bill_revision_history h0 where h0.bill_id=b.id order by h0.revision_number limit 1),
      jsonb_build_object('bill',to_jsonb(b),'items',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.bill_items i where i.bill_id=b.id))),
    h.revision_number,h.previous_data,h.updated_data,h.changed_fields,h.change_reason,h.changed_at,h.timezone
    from public.bills b left join public.bill_revision_history h on h.bill_id=b.id where b.id=bid order by h.revision_number;
end $$;

create or replace function public.business_summary(p_from date default null,p_to date default null) returns jsonb language sql stable security definer set search_path=public,auth as $$
  with sid as (select public.current_shop_id() as id),
  bill_stats as (
    select count(*) as bill_count,coalesce(sum(final_amount),0) as billed_value,
      coalesce(sum(amount_paid),0) as amount_recorded,coalesce(sum(discount_amount),0) as discounts,
      coalesce(sum(greatest(0,final_amount-amount_paid)),0) as outstanding
    from public.bills, sid where shop_id=sid.id and status='finalized'
      and (p_from is null or bill_date>=p_from) and (p_to is null or bill_date<=p_to)
  ),
  payment_stats as (
    select coalesce(sum(amount),0) as payments_received from public.payments,sid
    where shop_id=sid.id and reversed_at is null
      and (p_from is null or paid_at >= p_from::timestamptz)
      and (p_to is null or paid_at < (p_to+1)::timestamptz)
  ),
  expense_stats as (
    select coalesce(sum(amount),0) as expenses from public.expenses,sid
    where shop_id=sid.id and archived_at is null
      and (p_from is null or expense_date>=p_from) and (p_to is null or expense_date<=p_to)
  ),
  counts as (
    select (select count(*) from public.items,sid where shop_id=sid.id and archived_at is null) as products,
      (select count(*) from public.customers,sid where shop_id=sid.id and archived_at is null) as customers
  )
  select jsonb_build_object('bill_count',bill_count,'billed_value',billed_value,'amount_recorded',amount_recorded,
    'payments_received',payments_received,'outstanding',outstanding,'discounts',discounts,'expenses',expenses,'products',products,'customers',customers)
  from bill_stats,payment_stats,expense_stats,counts
$$;

-- RLS: every ordinary data row is scoped to the signed-in user's shop.
alter table public.shops enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.items enable row level security;
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.bill_revision_history enable row level security;
alter table public.emergency_credentials enable row level security;
alter table public.owner_verifications enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.security_logs enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

do $$ begin
  create policy shop_owner_read on public.shops for select to authenticated using(owner_id=auth.uid());
  create policy shop_owner_update on public.shops for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
  create policy profile_self_read on public.profiles for select to authenticated using(id=auth.uid());
  create policy profile_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
  create policy customers_shop on public.customers for all to authenticated using(shop_id=public.current_shop_id()) with check(shop_id=public.current_shop_id());
  create policy items_shop on public.items for all to authenticated using(shop_id=public.current_shop_id()) with check(shop_id=public.current_shop_id());
  create policy bills_shop_read on public.bills for select to authenticated using(shop_id=public.current_shop_id());
  create policy bill_items_shop_read on public.bill_items for select to authenticated using(shop_id=public.current_shop_id());
  create policy payments_shop_read on public.payments for select to authenticated using(shop_id=public.current_shop_id());
  create policy expenses_shop on public.expenses for all to authenticated using(shop_id=public.current_shop_id()) with check(shop_id=public.current_shop_id());
  create policy ai_conversations_shop on public.ai_conversations for all to authenticated using(owner_id=auth.uid() and shop_id=public.current_shop_id()) with check(owner_id=auth.uid() and shop_id=public.current_shop_id());
  create policy ai_messages_owner on public.ai_messages for all to authenticated using(exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.owner_id=auth.uid() and c.shop_id=public.current_shop_id())) with check(exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.owner_id=auth.uid() and c.shop_id=public.current_shop_id()));
exception when duplicate_object then null; end $$;

-- Private audit/recovery tables intentionally have no client-facing policies or grants.
revoke all on public.bill_revision_history,public.emergency_credentials,public.owner_verifications,public.security_logs,public.invoice_counters from anon,authenticated;
revoke insert,update,delete on public.bills,public.bill_items,public.payments from anon,authenticated;
grant select on public.bills,public.bill_items,public.payments to authenticated;
grant select,insert,update,delete on public.items,public.customers,public.expenses,public.ai_conversations,public.ai_messages to authenticated;
revoke all on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;
grant update(full_name,language) on public.profiles to authenticated;
grant select,update on public.shops to authenticated;
revoke all on function public.save_bill_draft(jsonb) from public,anon;
revoke all on function public.finalize_bill(uuid,numeric,numeric) from public,anon;
revoke all on function public.revise_finalized_bill(uuid,jsonb,text,text) from public,anon;
revoke all on function public.record_payment(uuid,numeric,text,text,text) from public,anon;
revoke all on function public.owner_bill_history(bigint,text) from public,anon;
revoke all on function public.business_summary(date,date) from public,anon;
grant execute on function public.save_bill_draft(jsonb),public.finalize_bill(uuid,numeric,numeric),public.revise_finalized_bill(uuid,jsonb,text,text),public.record_payment(uuid,numeric,text,text,text),public.owner_bill_history(bigint,text) to authenticated;
grant execute on function public.current_shop_id(),public.business_summary(date,date) to authenticated;
