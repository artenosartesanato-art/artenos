-- Artenós: bloqueio de termos ofensivos no chat (e em textos públicos),
-- registro de tentativas, suspensão temporária e denúncia de conversas.
-- Execute UMA vez no SQL Editor depois de mensagens.sql e
-- conversas_produtos_topicos.sql; em seguida execute supabase/moderacao_termos.sql
-- (lista de termos gerada de config/termos-bloqueados.json). Pode ser repetido.
--
-- Regra (igual a lib/moderation.ts): ignora maiúsculas, acentos, leetspeak
-- (p0rr4), letras repetidas (puuuta) e letras separadas (p.u.t.a); compara
-- PALAVRAS inteiras (ou plural), para não bloquear "computador".
-- Suspensão: 5 tentativas bloqueadas em 10 minutos → 30 minutos sem enviar.

begin;

create table if not exists public.moderation_blocked_terms (
  term text primary key check (char_length(btrim(term)) between 2 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  context text not null,
  term text not null,
  created_at timestamptz not null default now()
);
create index if not exists moderation_attempts_user_idx on public.moderation_attempts (user_id, created_at desc);

create table if not exists public.moderation_suspensions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  suspended_until timestamptz not null,
  reason text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('ofensa', 'golpe', 'spam', 'assedio', 'outro')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (conversation_id, reporter_id, status)
);

-- Nada disso é lido direto pelo navegador: só pelas funções abaixo.
alter table public.moderation_blocked_terms enable row level security;
alter table public.moderation_attempts enable row level security;
alter table public.moderation_suspensions enable row level security;
alter table public.conversation_reports enable row level security;
revoke all on public.moderation_blocked_terms, public.moderation_attempts,
  public.moderation_suspensions, public.conversation_reports from public, anon, authenticated;

-- Palavras normalizadas (mesma ordem de passos de lib/moderation.ts).
create or replace function public.moderation_tokens(p_text text)
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  v_plain text;
  v_token text;
  v_run text[] := '{}';
  v_out text[] := '{}';
begin
  v_plain := lower(translate(coalesce(p_text, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'));
  v_plain := translate(v_plain, '0134578@$', 'oieastbas');
  foreach v_token in array regexp_split_to_array(v_plain, '[^a-z]+') loop
    continue when v_token = '';
    if length(v_token) = 1 then
      v_run := v_run || v_token;
    else
      if cardinality(v_run) >= 3 then v_out := v_out || array_to_string(v_run, '');
      else v_out := v_out || v_run; end if;
      v_run := '{}';
      v_out := v_out || v_token;
    end if;
  end loop;
  if cardinality(v_run) >= 3 then v_out := v_out || array_to_string(v_run, '');
  else v_out := v_out || v_run; end if;
  return array(select regexp_replace(t, '(.)\1+', '\1', 'g') from unnest(v_out) with ordinality as u(t, n) order by n);
end $$;

-- Primeiro termo bloqueado encontrado, ou null.
create or replace function public.moderation_find_term(p_text text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_words text[] := public.moderation_tokens(p_text);
  v_term record;
  v_parts text[];
  v_len integer;
  v_ok boolean;
  i integer;
  j integer;
begin
  if cardinality(v_words) = 0 then return null; end if;
  for v_term in select term from public.moderation_blocked_terms order by term loop
    v_parts := public.moderation_tokens(v_term.term);
    v_len := cardinality(v_parts);
    continue when v_len = 0;
    for i in 1 .. cardinality(v_words) - v_len + 1 loop
      v_ok := true;
      for j in 1 .. v_len loop
        if v_words[i + j - 1] not in (v_parts[j], v_parts[j] || 's', v_parts[j] || 'es') then
          v_ok := false; exit;
        end if;
      end loop;
      if v_ok then return v_term.term; end if;
    end loop;
  end loop;
  return null;
end $$;
revoke all on function public.moderation_find_term(text) from public, anon, authenticated;

-- Use em triggers de outros textos (avaliações, descrição da loja/peça).
create or replace function public.moderation_assert_clean(p_text text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if public.moderation_find_term(p_text) is not null then
    raise exception 'MODERACAO: Seu texto contém termos que não são permitidos na Artenós.'
      using errcode = 'check_violation';
  end if;
end $$;
revoke all on function public.moderation_assert_clean(text) from public, anon, authenticated;

create or replace function public.moderation_suspended_until(p_user_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select suspended_until from public.moderation_suspensions
  where user_id = p_user_id and suspended_until > now();
$$;
revoke all on function public.moderation_suspended_until(uuid) from public, anon, authenticated;

-- Envio de mensagem pelo app: registra tentativas bloqueadas sem lançar erro
-- (um erro desfaria o registro) e suspende após 5 em 10 minutos.
create or replace function public.send_chat_message(
  p_conversation_id uuid, p_body text, p_topic text default 'geral', p_reply_to_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_until timestamptz;
  v_term text;
  v_recent integer;
  v_message public.messages;
begin
  if v_uid is null then raise exception 'Faça login para enviar mensagens'; end if;
  if not exists (select 1 from public.conversations c
                 where c.id = p_conversation_id and v_uid in (c.client_id, c.artisan_id)) then
    raise exception 'Conversa não encontrada';
  end if;
  v_until := public.moderation_suspended_until(v_uid);
  if v_until is not null then
    return jsonb_build_object('status', 'suspended', 'until', v_until);
  end if;
  v_term := public.moderation_find_term(p_body);
  if v_term is not null then
    insert into public.moderation_attempts(user_id, context, term) values (v_uid, 'chat', v_term);
    select count(*) into v_recent from public.moderation_attempts
      where user_id = v_uid and created_at > now() - interval '10 minutes';
    if v_recent >= 5 then
      insert into public.moderation_suspensions(user_id, suspended_until, reason)
        values (v_uid, now() + interval '30 minutes', 'Termos ofensivos repetidos no chat')
        on conflict (user_id) do update set suspended_until = excluded.suspended_until,
          reason = excluded.reason, updated_at = now();
      return jsonb_build_object('status', 'suspended', 'until', now() + interval '30 minutes');
    end if;
    return jsonb_build_object('status', 'blocked', 'attempts_left', 5 - v_recent);
  end if;
  insert into public.messages(conversation_id, sender_id, body, topic, reply_to_id)
    values (p_conversation_id, v_uid, btrim(p_body), coalesce(p_topic, 'geral'), p_reply_to_id)
    returning * into v_message;
  return jsonb_build_object('status', 'sent', 'message', jsonb_build_object(
    'id', v_message.id, 'sender_id', v_message.sender_id, 'body', v_message.body,
    'topic', v_message.topic, 'reply_to_id', v_message.reply_to_id, 'created_at', v_message.created_at));
end $$;
revoke all on function public.send_chat_message(uuid, text, text, uuid) from public, anon;
grant execute on function public.send_chat_message(uuid, text, text, uuid) to authenticated;

-- Barreira final: nenhuma mensagem com termo bloqueado entra, nem por insert direto.
create or replace function public.moderate_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.moderation_suspended_until(new.sender_id) is not null then
    raise exception 'MODERACAO: Envio de mensagens suspenso temporariamente.' using errcode = 'check_violation';
  end if;
  perform public.moderation_assert_clean(new.body);
  return new;
end $$;
drop trigger if exists moderate_message on public.messages;
create trigger moderate_message before insert or update of body on public.messages
  for each row execute function public.moderate_message();

-- Texto público da loja (história).
create or replace function public.moderate_profile_texts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.story is distinct from old.story then perform public.moderation_assert_clean(new.story); end if;
  if new.store_name is distinct from old.store_name then perform public.moderation_assert_clean(new.store_name); end if;
  return new;
end $$;
drop trigger if exists moderate_profile_texts on public.profiles;
create trigger moderate_profile_texts before update of story, store_name on public.profiles
  for each row execute function public.moderate_profile_texts();

-- Aviso da loja e nome/descrição das peças.
create or replace function public.moderate_store_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.moderation_assert_clean(new.announcement);
  return new;
end $$;
drop trigger if exists moderate_store_settings on public.artisan_store_settings;
create trigger moderate_store_settings before insert or update of announcement on public.artisan_store_settings
  for each row execute function public.moderate_store_settings();

create or replace function public.moderate_product_texts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.name is distinct from old.name or new.description is distinct from old.description then
    perform public.moderation_assert_clean(new.name);
    perform public.moderation_assert_clean(new.description);
  end if;
  return new;
end $$;
drop trigger if exists moderate_product_texts on public.products;
create trigger moderate_product_texts before insert or update of name, description on public.products
  for each row execute function public.moderate_product_texts();

-- Denúncia feita por quem participa da conversa (comprador ou loja).
create or replace function public.report_conversation(p_conversation_id uuid, p_reason text, p_details text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para denunciar'; end if;
  if not exists (select 1 from public.conversations c
                 where c.id = p_conversation_id and auth.uid() in (c.client_id, c.artisan_id)) then
    raise exception 'Conversa não encontrada';
  end if;
  if p_reason not in ('ofensa', 'golpe', 'spam', 'assedio', 'outro') then raise exception 'Motivo inválido'; end if;
  insert into public.conversation_reports(conversation_id, reporter_id, reason, details)
    values (p_conversation_id, auth.uid(), p_reason, nullif(btrim(left(coalesce(p_details, ''), 1000)), ''))
    on conflict (conversation_id, reporter_id, status) do update
      set reason = excluded.reason, details = excluded.details, created_at = now()
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.report_conversation(uuid, text, text) from public, anon;
grant execute on function public.report_conversation(uuid, text, text) to authenticated;

-- Administração: fila de denúncias com as últimas mensagens da conversa.
create or replace function public.admin_list_conversation_reports(p_status text default 'open')
returns table (
  report_id uuid, conversation_id uuid, reason text, details text, status text, admin_note text,
  created_at timestamptz, reporter_name text, reporter_role text, client_id uuid, client_name text,
  artisan_id uuid, store_name text, recent_messages jsonb, blocked_attempts bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  return query
  select r.id, r.conversation_id, r.reason, r.details, r.status, r.admin_note, r.created_at,
    reporter.full_name, case when reporter.id = c.artisan_id then 'loja' else 'comprador' end,
    c.client_id, client.full_name, c.artisan_id, coalesce(artisan.store_name, artisan.full_name),
    coalesce((select jsonb_agg(jsonb_build_object('sender_id', m.sender_id, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
      from (select * from public.messages m2 where m2.conversation_id = c.id order by m2.created_at desc limit 20) m), '[]'::jsonb),
    (select count(*) from public.moderation_attempts a
      where a.user_id in (c.client_id, c.artisan_id) and a.created_at > now() - interval '30 days')
  from public.conversation_reports r
  join public.conversations c on c.id = r.conversation_id
  join public.profiles reporter on reporter.id = r.reporter_id
  join public.profiles client on client.id = c.client_id
  join public.profiles artisan on artisan.id = c.artisan_id
  where p_status = 'all' or r.status = p_status
  order by r.created_at desc
  limit 200;
end $$;
revoke all on function public.admin_list_conversation_reports(text) from public, anon;
grant execute on function public.admin_list_conversation_reports(text) to authenticated;

create or replace function public.admin_resolve_conversation_report(
  p_report_id uuid, p_status text, p_note text default null, p_suspend_user uuid default null, p_suspend_days integer default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  if p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'Status inválido'; end if;
  update public.conversation_reports set status = p_status, admin_note = nullif(btrim(p_note), ''),
    resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
    where id = p_report_id;
  if not found then raise exception 'Denúncia não encontrada'; end if;
  if p_suspend_user is not null and coalesce(p_suspend_days, 0) > 0 then
    insert into public.moderation_suspensions(user_id, suspended_until, reason)
      values (p_suspend_user, now() + make_interval(days => least(p_suspend_days, 365)), 'Decisão da administração sobre denúncia')
      on conflict (user_id) do update set suspended_until = excluded.suspended_until,
        reason = excluded.reason, updated_at = now();
  end if;
end $$;
revoke all on function public.admin_resolve_conversation_report(uuid, text, text, uuid, integer) from public, anon;
grant execute on function public.admin_resolve_conversation_report(uuid, text, text, uuid, integer) to authenticated;

commit;
