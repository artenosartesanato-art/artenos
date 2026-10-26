-- Artenós: operações seguras do painel administrativo de aprovação.
-- Execute TODO este arquivo uma única vez no SQL Editor do Supabase,
-- depois de seguranca_aprovacao.sql e administracao_aprovacao.sql.
-- O script não aprova, recusa ou altera cadastros automaticamente.

begin;

-- Totais usados nos filtros do painel.
create or replace function public.get_admin_application_counts()
returns table (status text, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_active_admin(), false) then
    raise exception 'Acesso administrativo não autorizado';
  end if;

  return query
  select application.status, count(*)::bigint
  from public.artisan_applications application
  group by application.status
  order by application.status;
end;
$$;

-- Lista resumida. Dados sensíveis só são entregues a administradores ativos.
create or replace function public.list_admin_artisan_applications(
  p_status text default null,
  p_query text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  application_id uuid,
  application_number bigint,
  status text,
  submission_type text,
  assigned_admin_id uuid,
  artisan_id uuid,
  full_name text,
  email text,
  store_name text,
  specialty text,
  city text,
  state text,
  submitted_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_status text := nullif(btrim(coalesce(p_status, '')), '');
  normalized_query text := nullif(btrim(left(coalesce(p_query, ''), 100)), '');
begin
  if not coalesce(public.is_active_admin(), false) then
    raise exception 'Acesso administrativo não autorizado';
  end if;

  if normalized_status is not null and normalized_status not in (
    'pending_review', 'under_review', 'changes_requested',
    'approved', 'rejected', 'suspended'
  ) then
    raise exception 'Filtro de situação inválido';
  end if;

  return query
  select
    application.id,
    application.application_number,
    application.status,
    application.submission_type,
    application.assigned_admin_id,
    profile.id,
    profile.full_name,
    profile.email,
    profile.store_name,
    profile.specialty,
    profile.city,
    profile.state,
    application.submitted_at,
    application.updated_at,
    count(*) over()::bigint
  from public.artisan_applications application
  join public.profiles profile on profile.id = application.artisan_id
  where (normalized_status is null or application.status = normalized_status)
    and (
      normalized_query is null
      or profile.full_name ilike '%' || normalized_query || '%'
      or coalesce(profile.store_name, '') ilike '%' || normalized_query || '%'
      or coalesce(profile.email, '') ilike '%' || normalized_query || '%'
      or (
        regexp_replace(normalized_query, '\D', '', 'g') <> ''
        and profile.document ilike '%' || regexp_replace(normalized_query, '\D', '', 'g') || '%'
      )
      or application.application_number::text = normalized_query
    )
  order by
    case application.status
      when 'pending_review' then 0
      when 'under_review' then 1
      when 'changes_requested' then 2
      when 'suspended' then 3
      when 'rejected' then 4
      else 5
    end,
    application.submitted_at asc,
    application.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 10000);
end;
$$;

-- Dados completos de uma solicitação selecionada.
create or replace function public.get_admin_artisan_application(p_application_id uuid)
returns table (
  application_id uuid,
  application_number bigint,
  application_status text,
  submission_type text,
  assigned_admin_id uuid,
  decision_reason text,
  submitted_at timestamptz,
  review_started_at timestamptz,
  changes_requested_at timestamptz,
  decided_at timestamptz,
  application_updated_at timestamptz,
  artisan_id uuid,
  full_name text,
  email text,
  document text,
  phone text,
  cep text,
  address text,
  address_number text,
  city text,
  state text,
  store_name text,
  specialty text,
  story text,
  terms_accepted_at timestamptz,
  profile_created_at timestamptz,
  profile_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_active_admin(), false) then
    raise exception 'Acesso administrativo não autorizado';
  end if;

  return query
  select
    application.id,
    application.application_number,
    application.status,
    application.submission_type,
    application.assigned_admin_id,
    application.decision_reason,
    application.submitted_at,
    application.review_started_at,
    application.changes_requested_at,
    application.decided_at,
    application.updated_at,
    profile.id,
    profile.full_name,
    profile.email,
    profile.document,
    profile.phone,
    profile.cep,
    profile.address,
    profile.address_number,
    profile.city,
    profile.state,
    profile.store_name,
    profile.specialty,
    profile.story,
    profile.terms_accepted_at,
    profile.created_at,
    profile.updated_at
  from public.artisan_applications application
  join public.profiles profile on profile.id = application.artisan_id
  where application.id = p_application_id;
end;
$$;

-- Histórico completo, incluindo notas internas, apenas para administradores.
create or replace function public.list_admin_application_audit(p_application_id uuid)
returns table (
  id uuid,
  action text,
  status_from text,
  status_to text,
  public_note text,
  internal_note text,
  actor_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_active_admin(), false) then
    raise exception 'Acesso administrativo não autorizado';
  end if;

  return query
  select
    audit.id,
    audit.action,
    audit.status_from,
    audit.status_to,
    audit.public_note,
    audit.internal_note,
    coalesce(actor_profile.full_name, actor_user.email, 'Sistema')::text,
    audit.created_at
  from public.artisan_application_audit audit
  left join public.profiles actor_profile on actor_profile.id = audit.actor_user_id
  left join auth.users actor_user on actor_user.id = audit.actor_user_id
  where audit.application_id = p_application_id
  order by audit.created_at desc, audit.id desc;
end;
$$;

-- A nota interna é recebida pela função administrativa e lida pelo trigger
-- somente durante a transação atual.
create or replace function public.audit_artisan_application_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_action text;
  audit_internal_note text := nullif(current_setting('artenos.internal_note', true), '');
begin
  if tg_op = 'INSERT' then
    audit_action := case when new.status = 'approved' then 'backfilled' else 'submitted' end;

    insert into public.artisan_application_audit (
      application_id,
      artisan_id,
      actor_user_id,
      action,
      status_to,
      public_note,
      internal_note,
      metadata
    ) values (
      new.id,
      new.artisan_id,
      auth.uid(),
      audit_action,
      new.status,
      case when audit_action = 'submitted' then 'Cadastro enviado para análise.' end,
      audit_internal_note,
      jsonb_build_object('submission_type', new.submission_type)
    );

    return new;
  end if;

  if new.status is not distinct from old.status
    and new.assigned_admin_id is not distinct from old.assigned_admin_id
    and new.decision_reason is not distinct from old.decision_reason then
    return new;
  end if;

  audit_action := case
    when new.status = 'under_review' and old.status <> 'under_review' then 'review_started'
    when new.status = 'changes_requested' and old.status <> 'changes_requested' then 'changes_requested'
    when new.status = 'approved' and old.status <> 'approved' then
      case when old.status = 'suspended' then 'reactivated' else 'approved' end
    when new.status = 'rejected' and old.status <> 'rejected' then 'rejected'
    when new.status = 'suspended' and old.status <> 'suspended' then 'suspended'
    when new.status = 'pending_review' and old.status = 'changes_requested' then 'resubmitted'
    when new.assigned_admin_id is distinct from old.assigned_admin_id then 'assigned'
    else 'status_changed'
  end;

  insert into public.artisan_application_audit (
    application_id,
    artisan_id,
    actor_user_id,
    action,
    status_from,
    status_to,
    public_note,
    internal_note,
    metadata
  ) values (
    new.id,
    new.artisan_id,
    auth.uid(),
    audit_action,
    old.status,
    new.status,
    new.decision_reason,
    audit_internal_note,
    jsonb_build_object(
      'assigned_admin_from', old.assigned_admin_id,
      'assigned_admin_to', new.assigned_admin_id
    )
  );

  return new;
end;
$$;

revoke all on function public.audit_artisan_application_change() from public, anon, authenticated;

-- Única entrada de escrita do painel. As duas tabelas são atualizadas na mesma
-- transação e o trigger acima registra a decisão automaticamente.
create or replace function public.admin_manage_artisan_application(
  p_application_id uuid,
  p_action text,
  p_public_note text default null,
  p_internal_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_application public.artisan_applications%rowtype;
  normalized_action text := lower(btrim(coalesce(p_action, '')));
  normalized_public_note text := nullif(btrim(left(coalesce(p_public_note, ''), 2000)), '');
  normalized_internal_note text := nullif(btrim(left(coalesce(p_internal_note, ''), 4000)), '');
  next_status text;
  pending_profile_status public.approval_status;
begin
  if not coalesce(public.is_active_admin(), false) then
    raise exception 'Acesso administrativo não autorizado';
  end if;

  select application.*
  into current_application
  from public.artisan_applications application
  where application.id = p_application_id
  for update;

  if not found then
    raise exception 'Solicitação não encontrada';
  end if;

  if normalized_action in ('request_changes', 'reject', 'suspend')
    and normalized_public_note is null then
    raise exception 'Informe uma orientação pública para esta decisão';
  end if;

  if normalized_action = 'start_review'
    and current_application.status in ('pending_review', 'changes_requested', 'rejected') then
    next_status := 'under_review';
  elsif normalized_action = 'request_changes'
    and current_application.status in ('pending_review', 'under_review') then
    next_status := 'changes_requested';
  elsif normalized_action = 'approve'
    and current_application.status in ('pending_review', 'under_review', 'changes_requested', 'rejected') then
    next_status := 'approved';
  elsif normalized_action = 'reject'
    and current_application.status in ('pending_review', 'under_review', 'changes_requested') then
    next_status := 'rejected';
  elsif normalized_action = 'suspend' and current_application.status = 'approved' then
    next_status := 'suspended';
  elsif normalized_action = 'reactivate' and current_application.status = 'suspended' then
    next_status := 'approved';
  else
    raise exception 'Esta ação não é permitida para a situação atual';
  end if;

  perform set_config('artenos.internal_note', coalesce(normalized_internal_note, ''), true);

  update public.artisan_applications
  set
    status = next_status,
    assigned_admin_id = coalesce(assigned_admin_id, auth.uid()),
    decision_reason = case
      when normalized_action = 'start_review' then null
      else normalized_public_note
    end,
    review_started_at = case
      when normalized_action = 'start_review' then now()
      else review_started_at
    end,
    changes_requested_at = case
      when normalized_action = 'request_changes' then now()
      else changes_requested_at
    end,
    decided_at = case
      when normalized_action in ('approve', 'reject', 'suspend', 'reactivate') then now()
      else decided_at
    end
  where id = current_application.id;

  pending_profile_status := case
    when current_application.submission_type = 'assisted'
      then 'assisted_review'::public.approval_status
    else 'pending_review'::public.approval_status
  end;

  update public.profiles
  set
    approval_status = case
      when next_status = 'approved' then 'active'::public.approval_status
      else pending_profile_status
    end,
    updated_at = now()
  where id = current_application.artisan_id
    and account_type = 'artisan';

  if not found then
    raise exception 'Perfil de artesão não encontrado';
  end if;

  return next_status;
end;
$$;

revoke all on function public.get_admin_application_counts() from public, anon, authenticated;
revoke all on function public.list_admin_artisan_applications(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_admin_artisan_application(uuid) from public, anon, authenticated;
revoke all on function public.list_admin_application_audit(uuid) from public, anon, authenticated;
revoke all on function public.admin_manage_artisan_application(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.get_admin_application_counts() to authenticated;
grant execute on function public.list_admin_artisan_applications(text, text, integer, integer) to authenticated;
grant execute on function public.get_admin_artisan_application(uuid) to authenticated;
grant execute on function public.list_admin_application_audit(uuid) to authenticated;
grant execute on function public.admin_manage_artisan_application(uuid, text, text, text) to authenticated;

commit;

-- Cadastre a primeira proprietária somente depois que ela criar uma conta:
-- insert into public.admin_users (user_id, role)
-- select id, 'owner' from auth.users
-- where lower(email) = lower('EMAIL-DA-DONA@EXEMPLO.COM')
-- on conflict (user_id) do update
-- set role = 'owner', active = true, updated_at = now();


