-- Cliente e vendedor na mesma conta (rodar SOMENTE em banco local de teste,
-- depois de 20261106_cliente_vira_vendedor.sql). Tudo é desfeito no final.
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000000c01', 'ana-cliente@teste.local'),
  ('00000000-0000-0000-0000-000000000c09', 'admin-upgrade@teste.local');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, terms_accepted_at)
values ('00000000-0000-0000-0000-000000000c01','client','active','Ana Lima','ana-cliente@teste.local','12312312387','17999990091','01001000','Rua C','3','São Paulo','SP',now());
insert into public.admin_users(user_id, role) values ('00000000-0000-0000-0000-000000000c09', 'owner');
insert into public.storefront_favorites(user_id, product_id)
  select '00000000-0000-0000-0000-000000000c01', id from public.products limit 1;

-- Regras 1 e 3: o mesmo CPF ou e-mail não cria outra conta (unicidade mantida).
do $$
declare dup_doc boolean := false; dup_mail boolean := false;
begin
  insert into auth.users(id, email) values ('00000000-0000-0000-0000-000000000c07', 'outra@teste.local'), ('00000000-0000-0000-0000-000000000c08', 'ana-cliente-2@teste.local');
  begin
    insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, terms_accepted_at)
    values ('00000000-0000-0000-0000-000000000c07', 'client', 'active', 'Ana 2', 'outra@teste.local', '12312312387', '17999990099','01001000','Rua X','1','São Paulo','SP', now());
  exception when unique_violation then dup_doc := true; end;
  begin
    insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, terms_accepted_at)
    values ('00000000-0000-0000-0000-000000000c08', 'artisan', 'pending_review', 'Ana 3', 'ana-cliente@teste.local', '98798798700', '17999990099','01001000','Rua X','1','São Paulo','SP', now());
  exception when unique_violation then dup_mail := true; end;
  assert dup_doc and dup_mail, 'CPF e e-mail continuam únicos (cliente e vendedor)';
end $$;

-- Regra 2: a cliente pede a loja e continua cliente durante a análise.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c01', true);
do $$
declare failed text;
begin
  begin perform public.request_seller_profile('Ateliê da Ana', 'Crochê', 'curto');
  exception when others then failed := sqlerrm; end;
  assert failed like 'A história da loja%', 'valida a história';

  assert public.request_seller_profile('Ateliê da Ana', 'Crochê e tricô',
    'Faço peças de crochê com linhas de algodão há dez anos, cada uma com muito cuidado.') = 'pending_review', 'pedido enviado';
  assert (select account_type = 'client' and approval_status = 'active' from public.profiles where id = auth.uid()),
    'durante a análise continua cliente normal (pode comprar)';
  assert (select status = 'pending_review' and submission_type = 'upgrade' from public.get_my_seller_request()), 'andamento visível';

  failed := null;
  begin perform public.request_seller_profile('Outra loja', 'Bordado', 'Faço peças de crochê com linhas de algodão há dez anos, cada uma com muito cuidado.');
  exception when others then failed := sqlerrm; end;
  assert failed like '%já está em análise%', 'regra 3: um pedido de loja por pessoa';
end $$;

-- Aprovação: a mesma conta vira vendedora, com o histórico de cliente.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c09', true);
do $$
declare app uuid;
begin
  select id into app from public.artisan_applications where artisan_id = '00000000-0000-0000-0000-000000000c01';
  perform public.admin_manage_artisan_application(app, 'start_review');
  assert (select account_type from public.profiles where id = '00000000-0000-0000-0000-000000000c01') = 'client', 'em análise: segue cliente';
  perform public.admin_manage_artisan_application(app, 'approve');
  assert (select account_type = 'artisan' and approval_status = 'active' and store_name = 'Ateliê da Ana'
            from public.profiles where id = '00000000-0000-0000-0000-000000000c01'), 'aprovada: mesma conta vira vendedora com os dados da loja';
  assert (select count(*) from public.storefront_favorites where user_id = '00000000-0000-0000-0000-000000000c01') =
         (select least(count(*), 1) from public.products), 'favoritos de cliente continuam na conta';
  assert public.is_public_artisan('00000000-0000-0000-0000-000000000c01'), 'loja pública';

  perform public.admin_manage_artisan_application(app, 'suspend', 'Documentação pendente');
  assert (select account_type = 'client' and approval_status = 'active' from public.profiles where id = '00000000-0000-0000-0000-000000000c01'),
    'suspensa: volta a ser só cliente e continua comprando';
  assert not public.is_public_artisan('00000000-0000-0000-0000-000000000c01'), 'loja sai da vitrine';
  perform public.admin_manage_artisan_application(app, 'reactivate');
  assert (select account_type from public.profiles where id = '00000000-0000-0000-0000-000000000c01') = 'artisan', 'reativada: vendedora de novo';
end $$;

-- Recusa: continua cliente e pode reenviar a mesma solicitação.
do $$
declare app uuid; c uuid := '00000000-0000-0000-0000-000000000c02';
begin
  insert into auth.users(id, email) values (c, 'bia-cliente@teste.local');
  insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, terms_accepted_at)
  values (c, 'client', 'active', 'Bia', 'bia-cliente@teste.local', '45645645649', '17999990098','01001000','Rua X','1','São Paulo','SP', now());
  perform set_config('request.jwt.claim.sub', c::text, true);
  perform public.request_seller_profile('Loja da Bia', 'Cerâmica', 'Modelo peças de cerâmica no torno e queimo em forno a lenha, uma a uma.');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c09', true);
  select id into app from public.artisan_applications where artisan_id = c;
  perform public.admin_manage_artisan_application(app, 'reject', 'Envie fotos das peças');
  assert (select account_type = 'client' and approval_status = 'active' from public.profiles where id = c), 'recusada: segue cliente';
  perform set_config('request.jwt.claim.sub', c::text, true);
  assert public.request_seller_profile('Loja da Bia', 'Cerâmica', 'Modelo peças de cerâmica no torno e queimo em forno a lenha, uma a uma.') = 'pending_review', 'pode reenviar';
  assert (select count(*) from public.artisan_applications where artisan_id = c) = 1, 'continua uma solicitação só';
end $$;

-- Vendedor comum (cadastro direto) segue o fluxo de sempre.
do $$
declare v uuid := '00000000-0000-0000-0000-000000000c03'; app uuid;
begin
  insert into auth.users(id, email) values (v, 'loja-direta@teste.local');
  insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, story, terms_accepted_at)
  values (v, 'artisan', 'pending_review', 'Caio', 'loja-direta@teste.local', '78978978911', '17999990097','01001000','Rua X','1','São Paulo','SP', 'Loja Direta',
    'Faço peças de crochê com linhas de algodão há dez anos, cada uma com muito cuidado.', now());
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c09', true);
  select id into app from public.artisan_applications where artisan_id = v;
  perform public.admin_manage_artisan_application(app, 'approve');
  assert (select approval_status from public.profiles where id = v) = 'active', 'vendedor direto aprovado como antes';
end $$;

select 'cliente_vira_vendedor: ok' as resultado;
rollback;
