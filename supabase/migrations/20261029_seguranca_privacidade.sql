-- Artenós: práticas prometidas na Política de Privacidade.
-- Execute UMA vez depois de 20261029_central_ajuda.sql (usa rate_limit_hit)
-- e das demais migrações de 20261029. Pode ser repetido.
--
--   * limite de envios no servidor: chat, avaliações, denúncias e pedidos de orçamento;
--   * registro de acessos (Marco Civil, art. 15: mínimo de 6 meses; aqui, 12 meses);
--   * anonimização da conta a pedido da pessoa, mantendo o que a lei exige guardar;
--   * limpeza periódica de registros vencidos (chamada pela rota /api/cron/manutencao).

begin;

-- 1) Limite de envios ---------------------------------------------------------
create or replace function public.enforce_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  -- tg_argv: coluna com o autor, limite e janela em segundos.
  v_key text := to_jsonb(new) ->> tg_argv[0];
  v_limit integer := tg_argv[1]::integer;
  v_window integer := tg_argv[2]::integer;
begin
  if v_key is null then return new; end if;
  if not public.rate_limit_hit(tg_table_name, v_key, v_limit, v_window) then
    raise exception 'LIMITE: Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.enforce_rate_limit() from public, anon, authenticated;

drop trigger if exists rate_limit_messages on public.messages;
create trigger rate_limit_messages before insert on public.messages
  for each row execute function public.enforce_rate_limit('sender_id', '20', '60');
drop trigger if exists rate_limit_product_reviews on public.product_reviews;
create trigger rate_limit_product_reviews before insert or update of rating, comment on public.product_reviews
  for each row execute function public.enforce_rate_limit('client_id', '20', '3600');
drop trigger if exists rate_limit_store_reviews on public.store_reviews;
create trigger rate_limit_store_reviews before insert or update of rating, comment on public.store_reviews
  for each row execute function public.enforce_rate_limit('client_id', '20', '3600');
drop trigger if exists rate_limit_conversation_reports on public.conversation_reports;
create trigger rate_limit_conversation_reports before insert on public.conversation_reports
  for each row execute function public.enforce_rate_limit('reporter_id', '10', '3600');
do $$
begin
  if to_regclass('public.custom_order_requests') is not null then
    execute 'drop trigger if exists rate_limit_custom_order_requests on public.custom_order_requests';
    execute 'create trigger rate_limit_custom_order_requests before insert on public.custom_order_requests
      for each row execute function public.enforce_rate_limit(''client_id'', ''10'', ''3600'')';
  end if;
end $$;

-- 2) Registro de acessos ------------------------------------------------------
create table if not exists public.access_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  event text not null check (event in ('login', 'logout', 'password_reset', 'data_export', 'account_deletion')),
  ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);
create index if not exists access_logs_user_idx on public.access_logs (user_id, created_at desc);
create index if not exists access_logs_created_idx on public.access_logs (created_at);
alter table public.access_logs enable row level security;
revoke all on public.access_logs from public, anon, authenticated;
grant select, insert on public.access_logs to service_role;

-- 3) Exclusão da conta (anonimização) -----------------------------------------
-- Motivos que impedem excluir agora (pedido em andamento, repasse pendente).
create or replace function public.account_deletion_blockers(p_user_id uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare v_reasons text[] := '{}';
begin
  if exists (select 1 from public.orders o where (o.client_id = p_user_id or o.artisan_id = p_user_id)
             and o.status not in ('delivered', 'cancelled', 'refunded')) then
    v_reasons := array_append(v_reasons, 'Há pedidos em andamento. Aguarde a entrega ou o cancelamento.');
  end if;
  if exists (select 1 from public.checkouts c where c.client_id = p_user_id and c.status in ('pending', 'awaiting_payment')) then
    v_reasons := array_append(v_reasons, 'Há um pagamento em aberto. Conclua ou cancele a compra.');
  end if;
  if exists (select 1 from public.payouts p where p.artisan_id = p_user_id and p.status in ('pending', 'processing', 'failed')) then
    v_reasons := array_append(v_reasons, 'Há repasses pendentes para a sua loja.');
  end if;
  return v_reasons;
end $$;
revoke all on function public.account_deletion_blockers(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;

-- A história da loja deixa de ser validada durante a anonimização.
create or replace function public.validate_store_story()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('artenos.anonymizing', true) = 'on' then return new; end if;
  if new.account_type = 'artisan'
     and new.story is distinct from old.story
     and not public.is_meaningful_text(new.story) then
    raise exception 'A história da loja precisa de frases reais, com pelo menos 40 caracteres e 6 palavras.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Apaga ou anonimiza o que é pessoal e não precisa ser guardado. Pedidos,
-- pagamentos, repasses e mensagens dos pedidos ficam (obrigações fiscais e de
-- defesa do consumidor), mas deixam de apontar para um nome, documento ou contato.
create or replace function public.anonymize_account(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_blockers text[]; v_tag text := replace(p_user_id::text, '-', '');
begin
  v_blockers := public.account_deletion_blockers(p_user_id);
  if cardinality(v_blockers) > 0 then raise exception 'EXCLUSAO: %', array_to_string(v_blockers, ' '); end if;
  perform set_config('artenos.anonymizing', 'on', true);

  update public.profiles set
    full_name = 'Conta excluída',
    email = 'excluida-' || v_tag || '@conta-excluida.invalid',
    document = 'excluido-' || v_tag,
    phone = '', cep = '', address = '', address_number = '', city = '', state = '',
    store_name = case when account_type = 'artisan' then 'Loja encerrada' end,
    specialty = null, story = null, avatar_path = null, updated_at = now()
  where id = p_user_id;

  delete from public.cart_items where client_id = p_user_id;
  delete from public.cart_shipping_selections where client_id = p_user_id;
  delete from public.buy_now_intents where client_id = p_user_id;
  delete from public.storefront_favorites where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.payout_accounts where artisan_id = p_user_id;
  delete from public.moderation_attempts where user_id = p_user_id;

  update public.products set active = false, updated_at = now() where artisan_id = p_user_id;
  update public.artisan_store_settings set announcement = null, cover_path = null, vacation_mode = true, updated_at = now()
    where artisan_id = p_user_id;
  update public.support_tickets set name = 'Conta excluída', email = 'excluida-' || v_tag || '@conta-excluida.invalid'
    where user_id = p_user_id;
  insert into public.access_logs(user_id, event) values (p_user_id, 'account_deletion');
end $$;
revoke all on function public.anonymize_account(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_account(uuid) to service_role;

-- 4) Limpeza periódica --------------------------------------------------------
create or replace function public.purge_expired_records()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_logs integer; v_attempts integer; v_limits integer;
begin
  delete from public.access_logs where created_at < now() - interval '12 months';
  get diagnostics v_logs = row_count;
  delete from public.moderation_attempts where created_at < now() - interval '6 months';
  get diagnostics v_attempts = row_count;
  delete from public.rate_limit_events where created_at < now() - interval '2 days';
  get diagnostics v_limits = row_count;
  return jsonb_build_object('access_logs', v_logs, 'moderation_attempts', v_attempts, 'rate_limit_events', v_limits);
end $$;
revoke all on function public.purge_expired_records() from public, anon, authenticated;
grant execute on function public.purge_expired_records() to service_role;

commit;
