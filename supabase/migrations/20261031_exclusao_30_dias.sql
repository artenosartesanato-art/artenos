-- Exclusão de conta em duas etapas (LGPD, art. 18, VI):
-- 1) a pessoa pede: a conta é desativada na hora e fica guardada por 30 dias;
-- 2) um job diário exclui de vez (anonymize_account) as que venceram.
-- Nos 30 dias só a equipe reativa (pedido por e-mail ao suporte).
begin;

-- 1) Situação da conta ---------------------------------------------------------
alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_at timestamptz;

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('active', 'pending_deletion', 'deleted'));

create index if not exists profiles_pending_deletion_idx
  on public.profiles (deletion_scheduled_at) where account_status = 'pending_deletion';

-- Novos eventos no registro de acessos (auditoria).
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.access_logs'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%event%';
  if v_name is not null then execute format('alter table public.access_logs drop constraint %I', v_name); end if;
end $$;
alter table public.access_logs add constraint access_logs_event_check check (event in (
  'login', 'logout', 'password_reset', 'data_export', 'account_deletion',
  'deletion_requested', 'account_reactivated', 'account_deleted'));

-- Correção: 20261029_validacao_textos_loja.sql recriou esta validação sem a
-- exceção da anonimização (de 20261029_seguranca_privacidade.sql), e excluir
-- uma loja falhava em "A história da loja precisa de frases reais".
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

-- 2) Pedido de exclusão --------------------------------------------------------
-- Chamado pela rota /api/conta/excluir (service_role) depois de conferir a sessão.
-- Não apaga nada: desativa, tira as peças da vitrine e agenda para daqui a 30 dias.
create or replace function public.request_account_deletion(p_user_id uuid, p_ip inet default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_blockers text[]; v_scheduled timestamptz;
begin
  v_blockers := public.account_deletion_blockers(p_user_id);
  if cardinality(v_blockers) > 0 then raise exception 'EXCLUSAO: %', array_to_string(v_blockers, ' '); end if;

  update public.profiles set
    account_status = 'pending_deletion',
    deletion_requested_at = now(),
    deletion_scheduled_at = now() + interval '30 days',
    updated_at = now()
  where id = p_user_id and account_status = 'active'
  returning deletion_scheduled_at into v_scheduled;
  if v_scheduled is null then
    -- Já estava em exclusão: devolve a data marcada (pedido repetido não muda o prazo).
    select deletion_scheduled_at into v_scheduled from public.profiles
     where id = p_user_id and account_status = 'pending_deletion';
    if v_scheduled is null then raise exception 'EXCLUSAO: Conta não encontrada.'; end if;
    return v_scheduled;
  end if;

  -- Loja: sai da vitrine e para de vender na hora.
  update public.products set active = false, updated_at = now() where artisan_id = p_user_id and active;
  update public.artisan_store_settings set vacation_mode = true, updated_at = now() where artisan_id = p_user_id;
  -- Carrinho e compras rápidas não fazem mais sentido.
  delete from public.cart_items where client_id = p_user_id;
  delete from public.buy_now_intents where client_id = p_user_id;

  insert into public.access_logs(user_id, event, ip) values (p_user_id, 'deletion_requested', p_ip);
  return v_scheduled;
end $$;
revoke all on function public.request_account_deletion(uuid, inet) from public, anon, authenticated;
grant execute on function public.request_account_deletion(uuid, inet) to service_role;

-- Conversas com conta em exclusão não recebem mensagens novas (nos dois sentidos).
create or replace function public.block_messages_pending_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.conversations c
    join public.profiles p on p.id in (c.client_id, c.artisan_id)
    where c.id = new.conversation_id and p.account_status <> 'active'
  ) then
    raise exception 'Esta conversa foi encerrada: a conta foi desativada.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists block_messages_pending_deletion on public.messages;
create trigger block_messages_pending_deletion before insert on public.messages
  for each row execute function public.block_messages_pending_deletion();

-- 3) Exclusão definitiva (job diário) ------------------------------------------
-- Idempotente: só pega quem ainda está em pending_deletion e já venceu.
-- Devolve as contas processadas (e a foto de perfil, que a rota apaga do
-- Storage) e as que falharam, sem interromper as demais.
create or replace function public.finalize_due_deletions(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_done jsonb := '[]'::jsonb; v_failed jsonb := '[]'::jsonb;
begin
  for r in
    select id, avatar_path from public.profiles
     where account_status = 'pending_deletion' and deletion_scheduled_at <= p_now
     order by deletion_scheduled_at
     for update skip locked
  loop
    begin
      perform public.anonymize_account(r.id);
      update public.profiles set account_status = 'deleted', updated_at = now() where id = r.id;
      insert into public.access_logs(user_id, event) values (r.id, 'account_deleted');
      v_done := v_done || jsonb_build_object('id', r.id, 'avatar_path', r.avatar_path);
    exception when others then
      v_failed := v_failed || jsonb_build_object('id', r.id, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('processed', jsonb_array_length(v_done), 'accounts', v_done, 'failed', v_failed);
end $$;
revoke all on function public.finalize_due_deletions(timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_due_deletions(timestamptz) to service_role;

-- 4) Equipe: lista e reativação -------------------------------------------------
create or replace function public.admin_list_pending_deletions()
returns table (user_id uuid, full_name text, email text, account_type text, store_name text,
  deletion_requested_at timestamptz, deletion_scheduled_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_admin() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return query
    select p.id, p.full_name, p.email, p.account_type::text, p.store_name, p.deletion_requested_at, p.deletion_scheduled_at
      from public.profiles p
     where p.account_status = 'pending_deletion'
     order by p.deletion_scheduled_at;
end $$;
revoke all on function public.admin_list_pending_deletions() from public, anon;
grant execute on function public.admin_list_pending_deletions() to authenticated;

-- Reativa dentro dos 30 dias. As peças continuam fora da vitrine (a loja revisa
-- e publica de novo); a loja sai do modo férias. O acesso ao login é liberado
-- pela rota /api/admin/reativar-conta (Auth Admin), que chama esta função.
create or replace function public.admin_reactivate_account(p_user_id uuid)
returns table (email text, full_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_admin() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  update public.profiles p set account_status = 'active', deletion_requested_at = null,
    deletion_scheduled_at = null, updated_at = now()
   where p.id = p_user_id and p.account_status = 'pending_deletion';
  if not found then raise exception 'Esta conta não está em processo de exclusão.'; end if;
  update public.artisan_store_settings set vacation_mode = false, updated_at = now() where artisan_id = p_user_id;
  insert into public.access_logs(user_id, event) values (p_user_id, 'account_reactivated');
  return query select p.email, p.full_name from public.profiles p where p.id = p_user_id;
end $$;
revoke all on function public.admin_reactivate_account(uuid) from public, anon;
grant execute on function public.admin_reactivate_account(uuid) to authenticated;

-- Situação para a tela de login: chamada só pelo servidor, DEPOIS de conferir
-- e-mail e senha (rota /api/acesso/situacao), para não revelar contas a terceiros.
create or replace function public.account_status_by_email(p_email text)
returns table (account_status text, deletion_scheduled_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.account_status, p.deletion_scheduled_at from public.profiles p
   where lower(p.email) = lower(trim(p_email)) limit 1;
$$;
revoke all on function public.account_status_by_email(text) from public, anon, authenticated;
grant execute on function public.account_status_by_email(text) to service_role;

commit;
