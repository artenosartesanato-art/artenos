-- Suspensão: textos diferentes para cliente e para loja.
-- A mensagem de erro (quando a pessoa tenta fazer algo) e o aviso enviado ao
-- suspender falavam em "alterar a loja" até para quem é só cliente. Agora:
--   cliente → "Sua conta está suspensa ... não pode comprar, favoritar ou enviar mensagens";
--   loja    → "Sua loja está suspensa ... fora da vitrine, não publica/edita peças ...".
-- Rode depois de 20261109_suspensao_conta.sql.
begin;

create or replace function public.account_suspension_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz; v_store boolean;
begin
  if auth.uid() is null or coalesce(public.is_active_admin(), false) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_until := public.moderation_suspended_until(auth.uid());
  if v_until is not null then
    select p.account_type = 'artisan' into v_store from public.profiles p where p.id = auth.uid();
    if coalesce(v_store, false) then
      raise exception 'Sua loja está suspensa até %. Enquanto isso, ela fica fora da vitrine e você não pode publicar ou editar peças, alterar a loja, comprar, favoritar ou enviar mensagens. Os pedidos já pagos ainda podem ser enviados.',
        to_char(v_until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
        using errcode = 'check_violation';
    end if;
    raise exception 'Sua conta está suspensa até %. Enquanto isso, você pode navegar pela Artenós, mas não pode comprar, favoritar ou enviar mensagens.',
      to_char(v_until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

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
      select p_suspend_user, 'conta',
        case when p.account_type = 'artisan' then 'Loja suspensa' else 'Conta suspensa' end,
        'Após análise de uma denúncia, sua ' || case when p.account_type = 'artisan' then 'loja' else 'conta' end
          || ' foi suspensa até ' || to_char(v_until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '. '
          || case when p.account_type = 'artisan'
               then 'A loja fica fora da vitrine e você não pode publicar ou editar peças, alterar a loja ou enviar mensagens. Pedidos já pagos ainda podem ser enviados.'
               else 'Você pode navegar, mas não pode comprar, favoritar ou enviar mensagens.' end,
        '/ajuda'
      from public.profiles p where p.id = p_suspend_user;
    exception when others then null; -- aviso é extra
    end;
  end if;
end $$;
revoke all on function public.admin_resolve_conversation_report(uuid, text, text, uuid, integer) from public, anon;
grant execute on function public.admin_resolve_conversation_report(uuid, text, text, uuid, integer) to authenticated;

commit;
