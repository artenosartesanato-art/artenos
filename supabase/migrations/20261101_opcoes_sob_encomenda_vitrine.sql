-- Opções sob encomenda (serviços de orçamento das lojas) também na vitrine:
-- seção "Feito sob encomenda" da home e "Encomendar uma peça" (/categorias?encomenda=1).
-- Mesmas regras da página da loja (list_store_custom_order_services): opção
-- ativa, loja pública, aceitando encomendas e fora do modo férias.
begin;

drop function if exists public.list_public_custom_order_services(integer);
create function public.list_public_custom_order_services(p_limit integer default 12)
returns table (id uuid, artisan_id uuid, store_name text, title text, description text, image_url text,
  starting_price numeric, min_production_days integer, max_production_days integer)
language sql stable security definer set search_path = '' as $$
  select s.id, s.artisan_id, coalesce(p.store_name, p.full_name), s.title, s.description, s.image_url,
    s.starting_price, s.min_production_days, s.max_production_days
  from public.custom_order_services s
  join public.profiles p on p.id = s.artisan_id
  left join public.artisan_store_settings st on st.artisan_id = s.artisan_id
  where s.active and public.is_public_artisan(s.artisan_id)
    and coalesce(st.accepts_custom_orders, true) and not coalesce(st.vacation_mode, false)
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 48);
$$;
revoke all on function public.list_public_custom_order_services(integer) from public;
grant execute on function public.list_public_custom_order_services(integer) to anon, authenticated;

commit;
