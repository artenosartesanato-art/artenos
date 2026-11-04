-- Frete "expirado" ao pagar (carrinho e "Comprar agora"): a assinatura que
-- liga a cotação de frete à compra incluía products.updated_at. Ao pagar, o
-- banco primeiro libera a compra aberta e não paga (o estoque reservado volta
-- e updated_at muda) e só depois confere o frete: a assinatura nunca batia,
-- aparecia "O frete expirou" e a tentativa seguinte repetia o erro.
-- A assinatura passa a usar só o que muda o frete: peça, quantidade, preço,
-- peso, medidas, volumes, prazo de produção, CEP de destino e de origem.
-- A cotação vale 15 min (expires_at) e o preço continua conferido à parte.
begin;

create or replace function public.current_cart_shipping_signature(
  p_client_id uuid, p_artisan_id uuid, p_destination_cep text)
returns text language sql stable security definer set search_path = '' as $$
  select md5(
    coalesce(string_agg(
      concat_ws(':', item.product_id::text, item.quantity::text, item.unit_price::text,
        product.shipping_weight_grams::text, product.shipping_height_cm::text, product.shipping_width_cm::text,
        product.shipping_length_cm::text, product.shipping_package_count::text, product.production_time_days::text),
      '|' order by item.product_id), '')
    || ':' || coalesce(p_destination_cep, '') || ':' || coalesce(
      nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''),
      regexp_replace(artisan.cep, '\D', '', 'g')))
  from public.cart_items item
  join public.products product on product.id = item.product_id
  join public.profiles artisan on artisan.id = item.artisan_id
  left join public.artisan_store_settings setting on setting.artisan_id = item.artisan_id
  where item.client_id = p_client_id and item.artisan_id = p_artisan_id
  group by setting.shipping_origin_cep, artisan.cep;
$$;
revoke all on function public.current_cart_shipping_signature(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.current_buy_now_signature(p_client_id uuid, p_artisan_id uuid, p_destination_cep text)
returns text language sql stable security definer set search_path = '' as $$
  select md5('buy_now:' || concat_ws(':', intent.product_id::text, intent.quantity::text, intent.unit_price::text,
      product.shipping_weight_grams::text, product.shipping_height_cm::text, product.shipping_width_cm::text,
      product.shipping_length_cm::text, product.shipping_package_count::text, product.production_time_days::text)
    || ':' || coalesce(p_destination_cep, '') || ':' || coalesce(
      nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''),
      regexp_replace(artisan.cep, '\D', '', 'g')))
  from public.buy_now_intents intent
  join public.products product on product.id = intent.product_id
  join public.profiles artisan on artisan.id = intent.artisan_id
  left join public.artisan_store_settings setting on setting.artisan_id = intent.artisan_id
  where intent.client_id = p_client_id and intent.artisan_id = p_artisan_id;
$$;
revoke all on function public.current_buy_now_signature(uuid, uuid, text) from public, anon, authenticated;

commit;
