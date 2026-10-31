-- Contador das categorias soma peças e opções sob encomenda visíveis
-- (rodar SOMENTE em banco local de teste, depois de 20261103). Tudo é desfeito.
begin;
set local client_min_messages = warning;
insert into auth.users(id, email) values ('00000000-0000-0000-0000-000000000901','cc@t');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, story, terms_accepted_at)
values ('00000000-0000-0000-0000-000000000901','artisan','active','Loja C','cc@t','50560670789','17999990061','15086426','Rua A','1','Rio Preto','SP','Loja C','Faço peças de crochê com linhas de algodão há dez anos, cada uma com muito cuidado.',now());
insert into public.storefront_categories(id, name, slug, active, sort_order) values
  ('00000000-0000-0000-0000-000000000911','Arte Teste','arte-teste',true,99);
-- 1 peça publicada, 1 rascunho; 1 opção ativa, 1 pausada.
insert into public.products(artisan_id, name, price, active, stock, category_id) values
  ('00000000-0000-0000-0000-000000000901','Quadro',90,true,1,'00000000-0000-0000-0000-000000000911'),
  ('00000000-0000-0000-0000-000000000901','Rascunho',90,false,1,'00000000-0000-0000-0000-000000000911');
insert into public.custom_order_services(artisan_id, title, description, starting_price, min_production_days, max_production_days, active, category_id) values
  ('00000000-0000-0000-0000-000000000901','Retrato sob encomenda','Pintura a partir de foto',50,10,15,true,'00000000-0000-0000-0000-000000000911'),
  ('00000000-0000-0000-0000-000000000901','Pausada','x',10,1,2,false,'00000000-0000-0000-0000-000000000911');
do $$
declare r record;
begin
  select * into r from public.list_storefront_categories_with_counts() where id = '00000000-0000-0000-0000-000000000911';
  assert r.piece_count = 1 and r.service_count = 1 and r.product_count = 2, format('esperado 1+1=2, veio %s+%s=%s', r.piece_count, r.service_count, r.product_count);
  -- Só a opção (sem peça publicada): a categoria não pode ficar com 0.
  update public.products set active = false where artisan_id = '00000000-0000-0000-0000-000000000901';
  select * into r from public.list_storefront_categories_with_counts() where id = '00000000-0000-0000-0000-000000000911';
  assert r.product_count = 1, 'só a opção sob encomenda conta 1';
  -- Loja em férias: a opção sai da vitrine e do contador.
  insert into public.artisan_store_settings(artisan_id, vacation_mode) values ('00000000-0000-0000-0000-000000000901', true);
  select * into r from public.list_storefront_categories_with_counts() where id = '00000000-0000-0000-0000-000000000911';
  assert r.product_count = 0, 'loja em férias não conta';
end $$;
select 'contagem_categorias: ok' as resultado;
rollback;
