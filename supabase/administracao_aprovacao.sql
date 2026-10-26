-- Artenós: estrutura administrativa da aprovação de artesãos.
-- Execute TODO este arquivo uma única vez no SQL Editor do Supabase,
-- depois de seguranca_aprovacao.sql.
-- Este script cria a base do painel; ele não aprova nem rejeita ninguém.

begin;

create extension if not exists pgcrypto;

-- Usuários autorizados a acessar a futura área administrativa.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'reviewer'
    check (role in ('owner', 'reviewer')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auditoria separada para concessão, troca de função e desativação de admins.
create table if not exists public.admin_user_audit (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null
    check (action in ('granted', 'role_changed', 'activated', 'deactivated', 'removed')),
  role_from text,
  role_to text,
  created_at timestamptz not null default now()
);

-- Uma solicitação administrativa por cadastro de artesão.
-- O perfil continua sendo a fonte dos dados cadastrais; esta tabela controla
-- exclusivamente o processo de análise e sua atribuição.
create table if not exists public.artisan_applications (
  id uuid primary key default gen_random_uuid(),
  application_number bigint generated always as identity unique,
  artisan_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'pending_review'
    check (status in (
      'pending_review',
      'under_review',
      'changes_requested',
      'approved',
      'rejected',
      'suspended'
    )),
  submission_type text not null default 'standard'
    check (submission_type in ('standard', 'assisted')),
  assigned_admin_id uuid references public.admin_users(user_id) on delete set null,
  decision_reason text,
  submitted_at timestamptz not null default now(),
  review_started_at timestamptz,
  changes_requested_at timestamptz,
  decided_at timestamptz,
  last_resubmitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Histórico permanente. public_note poderá ser exibida ao artesão;
-- internal_note ficará reservada às futuras funções administrativas.
create table if not exists public.artisan_application_audit (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.artisan_applications(id) on delete cascade,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'submitted',
    'backfilled',
    'assigned',
    'review_started',
    'changes_requested',
    'approved',
    'rejected',
    'suspended',
    'reactivated',
    'resubmitted',
    'status_changed'
  )),
  status_from text,
  status_to text,
  public_note text,
  internal_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists artisan_applications_status_submitted_idx
  on public.artisan_applications (status, submitted_at);
create index if not exists artisan_applications_assigned_idx
  on public.artisan_applications (assigned_admin_id, status);
create index if not exists artisan_application_audit_application_idx
  on public.artisan_application_audit (application_id, created_at);
create index if not exists artisan_application_audit_artisan_idx
  on public.artisan_application_audit (artisan_id, created_at);
create index if not exists admin_user_audit_subject_idx
  on public.admin_user_audit (subject_user_id, created_at);

alter table public.admin_users enable row level security;
alter table public.admin_user_audit enable row level security;
alter table public.artisan_applications enable row level security;
alter table public.artisan_application_audit enable row level security;

-- Consulta interna usada pelas políticas. A lista de administradores não fica
-- armazenada em user_metadata e não pode ser alterada pelo navegador.
create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users administrator
    where administrator.user_id = auth.uid()
      and administrator.active
  );
$$;

revoke all on function public.is_active_admin() from public, anon;
grant execute on function public.is_active_admin() to authenticated, service_role;

drop policy if exists "Active admins read administrator registry" on public.admin_users;
create policy "Active admins read administrator registry"
  on public.admin_users
  for select to authenticated
  using ((select public.is_active_admin()));

drop policy if exists "Active admins read administrator audit" on public.admin_user_audit;
create policy "Active admins read administrator audit"
  on public.admin_user_audit
  for select to authenticated
  using ((select public.is_active_admin()));

drop policy if exists "Artisan reads own application" on public.artisan_applications;
create policy "Artisan reads own application"
  on public.artisan_applications
  for select to authenticated
  using (artisan_id = (select auth.uid()));

drop policy if exists "Active admins read applications" on public.artisan_applications;
create policy "Active admins read applications"
  on public.artisan_applications
  for select to authenticated
  using ((select public.is_active_admin()));

drop policy if exists "Artisan reads own public audit" on public.artisan_application_audit;
create policy "Artisan reads own public audit"
  on public.artisan_application_audit
  for select to authenticated
  using (artisan_id = (select auth.uid()));

drop policy if exists "Active admins read application audit" on public.artisan_application_audit;
create policy "Active admins read application audit"
  on public.artisan_application_audit
  for select to authenticated
  using ((select public.is_active_admin()));

-- Nenhuma escrita administrativa é liberada diretamente pela API.
-- As decisões serão feitas por funções seguras na etapa do painel.
revoke all on public.admin_users from public, anon, authenticated;
revoke all on public.admin_user_audit from public, anon, authenticated;
revoke all on public.artisan_applications from public, anon, authenticated;
revoke all on public.artisan_application_audit from public, anon, authenticated;

grant select on public.admin_users to authenticated;
grant select on public.admin_user_audit to authenticated;
grant select on public.artisan_applications to authenticated;
grant select (
  id,
  application_id,
  artisan_id,
  actor_user_id,
  action,
  status_from,
  status_to,
  public_note,
  metadata,
  created_at
) on public.artisan_application_audit to authenticated;

create or replace function public.touch_admin_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_admin_user() from public, anon, authenticated;

drop trigger if exists touch_admin_user on public.admin_users;
create trigger touch_admin_user
  before update on public.admin_users
  for each row
  execute function public.touch_admin_user();

-- Mantém histórico de qualquer mudança no registro de administradores.
create or replace function public.audit_admin_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.admin_user_audit (
      subject_user_id, actor_user_id, action, role_to
    ) values (
      new.user_id, auth.uid(), 'granted', new.role
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.admin_user_audit (
      subject_user_id, actor_user_id, action, role_from
    ) values (
      old.user_id, auth.uid(), 'removed', old.role
    );
    return old;
  end if;

  if new.role is not distinct from old.role
    and new.active is not distinct from old.active then
    return new;
  end if;

  audit_action := case
    when new.active and not old.active then 'activated'
    when not new.active and old.active then 'deactivated'
    else 'role_changed'
  end;

  insert into public.admin_user_audit (
    subject_user_id, actor_user_id, action, role_from, role_to
  ) values (
    new.user_id, auth.uid(), audit_action, old.role, new.role
  );

  return new;
end;
$$;

revoke all on function public.audit_admin_user_change() from public, anon, authenticated;

drop trigger if exists audit_admin_user_change on public.admin_users;
create trigger audit_admin_user_change
  after insert or update or delete on public.admin_users
  for each row
  execute function public.audit_admin_user_change();

-- Mantém updated_at correto sem confiar no navegador.
create or replace function public.touch_artisan_application()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_artisan_application() from public, anon, authenticated;

drop trigger if exists touch_artisan_application on public.artisan_applications;
create trigger touch_artisan_application
  before update on public.artisan_applications
  for each row
  execute function public.touch_artisan_application();

-- Cria automaticamente a solicitação depois que um perfil de artesão nasce.
create or replace function public.enqueue_artisan_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_type = 'artisan' then
    insert into public.artisan_applications (
      artisan_id,
      status,
      submission_type,
      submitted_at
    ) values (
      new.id,
      case when new.approval_status = 'active' then 'approved' else 'pending_review' end,
      case when new.approval_status = 'assisted_review' then 'assisted' else 'standard' end,
      new.created_at
    )
    on conflict (artisan_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_artisan_application() from public, anon, authenticated;

drop trigger if exists enqueue_artisan_application on public.profiles;
create trigger enqueue_artisan_application
  after insert on public.profiles
  for each row
  execute function public.enqueue_artisan_application();

-- Registra automaticamente toda criação, atribuição e troca de status.
create or replace function public.audit_artisan_application_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_action text;
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
      metadata
    ) values (
      new.id,
      new.artisan_id,
      auth.uid(),
      audit_action,
      new.status,
      case when audit_action = 'submitted' then 'Cadastro enviado para análise.' end,
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
    metadata
  ) values (
    new.id,
    new.artisan_id,
    auth.uid(),
    audit_action,
    old.status,
    new.status,
    new.decision_reason,
    jsonb_build_object(
      'assigned_admin_from', old.assigned_admin_id,
      'assigned_admin_to', new.assigned_admin_id
    )
  );

  return new;
end;
$$;

revoke all on function public.audit_artisan_application_change() from public, anon, authenticated;

drop trigger if exists audit_artisan_application_change on public.artisan_applications;
create trigger audit_artisan_application_change
  after insert or update on public.artisan_applications
  for each row
  execute function public.audit_artisan_application_change();

-- Cria solicitações para artesãos que já existiam antes desta estrutura.
insert into public.artisan_applications (
  artisan_id,
  status,
  submission_type,
  submitted_at,
  decided_at
)
select
  profile.id,
  case when profile.approval_status = 'active' then 'approved' else 'pending_review' end,
  case when profile.approval_status = 'assisted_review' then 'assisted' else 'standard' end,
  profile.created_at,
  case when profile.approval_status = 'active' then profile.updated_at end
from public.profiles profile
where profile.account_type = 'artisan'
on conflict (artisan_id) do nothing;

-- Mantém a fila coerente quando o status do perfil for alterado manualmente.
create or replace function public.sync_manual_artisan_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_type <> 'artisan'
    or new.approval_status is not distinct from old.approval_status then
    return new;
  end if;

  if new.approval_status = 'active' then
    update public.artisan_applications
    set status = 'approved',
      decision_reason = 'Status sincronizado com o perfil do artesão.',
      decided_at = coalesce(decided_at, now())
    where artisan_id = new.id and status <> 'approved';
  elsif old.approval_status = 'active' then
    update public.artisan_applications
    set status = 'suspended',
      decision_reason = 'A aprovação foi retirada diretamente do perfil.',
      decided_at = now()
    where artisan_id = new.id and status = 'approved';
  end if;

  return new;
end;
$$;

revoke all on function public.sync_manual_artisan_approval() from public, anon, authenticated;
drop trigger if exists sync_manual_artisan_approval on public.profiles;
create trigger sync_manual_artisan_approval
  after update of approval_status on public.profiles
  for each row execute function public.sync_manual_artisan_approval();

commit;

-- Depois de criar a conta que será administradora, cadastre a primeira dona
-- manualmente no SQL Editor. Substitua o e-mail e execute separadamente:
--
-- insert into public.admin_users (user_id, role)
-- select id, 'owner'
-- from auth.users
-- where lower(email) = lower('EMAIL-DA-DONA@EXEMPLO.COM')
-- on conflict (user_id) do update set role = 'owner', active = true, updated_at = now();



