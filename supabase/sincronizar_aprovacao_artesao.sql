-- Execute uma vez no SQL Editor depois de administracao_aprovacao.sql.
-- Corrige solicitações divergentes e mantém alterações manuais de profiles
-- sincronizadas com a fila administrativa.

begin;

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

  -- Quando o perfil é ativado manualmente, a solicitação também é aprovada.
  -- Se a alteração veio do painel, ela já estará aprovada e nada será refeito.
  if new.approval_status = 'active' then
    update public.artisan_applications
    set
      status = 'approved',
      decision_reason = 'Status sincronizado com o perfil do artesão.',
      decided_at = coalesce(decided_at, now())
    where artisan_id = new.id
      and status <> 'approved';

  -- Se alguém retirar manualmente a aprovação de um perfil ativo, o painel
  -- passa a mostrá-lo como suspenso. Outros estados de análise são preservados.
  elsif old.approval_status = 'active' then
    update public.artisan_applications
    set
      status = 'suspended',
      decision_reason = 'A aprovação foi retirada diretamente do perfil.',
      decided_at = now()
    where artisan_id = new.id
      and status = 'approved';
  end if;

  return new;
end;
$$;

revoke all on function public.sync_manual_artisan_approval() from public, anon, authenticated;

drop trigger if exists sync_manual_artisan_approval on public.profiles;
create trigger sync_manual_artisan_approval
  after update of approval_status on public.profiles
  for each row
  execute function public.sync_manual_artisan_approval();

-- Corrige imediatamente artesãos que já estão ativos no perfil, mas ainda
-- aparecem como pendentes, recusados ou em análise no painel.
update public.artisan_applications application
set
  status = 'approved',
  decision_reason = 'Status sincronizado com o perfil do artesão.',
  decided_at = coalesce(application.decided_at, now())
from public.profiles profile
where profile.id = application.artisan_id
  and profile.account_type = 'artisan'
  and profile.approval_status = 'active'
  and application.status <> 'approved';

commit;

-- Auditoria de conferência (somente leitura):
-- select p.email, p.approval_status, a.status as application_status
-- from public.profiles p
-- join public.artisan_applications a on a.artisan_id = p.id
-- where p.account_type = 'artisan'
-- order by p.created_at desc;
