-- Suspensão de conta de verdade.
-- Antes, "Suspender comprador/loja 7 dias" (Denúncias) só bloqueava o envio de
-- mensagens no chat: a pessoa continuava comprando, favoritando etc., e o
-- painel seguia mostrando a conta como ativa.
-- Agora, durante a suspensão (tabela moderation_suspensions):
--   * a pessoa pode entrar e NAVEGAR, mas não faz nenhuma movimentação:
--     carrinho, comprar agora, pagamento, favoritos, novas mensagens e
--     conversas, avaliações, pedidos de orçamento, peças, opções sob encomenda
--     e dados da loja;
--   * a loja suspensa sai da vitrine (is_public_artisan);
--   * a loja ainda pode atualizar o andamento de pedidos JÁ pagos, para não
--     prejudicar quem comprou; o suporte (chamados) e as denúncias seguem abertos.
-- O bloqueio vale para quem FAZ a ação (auth.uid()); rotinas do servidor
-- (webhooks, tarefas agendadas) não são afetadas. A mensagem de erro começa com
-- "Sua conta está suspensa" (o site reconhece por esse texto).
begin;

-- 0) Aviso do tipo "conta" (suspensão aplicada / encerrada) ---------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('mensagem', 'pedido', 'venda', 'encomenda', 'produto', 'avaliacao', 'conta'));

-- 1) Conferência usada pelos gatilhos ------------------------------------------
create or replace function public.account_suspension_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz;
begin
  if auth.uid() is null or coalesce(public.is_active_admin(), false) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_until := public.moderation_suspended_until(auth.uid());
  if v_until is not null then
    raise exception 'Sua conta está suspensa até %. Enquanto isso, você pode navegar pela Artenós, mas não pode comprar, favoritar, enviar mensagens ou alterar a loja.',
      to_char(v_until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare
  v_table text;
  -- Criar e alterar: barrado. Apagar fica livre (limpezas automáticas ao abrir
  -- o carrinho não podem quebrar a navegação; no site os botões já são barrados).
  v_tables text[] := array[
    'cart_items', 'cart_shipping_selections', 'buy_now_intents', 'checkout_items',
    'storefront_favorites', 'product_reviews', 'store_reviews',
    'custom_order_requests', 'custom_order_services', 'products', 'artisan_store_settings',
    'artisan_pricing_calculations', 'payout_accounts'];
  -- Só a criação: abrir conversas e marcar mensagens como lidas seguem livres;
  -- a loja continua podendo dar andamento aos pedidos já pagos.
  v_insert_only text[] := array['conversations', 'messages', 'checkouts', 'orders'];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists account_suspension_guard on public.%I', v_table);
      execute format('create trigger account_suspension_guard before insert or update on public.%I
        for each row execute function public.account_suspension_guard()', v_table);
    end if;
  end loop;
  foreach v_table in array v_insert_only loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists account_suspension_guard on public.%I', v_table);
      execute format('create trigger account_suspension_guard before insert on public.%I
        for each row execute function public.account_suspension_guard()', v_table);
    end if;
  end loop;
end $$;

-- 2) Loja suspensa sai da vitrine ----------------------------------------------
create or replace function public.is_public_artisan(candidate_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = candidate_id
      and profile.account_type = 'artisan'
      and profile.approval_status = 'active'
  ) and public.moderation_suspended_until(candidate_id) is null;
$$;
revoke all on function public.is_public_artisan(uuid) from public;
grant execute on function public.is_public_artisan(uuid) to anon, authenticated;

-- 3) A própria pessoa vê se está suspensa (aviso no site) -------------------------
create or replace function public.get_my_suspension()
returns table (suspended_until timestamptz, reason text)
language sql stable security definer set search_path = '' as $$
  select s.suspended_until, s.reason from public.moderation_suspensions s
  where s.user_id = auth.uid() and s.suspended_until > now();
$$;
revoke all on function public.get_my_suspension() from public, anon;
grant execute on function public.get_my_suspension() to authenticated;

-- 4) Painel: suspensões ativas e retirada ---------------------------------------
create or replace function public.admin_list_suspensions()
returns table (user_id uuid, suspended_until timestamptz, reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_active_admin(), false) then raise exception 'Acesso administrativo não autorizado'; end if;
  return query select s.user_id, s.suspended_until, s.reason from public.moderation_suspensions s
    where s.suspended_until > now();
end $$;
revoke all on function public.admin_list_suspensions() from public, anon;
grant execute on function public.admin_list_suspensions() to authenticated;

create or replace function public.admin_lift_suspension(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.is_active_admin(), false) then raise exception 'Acesso administrativo não autorizado'; end if;
  delete from public.moderation_suspensions where user_id = p_user_id;
  if not found then raise exception 'Esta conta não está suspensa'; end if;
  insert into public.notifications(user_id, kind, title, body, link)
  values (p_user_id, 'conta', 'Suspensão encerrada', 'Sua conta voltou a funcionar normalmente.', '/');
end $$;
revoke all on function public.admin_lift_suspension(uuid) from public, anon;
grant execute on function public.admin_lift_suspension(uuid) to authenticated;

-- 5) Decisão da denúncia: suspende a CONTA e avisa a pessoa ----------------------
create or replace function public.admin_resolve_conversation_report(
  p_report_id uuid, p_status text, p_note text default null, p_suspend_user uuid default null, p_suspend_days integer default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz;
begin
  if not coalesce(public.is_active_admin(), false) then raise exception 'Acesso administrativo não autorizado'; end if;
  if p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'Status inválido'; end if;
  if p_suspend_user is not null and not exists (
    select 1 from public.conversation_reports r join public.conversations c on c.id = r.conversation_id
    where r.id = p_report_id and p_suspend_user in (c.client_id, c.artisan_id)) then
    raise exception 'Só é possível suspender quem participa da conversa denunciada';
  end if;
  if p_suspend_user is not null and public.moderation_suspended_until(p_suspend_user) is not null then
    raise exception 'Esta conta já está suspensa';
  end if;
  update public.conversation_reports set status = p_status, admin_note = coalesce(nullif(btrim(p_note), ''), admin_note),
    resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
    where id = p_report_id;
  if not found then raise exception 'Denúncia não encontrada'; end if;
  if p_suspend_user is not null and coalesce(p_suspend_days, 0) > 0 then
    v_until := now() + make_interval(days => least(p_suspend_days, 365));
    insert into public.moderation_suspensions(user_id, suspended_until, reason)
      values (p_suspend_user, v_until, 'Decisão da administração sobre denúncia')
      on conflict (user_id) do update set suspended_until = excluded.suspended_until,
        reason = excluded.reason, updated_at = now();
    begin
      insert into public.notifications(user_id, kind, title, body, link)
      values (p_suspend_user, 'conta', 'Conta suspensa',
        'Após análise de uma denúncia, sua conta foi suspensa até '
          || to_char(v_until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '. Você pode navegar, mas não pode fazer compras nem enviar mensagens.',
        '/ajuda');
    exception when others then null; -- aviso é extra
    end;
  end if;
end $$;
revoke all on function public.admin_resolve_conversation_report(uuid, text, text, uuid, integer) from public, anon;
grant execute on function public.admin_resolve_conversation_report(uuid, text, text, uuid, integer) to authenticated;

commit;
