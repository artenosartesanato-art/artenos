-- Teste do custo fixo por item (rodar SOMENTE em banco local de teste, depois
-- de migrations/20261115_custo_por_item.sql).
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'loja-item@teste.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'dona-item@teste.local'),
  ('00000000-0000-0000-0000-0000000000f3', 'outra-loja-item@teste.local');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values ('00000000-0000-0000-0000-0000000000f1','artisan','active','Loja Item','loja-item@teste.local','11144477735','17999990031','15086426','Rua A','1','Rio Preto','SP','Loja Item',now()),
       ('00000000-0000-0000-0000-0000000000f3','artisan','active','Outra Loja','outra-loja-item@teste.local','52998224725','17999990033','15086426','Rua A','1','Rio Preto','SP','Outra Loja',now());
insert into public.admin_users(user_id, role) values ('00000000-0000-0000-0000-0000000000f2', 'owner');
insert into public.products(id, artisan_id, name, price) values
  ('00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-0000000000f1', 'Bolsa de crochê', 54),
  ('00000000-0000-0000-0000-00000000f0a2', '00000000-0000-0000-0000-0000000000f1', 'Vaso de barro', 80);
update public.platform_pricing_settings
   set platform_fee_percent = 8, payment_fee_pix_percent = 0.99, payment_fee_card_percent = 4.98,
       item_cost_amount = 4, item_cost_catalog_enabled = false
 where id = 1;

do $$
declare v_id uuid; r record; failed boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  select * into r from public.get_item_cost_settings();
  assert r.amount = 4 and not r.catalog_enabled, 'configuração inicial';

  -- Calculadora: a loja escolhe, mesmo com a opção do catálogo desligada.
  -- Custo 60 + lucro 40% (24) + item 4 = 88. Cartão: 88 / (1 - 0,1298) = 101,13.
  v_id := public.save_pricing_calculation('Bolsa', 30, 2, 15, 0, 0, 40, null, 'card', true);
  select * into r from public.list_my_pricing_calculations(5) where id = v_id;
  assert r.suggested_price = 101.13 and r.item_cost_amount = 4, 'preço com custo por item: ' || r.suggested_price;
  assert r.desired_profit = 24, 'a margem não incide sobre o custo por item';
  -- Sem a caixa marcada (e sem informar): a conta de antes, 96,53.
  assert public.update_my_pricing_calculation(v_id, 'Bolsa', 30, 2, 15, 0, 0, 40, null, 'card', false), 'editar';
  select * into r from public.list_my_pricing_calculations(5) where id = v_id;
  assert r.suggested_price = 96.53 and r.item_cost_amount = 0, 'sem custo por item: ' || r.suggested_price;
  v_id := public.save_pricing_calculation('Vaso', 30, 2, 15, 0, 0, 40, null, 'card');
  assert (select suggested_price from public.list_my_pricing_calculations(5) where id = v_id) = 96.53, 'padrão: sem custo por item';
  -- Cálculo vazio continua em zero.
  v_id := public.save_pricing_calculation('Vazio', 0, 0, 0, 0, 0, 0, null, 'card', true);
  select * into r from public.list_my_pricing_calculations(5) where id = v_id;
  assert r.suggested_price = 0 and r.item_cost_amount = 0, 'sem custo de produção';

  -- Catálogo: com a opção desligada, a loja não soma o custo à peça.
  failed := false;
  begin perform public.set_my_product_item_cost('00000000-0000-0000-0000-00000000f0a1', true);
  exception when others then failed := sqlerrm like '%desativado%'; end;
  assert failed, 'opção bloqueada pela administração';
  -- A loja não liga a opção.
  failed := false;
  begin perform public.admin_set_item_cost_catalog_enabled(true);
  exception when others then failed := true; end;
  assert failed, 'loja não altera a configuração';

  -- A proprietária liga.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
  assert public.admin_set_item_cost_catalog_enabled(true), 'ativar';

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  assert (select catalog_enabled from public.get_item_cost_settings()), 'opção liberada';
  assert public.set_my_product_item_cost('00000000-0000-0000-0000-00000000f0a1', true) = 4, 'peça com custo por item';
  assert (select count(*) from public.list_my_product_item_costs()) = 1, 'lista da loja';

  -- Outra loja não mexe na peça alheia nem enxerga o custo.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f3', true);
  failed := false;
  begin perform public.set_my_product_item_cost('00000000-0000-0000-0000-00000000f0a1', false);
  exception when others then failed := true; end;
  assert failed, 'peça de outra loja';
  assert (select count(*) from public.list_my_product_item_costs()) = 0, 'lista só da própria loja';

  -- A proprietária desliga: quem já tem mantém (e pode retirar), mas ninguém liga de novo.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
  assert not public.admin_set_item_cost_catalog_enabled(false), 'desativar';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  assert public.set_my_product_item_cost('00000000-0000-0000-0000-00000000f0a1', true) = 4, 'peça que já tinha mantém';
  failed := false;
  begin perform public.set_my_product_item_cost('00000000-0000-0000-0000-00000000f0a2', true);
  exception when others then failed := true; end;
  assert failed, 'peça nova não liga com a opção desligada';
  assert public.set_my_product_item_cost('00000000-0000-0000-0000-00000000f0a1', false) = 0, 'retirar';
  assert (select count(*) from public.list_my_product_item_costs()) = 0, 'sem custo depois de retirar';
  failed := false;
  begin perform public.set_my_product_item_cost('00000000-0000-0000-0000-00000000f0a1', true);
  exception when others then failed := true; end;
  assert failed, 'não liga de novo com a opção desligada';
end $$;

select 'ok: custo_por_item' as resultado;
rollback;
