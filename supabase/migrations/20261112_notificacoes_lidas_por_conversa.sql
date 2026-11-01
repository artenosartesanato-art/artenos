-- Contador de mensagens preso em 1.
-- Ao abrir uma conversa, o site marcava como lidos só os avisos que já tinham
-- chegado à tela. Se a conversa abria antes (link do aviso, página já aberta),
-- o aviso ficava como não lido. Esta função marca no servidor TODOS os avisos
-- não lidos da conversa (ou pedido) da própria pessoa, de uma vez.
begin;

create or replace function public.mark_notifications_read_by_ref(p_ref uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if auth.uid() is null or p_ref is null then return 0; end if;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and ref_id = p_ref;
  get diagnostics changed = row_count;
  return changed;
end $$;
revoke all on function public.mark_notifications_read_by_ref(uuid) from public, anon;
grant execute on function public.mark_notifications_read_by_ref(uuid) to authenticated;

commit;
