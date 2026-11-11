-- Teste de fotos e variações (rodar SOMENTE em banco local de teste, depois de
-- 20261113_fotos_variacoes_produto.sql). Tudo é desfeito no final.
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'loja-variacao@teste.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'cliente-variacao@teste.local');
delete from public.profiles where id in ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values
  ('00000000-0000-0000-0000-0000000000c1','artisan','active','Loja Variação','loja-variacao@teste.local','66666666661','17999990016','15086426','Rua A','1','Rio Preto','SP','Loja Variação',now()),
  ('00000000-0000-0000-0000-0000000000c2','client','active','Cliente Variação','cliente-variacao@teste.local','77777777771','17999990017','01001000','Rua C','3','São Paulo','SP',null,now());
insert into public.artisan_store_settings(artisan_id, accepts_custom_orders) values ('00000000-0000-0000-0000-0000000000c1', false);
insert into public.products(id, artisan_id, name, price, active, stock, description, image_url) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','Quadro Ipê',100,true,0,'Quadro pintado à mão',
   'https://x.supabase.co/storage/v1/object/public/artenos-store-assets/00000000-0000-0000-0000-0000000000c1/products/00000000-0000-0000-0000-0000000000d1/a.webp');
insert into public.platform_pricing_settings(id, platform_fee_percent) values (1, 10)
  on conflict (id) do update set platform_fee_percent = 10;

-- Artesã cadastra 2 fotos extras e Cor × Tamanho.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$
declare base text := 'https://x.supabase.co/storage/v1/object/public/artenos-store-assets/00000000-0000-0000-0000-0000000000c1/products/00000000-0000-0000-0000-0000000000d1/';
begin
  perform public.save_my_product_options('00000000-0000-0000-0000-0000000000d1',
    array[base || 'b.webp', base || 'c.webp'], array['Cor', 'Tamanho'],
    jsonb_build_array(
      jsonb_build_object('option1', 'Azul', 'option2', '40×50 cm', 'price', 120, 'stock', 2, 'image_url', base || 'b.webp'),
      jsonb_build_object('option1', 'Azul', 'option2', '50×60 cm', 'price', 150, 'stock', 0),
      jsonb_build_object('option1', 'Verde', 'option2', '40×50 cm', 'price', 110, 'stock', 1)));
  assert (select stock from public.products where id = '00000000-0000-0000-0000-0000000000d1') = 3, 'estoque = soma das opções';
  assert (select price from public.products where id = '00000000-0000-0000-0000-0000000000d1') = 110, 'preço = menor opção';
  assert (select availability from public.products where id = '00000000-0000-0000-0000-0000000000d1') = 'ready', 'pronta entrega';
  assert (select jsonb_array_length(public.get_my_product_options('00000000-0000-0000-0000-0000000000d1')->'variants')) = 3, 'edição lê 3 opções';
  assert (select photo_count from public.list_my_product_options_summary() where product_id = '00000000-0000-0000-0000-0000000000d1') = 3, '3 fotos';

  begin
    perform public.save_my_product_options('00000000-0000-0000-0000-0000000000d1',
      array[base || 'b.webp', base || 'c.webp', base || 'd.webp'], '{}', '[]');
    raise exception 'deveria recusar 4 fotos';
  exception when others then assert sqlerrm like '%no máximo 3 fotos%', sqlerrm; end;
  begin
    perform public.save_my_product_options('00000000-0000-0000-0000-0000000000d1',
      array['https://x.supabase.co/storage/v1/object/public/artenos-store-assets/outra-loja/products/x/a.webp'], '{}', '[]');
    raise exception 'deveria recusar foto de outra loja';
  exception when others then assert sqlerrm like 'Foto inválida%', sqlerrm; end;
  begin
    perform public.save_my_product_options('00000000-0000-0000-0000-0000000000d1', '{}', array['Cor', 'Tamanho'],
      jsonb_build_array(jsonb_build_object('option1', 'Azul', 'price', 10, 'stock', 1)));
    raise exception 'deveria exigir a segunda variação';
  exception when others then assert sqlerrm like 'Preencha as duas%', sqlerrm; end;
end $$;

-- Outra loja não consegue mexer.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
do $$
begin
  begin
    perform public.save_my_product_options('00000000-0000-0000-0000-0000000000d1', '{}', '{}', '[]');
    raise exception 'deveria recusar';
  exception when others then assert sqlerrm = 'Produto não encontrado', sqlerrm; end;
  assert public.get_my_product_options('00000000-0000-0000-0000-0000000000d1') is null, 'não lê opções alheias';
end $$;

-- Cliente: vitrine, carrinho, checkout, cancelamento e pagamento.
do $$
declare
  azul40 uuid; azul50 uuid; verde40 uuid; c uuid; q uuid := gen_random_uuid(); opts jsonb;
  seller uuid := '00000000-0000-0000-0000-0000000000c1';
  product uuid := '00000000-0000-0000-0000-0000000000d1';
begin
  select id into azul40 from public.product_variants where product_id = product and option2 = '40×50 cm' and option1 = 'Azul';
  select id into azul50 from public.product_variants where product_id = product and option2 = '50×60 cm';
  select id into verde40 from public.product_variants where product_id = product and option1 = 'Verde';

  opts := public.get_product_options(product);
  assert jsonb_array_length(opts->'images') = 3, 'galeria pública com 3 fotos';
  assert (select count(*) from jsonb_array_elements(opts->'variants') v where v->>'availability' = 'sold_out') = 1, 'opção sem estoque esgotada (loja sem encomendas)';
  assert (select min_price from public.list_products_with_options(array[product])) = 110, 'card sabe que tem opções';

  begin perform public.add_to_cart(product, 1); raise exception 'deveria exigir opção';
  exception when others then assert sqlerrm like 'Escolha uma opção (Cor e Tamanho)%', sqlerrm; end;
  begin perform public.add_to_cart(product, 1, azul50); raise exception 'deveria recusar esgotada';
  exception when others then assert sqlerrm = 'Peça esgotada no momento.', sqlerrm; end;
  begin perform public.add_to_cart(product, 3, azul40); raise exception 'deveria limitar ao estoque da opção';
  exception when others then assert sqlerrm like 'Estoque insuficiente. Há somente 2%', sqlerrm; end;

  perform public.add_to_cart(product, 1, azul40);
  perform public.add_to_cart(product, 1, azul40);
  perform public.add_to_cart(product, 1, verde40);
  assert (select count(*) from public.cart_items where client_id = auth.uid()) = 2, 'duas linhas: uma por opção';
  assert (select quantity from public.cart_items where variant_id = azul40) = 2, 'soma na mesma opção';
  assert (select unit_price from public.list_cart() where variant_id = azul40) = 120, 'preço da opção';
  assert (select variant_label from public.list_cart() where variant_id = verde40) = 'Cor: Verde · Tamanho: 40×50 cm', 'rótulo';
  assert (select image_url from public.list_cart() where variant_id = azul40) like '%b.webp', 'foto da opção';

  insert into public.shipping_quotes(id, client_id, artisan_id, destination_cep, cart_signature, service_id, service_name, company_name, price,
    carrier_delivery_min_days, carrier_delivery_max_days, production_time_days, total_delivery_min_days, total_delivery_max_days)
  values (q, auth.uid(), seller, '01001000',
    public.current_cart_shipping_signature(auth.uid(), seller, '01001000'), 1, 'PAC', 'Correios', 20, 1, 3, 0, 1, 3);
  insert into public.cart_shipping_selections(client_id, artisan_id, quote_id) values (auth.uid(), seller, q)
    on conflict (client_id, artisan_id) do update set quote_id = excluded.quote_id;

  c := public.create_checkout_from_cart();
  assert (select total_amount from public.checkouts where id = c) = 370, 'total = 2×120 + 110 + 20';
  assert (select stock from public.product_variants where id = azul40) = 0, 'baixa na opção azul';
  assert (select stock from public.product_variants where id = verde40) = 0, 'baixa na opção verde';
  assert (select stock from public.products where id = product) = 0, 'peça acompanha';
  assert (select product_name from public.checkout_items where checkout_id = c and variant_id = verde40) = 'Quadro Ipê — Cor: Verde · Tamanho: 40×50 cm', 'nome com a opção';

  -- Opção reservada não pode ser apagada pela loja.
  perform set_config('request.jwt.claim.sub', seller::text, true);
  begin
    perform public.save_my_product_options(product, '{}', array['Cor'], jsonb_build_array(jsonb_build_object('option1', 'Roxo', 'price', 99, 'stock', 1)));
    raise exception 'deveria proteger opção reservada';
  exception when others then assert sqlerrm like 'Há uma compra em pagamento%', sqlerrm; end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);

  perform public.cancel_reserved_checkout(c, false);
  assert (select stock from public.product_variants where id = azul40) = 2, 'estoque devolvido à opção';
  assert (select stock from public.products where id = product) = 3, 'peça recalculada';

  c := public.create_checkout_from_cart();
  perform public.begin_checkout_payment(c);
  perform public.finalize_checkout(c, 'mp-variacao-1', 'pix', 0, 10, 0);
  assert (select count(*) from public.order_items oi join public.orders o on o.id = oi.order_id where o.checkout_id = c and oi.variant_label is not null) = 2, 'pedido guarda a opção';
  assert not exists (select 1 from public.cart_items where client_id = auth.uid()), 'carrinho limpo';

  -- Comprar agora com opção.
  perform set_config('request.jwt.claim.sub', seller::text, true);
  update public.product_variants set stock = 5 where id = azul50;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
  begin perform public.start_buy_now(product, 1); raise exception 'deveria exigir opção';
  exception when others then assert sqlerrm like 'Escolha uma opção%', sqlerrm; end;
  perform public.start_buy_now(product, 2, azul50);
  assert (select unit_price from public.get_buy_now()) = 150, 'preço da opção no comprar agora';
  assert (select variant_label from public.get_buy_now()) = 'Cor: Azul · Tamanho: 50×60 cm', 'rótulo no comprar agora';
  q := gen_random_uuid();
  insert into public.shipping_quotes(id, client_id, artisan_id, destination_cep, cart_signature, service_id, service_name, company_name, price,
    carrier_delivery_min_days, carrier_delivery_max_days, production_time_days, total_delivery_min_days, total_delivery_max_days)
  values (q, auth.uid(), seller, '01001000',
    public.current_buy_now_signature(auth.uid(), seller, '01001000'), 1, 'PAC', 'Correios', 20, 1, 3, 0, 1, 3);
  c := public.create_checkout_from_item(q);
  assert (select total_amount from public.checkouts where id = c) = 320, 'total = 2×150 + 20';
  assert (select stock from public.product_variants where id = azul50) = 3, 'baixa na opção';
end $$;

-- Sem variações: tudo como antes; remover as variações mantém a peça simples.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$
begin
  perform public.release_unstarted_checkouts();
  update public.checkouts set status = 'cancelled' where status in ('pending', 'awaiting_payment');
  perform public.save_my_product_options('00000000-0000-0000-0000-0000000000d1', '{}', '{}', '[]');
  assert not exists (select 1 from public.product_variants where product_id = '00000000-0000-0000-0000-0000000000d1'), 'variações removidas';
  assert (select cardinality(gallery_urls) from public.products where id = '00000000-0000-0000-0000-0000000000d1') = 0, 'fotos extras removidas';
end $$;

select 'ok: fotos_variacoes_produto' as resultado;
rollback;
