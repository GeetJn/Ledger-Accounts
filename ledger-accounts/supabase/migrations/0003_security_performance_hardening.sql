-- Restrict trigger-only helpers and remove anonymous access to the shop lookup.
revoke all on function public.apply_bill_finalization_stock() from public, anon, authenticated;
revoke all on function public.apply_bill_item_stock_change() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.prevent_profile_shop_transfer() from public, anon, authenticated;
revoke all on function public.snapshot_bill_item_cost() from public, anon, authenticated;
revoke all on function public.current_shop_id() from anon;
grant execute on function public.current_shop_id() to authenticated;

-- Cover foreign keys used for joins and parent-row updates/deletes.
create index if not exists ai_conversations_owner_id_idx on public.ai_conversations(owner_id);
create index if not exists ai_conversations_shop_id_idx on public.ai_conversations(shop_id);
create index if not exists ai_messages_conversation_id_idx on public.ai_messages(conversation_id);
create index if not exists bill_items_shop_item_idx on public.bill_items(shop_id,item_id);
create index if not exists bill_revision_changed_by_idx on public.bill_revision_history(changed_by);
create index if not exists bills_shop_customer_idx on public.bills(shop_id,customer_id);
create index if not exists bills_created_by_idx on public.bills(created_by);
create index if not exists bills_updated_by_idx on public.bills(updated_by);
create index if not exists expenses_created_by_idx on public.expenses(created_by);
create index if not exists expenses_shop_id_idx on public.expenses(shop_id);
create index if not exists owner_verifications_owner_id_idx on public.owner_verifications(owner_id);
create index if not exists owner_verifications_shop_id_idx on public.owner_verifications(shop_id);
create index if not exists payments_created_by_idx on public.payments(created_by);
create index if not exists payments_shop_bill_idx on public.payments(shop_id,bill_id);
create index if not exists payments_shop_customer_idx on public.payments(shop_id,customer_id);
create index if not exists security_logs_actor_id_idx on public.security_logs(actor_id);
create index if not exists security_logs_shop_id_idx on public.security_logs(shop_id);
create index if not exists stock_movements_actor_id_idx on public.stock_movements(actor_id);
create index if not exists stock_movements_shop_bill_idx on public.stock_movements(shop_id,bill_id);

-- Evaluate auth helpers once per statement rather than once per row.
drop policy if exists shop_owner_read on public.shops;
create policy shop_owner_read on public.shops for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists shop_owner_update on public.shops;
create policy shop_owner_update on public.shops for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
drop policy if exists profile_self_read on public.profiles;
create policy profile_self_read on public.profiles for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists profile_self_update on public.profiles;
create policy profile_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
drop policy if exists ai_conversations_shop on public.ai_conversations;
create policy ai_conversations_shop on public.ai_conversations for all to authenticated
  using (owner_id = (select auth.uid()) and shop_id = (select public.current_shop_id()))
  with check (owner_id = (select auth.uid()) and shop_id = (select public.current_shop_id()));
drop policy if exists ai_messages_owner on public.ai_messages;
create policy ai_messages_owner on public.ai_messages for all to authenticated
  using (exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id
      and c.owner_id = (select auth.uid())
      and c.shop_id = (select public.current_shop_id())
  ))
  with check (exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id
      and c.owner_id = (select auth.uid())
      and c.shop_id = (select public.current_shop_id())
  ));
