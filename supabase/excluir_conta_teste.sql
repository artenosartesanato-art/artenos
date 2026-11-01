-- Excluir uma conta de teste (ou criada por engano) de vez.
--
-- Por que o Supabase recusava: a conta tinha uma compra iniciada (tabela
-- checkouts) e o banco protege compras de serem apagadas junto com a pessoa.
-- Esta função apaga a conta e tudo o que é dela, inclusive compras que NUNCA
-- foram pagas (só iniciadas, abandonadas ou canceladas).
--
-- Segurança: se a conta tiver compra ou venda PAGA (ou repasse), a função
-- recusa — registro financeiro não pode sumir. Para essas contas use a
-- exclusão de conta da plataforma (apaga os dados pessoais e mantém o
-- histórico da venda).
--
-- Como usar (SQL Editor do Supabase):
--   1) Rode este arquivo uma vez (cria a função).
--   2) Prévia, sem apagar nada:
--        select public.admin_purge_test_account('email@da-conta.com');
--   3) Apagar de verdade:
--        select public.admin_purge_test_account('email@da-conta.com', true);
-- A função só pode ser chamada pelo SQL Editor (não fica disponível no site).
begin;

create or replace function public.admin_purge_test_account(p_email text, p_confirm boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_open_checkouts integer;
  v_seller_checkouts integer;
  v_products integer;
  v_orders integer;
begin
  select u.id into v_user from auth.users u where lower(u.email) = v_email;
  if v_user is null then
    select p.id into v_user from public.profiles p where lower(p.email) = v_email;
  end if;
  if v_user is null then raise exception 'Nenhuma conta com o e-mail %', p_email; end if;

  if exists (select 1 from public.admin_users a where a.user_id = v_user) then
    raise exception 'Esta é uma conta da equipe. Remova-a em Administração › Equipe antes.';
  end if;
  if exists (select 1 from public.checkouts c where c.client_id = v_user and c.status in ('approved', 'refunded'))
     or exists (select 1 from public.checkout_items i join public.checkouts c on c.id = i.checkout_id
                where i.artisan_id = v_user and c.status in ('approved', 'refunded'))
     or exists (select 1 from public.payouts p where p.artisan_id = v_user) then
    raise exception 'Esta conta tem compra ou venda paga. Para não apagar registros financeiros, use a exclusão de conta da plataforma (anonimiza os dados pessoais).';
  end if;

  select count(*) into v_open_checkouts from public.checkouts c where c.client_id = v_user;
  select count(distinct i.checkout_id) into v_seller_checkouts from public.checkout_items i where i.artisan_id = v_user;
  select count(*) into v_products from public.products p where p.artisan_id = v_user;
  select count(*) into v_orders from public.orders o where o.client_id = v_user or o.artisan_id = v_user;

  if not p_confirm then
    return format('PRÉVIA (nada foi apagado): conta %s — %s compra(s) não paga(s) do cliente, %s compra(s) não paga(s) com peças desta loja, %s peça(s), %s pedido(s) de teste. Para apagar: select public.admin_purge_test_account(%L, true);',
      v_email, v_open_checkouts, v_seller_checkouts, v_products, v_orders, v_email);
  end if;

  -- Compras nunca pagas (o cliente desta conta, ou com peças desta loja).
  delete from public.checkouts c
   where c.status not in ('approved', 'refunded')
     and (c.client_id = v_user or c.id in (select i.checkout_id from public.checkout_items i where i.artisan_id = v_user));
  -- O resto (perfil, carrinho, favoritos, mensagens, peças, avisos...) sai junto com o login.
  delete from auth.users where id = v_user;
  delete from public.profiles where id = v_user; -- caso o perfil exista sem login
  return format('Conta %s excluída (%s compra(s) não paga(s) removida(s)). Fotos no Storage não são apagadas por SQL.',
    v_email, v_open_checkouts + v_seller_checkouts);
end $$;
revoke all on function public.admin_purge_test_account(text, boolean) from public, anon, authenticated;

commit;
