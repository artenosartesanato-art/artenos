-- Cliente e vendedor na mesma conta.
-- Uma pessoa tem uma conta (o mesmo login, e-mail e CPF). Ela nasce cliente e
-- pode pedir para abrir uma loja: durante a análise continua cliente normal
-- (compra, favoritos, mensagens); quando a equipe aprova, a MESMA conta passa a
-- ser vendedora, mantendo pedidos, favoritos, carrinho e todo o histórico.
-- As regras de unicidade continuam como estão (CPF e e-mail únicos por conta;
-- uma solicitação de loja por conta), o que garante um cadastro de cliente e
-- um de vendedor por pessoa.
begin;

-- 1) Tipo de solicitação "upgrade" (cliente abrindo loja) -------------------------
alter table public.artisan_applications drop constraint if exists artisan_applications_submission_type_check;
alter table public.artisan_applications add constraint artisan_applications_submission_type_check
  check (submission_type in ('standard', 'assisted', 'upgrade'));

-- 2) Cliente pede para abrir a loja ----------------------------------------------
-- Reaproveita os dados pessoais da conta; só pede os dados da loja. Bloqueia se
-- já houver loja aprovada, em análise ou suspensa (uma loja por pessoa). Uma
-- solicitação recusada pode ser enviada de novo (a mesma linha é reaberta).
create or replace function public.request_seller_profile(p_store_name text, p_specialty text, p_story text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_application public.artisan_applications;
  v_store text := btrim(coalesce(p_store_name, ''));
  v_specialty text := btrim(coalesce(p_specialty, ''));
  v_story text := btrim(coalesce(p_story, ''));
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para abrir uma loja'; end if;
  select * into v_profile from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Conta não encontrada'; end if;
  if coalesce(v_profile.account_status, 'active') <> 'active' then raise exception 'Esta conta está desativada'; end if;
  if v_profile.account_type = 'artisan' then raise exception 'Sua conta já tem uma loja'; end if;
  if v_profile.approval_status <> 'active' then raise exception 'Sua conta ainda não está ativa'; end if;

  select * into v_application from public.artisan_applications where artisan_id = auth.uid() for update;
  if found and v_application.status in ('pending_review', 'under_review') then
    raise exception 'Sua loja já está em análise. Você recebe um aviso quando a equipe responder';
  end if;
  if found and v_application.status = 'approved' then raise exception 'Sua conta já tem uma loja'; end if;
  if found and v_application.status = 'suspended' then
    raise exception 'Sua loja está suspensa. Fale com o atendimento da Artenós';
  end if;

  if char_length(v_store) not between 2 and 80 then raise exception 'Informe o nome da loja (de 2 a 80 caracteres)'; end if;
  if char_length(v_specialty) not between 2 and 80 then raise exception 'Informe a especialidade da loja (ex.: crochê, cerâmica)'; end if;
  if not public.is_meaningful_text(v_story) then
    raise exception 'A história da loja precisa de frases reais, com pelo menos 40 caracteres e 6 palavras.';
  end if;
  if exists (select 1 from public.profiles p where lower(btrim(p.store_name)) = lower(v_store)
               and p.id <> auth.uid() and p.account_type = 'artisan') then
    raise exception 'Já existe uma loja com esse nome. Escolha outro';
  end if;

  update public.profiles set store_name = v_store, specialty = v_specialty, story = v_story, updated_at = now()
   where id = auth.uid();

  if found and v_application.id is not null then
    -- Recusada antes ou com ajustes pedidos: reenvia a mesma solicitação.
    update public.artisan_applications set status = 'pending_review', submission_type = 'upgrade',
      decision_reason = null, last_resubmitted_at = now(), submitted_at = coalesce(submitted_at, now())
     where id = v_application.id;
  else
    insert into public.artisan_applications(artisan_id, status, submission_type, submitted_at)
    values (auth.uid(), 'pending_review', 'upgrade', now());
  end if;
  return 'pending_review';
end $$;
revoke all on function public.request_seller_profile(text, text, text) from public, anon;
grant execute on function public.request_seller_profile(text, text, text) to authenticated;

-- Andamento da loja para a própria pessoa (cartão "Venda na Artenós" no perfil).
create or replace function public.get_my_seller_request()
returns table (status text, submission_type text, decision_reason text, submitted_at timestamptz,
  decided_at timestamptz, store_name text, specialty text, story text, is_seller boolean)
language sql stable security definer set search_path = '' as $$
  select a.status, a.submission_type, a.decision_reason, a.submitted_at, a.decided_at,
    p.store_name, p.specialty, p.story, p.account_type = 'artisan' and p.approval_status = 'active'
  from public.profiles p
  left join public.artisan_applications a on a.artisan_id = p.id
  where p.id = auth.uid();
$$;
revoke all on function public.get_my_seller_request() from public, anon;
grant execute on function public.get_my_seller_request() to authenticated;

-- 3) Decisão da equipe ------------------------------------------------------------
-- Igual à versão de painel_administrativo.sql, com o caso "upgrade":
--   aprovar/reativar → a conta passa a ser vendedora (aprovada);
--   suspender        → volta a ser só cliente (continua comprando);
--   análise, ajustes, recusa → nada muda na conta: segue cliente normal.
create or replace function public.admin_manage_artisan_application(
  p_application_id uuid, p_action text, p_public_note text default null, p_internal_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
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

  select application.* into current_application
  from public.artisan_applications application
  where application.id = p_application_id
  for update;
  if not found then raise exception 'Solicitação não encontrada'; end if;

  if normalized_action in ('request_changes', 'reject', 'suspend') and normalized_public_note is null then
    raise exception 'Informe uma orientação pública para esta decisão';
  end if;

  if normalized_action = 'start_review' and current_application.status in ('pending_review', 'changes_requested', 'rejected') then
    next_status := 'under_review';
  elsif normalized_action = 'request_changes' and current_application.status in ('pending_review', 'under_review') then
    next_status := 'changes_requested';
  elsif normalized_action = 'approve' and current_application.status in ('pending_review', 'under_review', 'changes_requested', 'rejected') then
    next_status := 'approved';
  elsif normalized_action = 'reject' and current_application.status in ('pending_review', 'under_review', 'changes_requested') then
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
    decision_reason = case when normalized_action = 'start_review' then null else normalized_public_note end,
    review_started_at = case when normalized_action = 'start_review' then now() else review_started_at end,
    changes_requested_at = case when normalized_action = 'request_changes' then now() else changes_requested_at end,
    decided_at = case when normalized_action in ('approve', 'reject', 'suspend', 'reactivate') then now() else decided_at end
  where id = current_application.id;

  if current_application.submission_type = 'upgrade' then
    -- Cliente abrindo loja: a conta é a mesma (pedidos, favoritos e histórico ficam).
    if next_status = 'approved' then
      update public.profiles set account_type = 'artisan', approval_status = 'active', updated_at = now()
       where id = current_application.artisan_id;
    elsif next_status = 'suspended' then
      update public.profiles set account_type = 'client', approval_status = 'active', updated_at = now()
       where id = current_application.artisan_id;
    end if;
    if not exists (select 1 from public.profiles where id = current_application.artisan_id) then
      raise exception 'Conta da solicitação não encontrada';
    end if;
    return next_status;
  end if;

  pending_profile_status := case
    when current_application.submission_type = 'assisted' then 'assisted_review'::public.approval_status
    else 'pending_review'::public.approval_status
  end;

  update public.profiles
  set approval_status = case when next_status = 'approved' then 'active'::public.approval_status else pending_profile_status end,
      updated_at = now()
  where id = current_application.artisan_id and account_type = 'artisan';
  if not found then raise exception 'Perfil de artesão não encontrado'; end if;

  return next_status;
end $$;

commit;
