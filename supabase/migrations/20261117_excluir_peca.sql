-- Excluir peça (vendedor).
-- Antes a loja só conseguia pausar. Agora pode excluir a peça do catálogo:
--   * a peça some do catálogo e da vitrine; saem junto as variações, os itens
--     de carrinho e os favoritos dela (cascata);
--   * o histórico continua: pedidos, itens de compra e avaliações guardam nome,
--     foto e preço da época (as referências à peça ficam nulas), e as fotos no
--     Storage não são apagadas, porque os pedidos ainda as mostram;
--   * fica um registro da exclusão em product_deletion_log (o que era, preço,
--     quantas unidades já tinham sido vendidas, quem excluiu e quando);
--   * não exclui peça com compra em pagamento (Pix gerado, cartão processando):
--     a loja espera o pagamento terminar ou pausa a peça;
--   * conta suspensa não exclui (como não edita).
-- Rode depois de 20261116_variacoes_padronizadas.sql. Pode ser repetida.
begin;

create table if not exists public.product_deletion_log (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  product_name text not null,
  price numeric(12,2),
  image_url text,
  units_sold integer not null default 0,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now()
);
create index if not exists product_deletion_log_artisan_idx on public.product_deletion_log (artisan_id, deleted_at desc);
alter table public.product_deletion_log enable row level security;
revoke all on public.product_deletion_log from public, anon, authenticated;

create or replace function public.delete_my_product(p_product_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_product public.products; v_until timestamptz; v_sold integer := 0;
begin
  if auth.uid() is null then raise exception 'Faça login para excluir a peça'; end if;
  v_until := public.moderation_suspended_until(auth.uid());
  if v_until is not null then
    raise exception 'Sua conta está suspensa até %. Enquanto isso, você não pode alterar a loja.',
      to_char(v_until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') using errcode = 'check_violation';
  end if;
  select * into v_product from public.products where id = p_product_id and artisan_id = auth.uid() for update;
  if not found then raise exception 'Produto não encontrado'; end if;

  if exists (select 1 from public.checkout_items ci join public.checkouts c on c.id = ci.checkout_id
             where ci.product_id = p_product_id and c.status in ('pending', 'awaiting_payment')) then
    raise exception 'Há uma compra em pagamento com esta peça. Pause a peça agora e exclua depois que o pagamento terminar';
  end if;

  if to_regclass('public.order_items') is not null then
    execute 'select coalesce(sum(quantity), 0)::integer from public.order_items where product_id = $1'
      into v_sold using p_product_id;
  end if;

  insert into public.product_deletion_log (product_id, artisan_id, product_name, price, image_url, units_sold, deleted_by)
    values (v_product.id, v_product.artisan_id, v_product.name, v_product.price, v_product.image_url, v_sold, auth.uid());

  begin
    delete from public.products where id = p_product_id;
  exception when foreign_key_violation then
    raise exception 'Esta peça tem registros que ainda dependem dela e não pode ser excluída agora. Pause a peça e fale com o atendimento';
  end;
  return case when v_sold > 0 then 'deleted_with_history' else 'deleted' end;
end $$;
revoke all on function public.delete_my_product(uuid) from public, anon;
grant execute on function public.delete_my_product(uuid) to authenticated;

commit;
