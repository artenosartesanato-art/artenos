-- Teste da data de nascimento e da idade mínima (rodar SOMENTE em banco local
-- de teste, depois de migrations/20261114_data_nascimento.sql).
begin;
set local client_min_messages = warning;

-- Contas sem account_type nos metadados: o gatilho handle_new_user não cria o
-- profile (como no cadastro com Google); o profile é inserido logo abaixo.
insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'adulta@teste.local', jsonb_build_object('birth_date', '1990-03-25')),
  ('00000000-0000-0000-0000-0000000000e2', 'menor@teste.local',
     jsonb_build_object('birth_date', to_char(public.age_today() - interval '17 years', 'YYYY-MM-DD'))),
  ('00000000-0000-0000-0000-0000000000e3', 'antiga@teste.local', '{}'),
  ('00000000-0000-0000-0000-0000000000e4', 'antiga-menor@teste.local', '{}'),
  ('00000000-0000-0000-0000-0000000000e5', 'faz18hoje@teste.local',
     jsonb_build_object('birth_date', to_char(public.age_today() - interval '18 years', 'YYYY-MM-DD'))),
  ('00000000-0000-0000-0000-0000000000e6', 'data-ruim@teste.local', jsonb_build_object('birth_date', '1990-02-31')),
  ('00000000-0000-0000-0000-0000000000e7', 'cliente-menor@teste.local',
     jsonb_build_object('birth_date', to_char(public.age_today() - interval '15 years', 'YYYY-MM-DD'))),
  ('00000000-0000-0000-0000-0000000000e8', 'cliente@teste.local', '{}');

do $$
declare failed boolean; r record; v_minor date := (public.age_today() - interval '16 years')::date;
begin
  -- Cadastro novo de maior: a data vem dos metadados da conta.
  insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
  values ('00000000-0000-0000-0000-0000000000e1','artisan','active','Adulta Teste','adulta@teste.local','11144477735','17999990021','15086426','Rua A','1','Rio Preto','SP','Loja ' || md5(random()::text),now());
  assert (select birth_date from public.profiles where id = '00000000-0000-0000-0000-0000000000e1') = date '1990-03-25', 'data copiada dos metadados';

  -- Quem faz 18 hoje já pode.
  insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
  values ('00000000-0000-0000-0000-0000000000e5','artisan','active','Dezoito Hoje','faz18hoje@teste.local','52998224725','17999990025','15086426','Rua A','1','Rio Preto','SP','Loja ' || md5(random()::text),now());

  -- Menor de 18 não cria a conta.
  failed := false;
  begin
    insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
    values ('00000000-0000-0000-0000-0000000000e2','artisan','active','Menor Teste','menor@teste.local','39053344705','17999990022','15086426','Rua A','1','Rio Preto','SP','Loja ' || md5(random()::text),now());
  exception when others then failed := sqlerrm like '%18 anos%'; end;
  assert failed, 'menor de 18 barrado no cadastro';

  -- Data que não existe no calendário.
  failed := false;
  begin
    insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
    values ('00000000-0000-0000-0000-0000000000e6','artisan','active','Data Ruim','data-ruim@teste.local','86288366757','17999990026','15086426','Rua A','1','Rio Preto','SP','Loja ' || md5(random()::text),now());
  exception when others then failed := sqlerrm like '%inválida%'; end;
  assert failed, 'data inexistente barrada';

  -- Contas antigas (sem data): nascem normalmente e o site pede depois.
  insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
  values ('00000000-0000-0000-0000-0000000000e3','artisan','active','Antiga Teste','antiga@teste.local','71428793860','17999990023','15086426','Rua A','1','Rio Preto','SP','Loja ' || md5(random()::text),now()),
         ('00000000-0000-0000-0000-0000000000e4','artisan','active','Antiga Menor','antiga-menor@teste.local','87748248800','17999990024','15086426','Rua A','1','Rio Preto','SP','Loja ' || md5(random()::text),now());

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', true);
  select * into r from public.get_my_age_gate();
  assert r.birth_date_missing and not r.age_blocked, 'conta antiga: falta a data';
  -- Datas impossíveis.
  failed := false;
  begin perform public.set_my_birth_date((public.age_today() + 1)::date); exception when others then failed := true; end;
  assert failed, 'data no futuro';
  failed := false;
  begin perform public.set_my_birth_date(date '1850-01-01'); exception when others then failed := true; end;
  assert failed, 'mais de 120 anos';
  assert public.set_my_birth_date(date '1985-07-10') = 'ok', 'maior informa a data';
  select * into r from public.get_my_age_gate();
  assert not r.birth_date_missing and not r.age_blocked, 'conta liberada';
  insert into public.cart_items(user_id) values ('00000000-0000-0000-0000-0000000000e3');
  -- Só uma vez: depois, a correção é com a equipe.
  failed := false;
  begin perform public.set_my_birth_date(date '1986-07-10'); exception when others then failed := sqlerrm like '%já foi informada%'; end;
  assert failed, 'não troca a data sozinha';

  -- Conta antiga de menor: fica bloqueada até fazer 18.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e4', true);
  assert public.set_my_birth_date(v_minor) = 'blocked', 'menor fica bloqueado';
  select * into r from public.get_my_age_gate();
  assert r.age_blocked and not r.birth_date_missing, 'situação: bloqueada';
  assert r.unblock_on = (v_minor + interval '18 years')::date, 'libera ao fazer 18: ' || r.unblock_on;
  assert (select age_blocked_at from public.profiles where id = '00000000-0000-0000-0000-0000000000e4') is not null, 'registro do bloqueio';
  failed := false;
  begin insert into public.cart_items(user_id) values ('00000000-0000-0000-0000-0000000000e4');
  exception when others then failed := sqlerrm like '%maiores de 18%'; end;
  assert failed, 'conta bloqueada não movimenta';
  failed := false;
  begin perform public.set_my_birth_date(date '1980-01-01'); exception when others then failed := true; end;
  assert failed, 'bloqueada não troca a data';

  -- Sem login e sem profile.
  perform set_config('request.jwt.claim.sub', '', true);
  failed := false;
  begin perform public.set_my_birth_date(date '1980-01-01'); exception when others then failed := true; end;
  assert failed, 'exige login';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
  assert not exists (select 1 from public.get_my_age_gate()), 'sem profile: sem linha';

  -- Cliente (comprador) não passa pela idade mínima.
  insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, terms_accepted_at)
  values ('00000000-0000-0000-0000-0000000000e7','client','active','Cliente Menor','cliente-menor@teste.local','23100299900','17999990027','15086426','Rua A','1','Rio Preto','SP',now()),
         ('00000000-0000-0000-0000-0000000000e8','client','active','Cliente Teste','cliente@teste.local','45317828791','17999990028','15086426','Rua A','1','Rio Preto','SP',now());
  assert (select birth_date from public.profiles where id = '00000000-0000-0000-0000-0000000000e7') is null, 'cliente: data não é guardada';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e8', true);
  select * into r from public.get_my_age_gate();
  assert not r.birth_date_missing and not r.age_blocked, 'cliente: nada a pedir';
  insert into public.cart_items(user_id) values ('00000000-0000-0000-0000-0000000000e8');
  -- Cliente pedindo loja sem a data: recusado.
  failed := false;
  begin perform public.request_seller_profile('Ateliê Cliente', 'Crochê',
    'Comecei a fazer crochê com minha avó e hoje faço bolsas e tapetes com linha de algodão cru.');
  exception when others then failed := sqlerrm like '%data de nascimento%'; end;
  assert failed, 'pedido de loja exige a data';
  assert public.my_birth_date_missing(), 'cliente sem data';
  -- Menor de 18: recusado sem gravar e sem bloquear a conta de cliente.
  failed := false;
  begin perform public.set_my_birth_date(v_minor); exception when others then failed := sqlerrm like '%18 anos%'; end;
  assert failed, 'cliente menor não vira loja';
  assert (select birth_date from public.profiles where id = '00000000-0000-0000-0000-0000000000e8') is null, 'nada gravado';
  -- Maior de 18: informa a data e envia o pedido.
  assert public.set_my_birth_date(date '1992-05-04') = 'ok', 'cliente maior informa a data';
  assert not public.my_birth_date_missing(), 'data informada';
  assert public.request_seller_profile('Ateliê Cliente', 'Crochê',
    'Comecei a fazer crochê com minha avó e hoje faço bolsas e tapetes com linha de algodão cru.') = 'pending_review', 'pedido enviado';

  -- A própria pessoa não altera a data direto na tabela.
  assert not has_column_privilege('authenticated', 'public.profiles', 'birth_date', 'UPDATE'), 'birth_date fora do grant';
  assert not has_column_privilege('authenticated', 'public.profiles', 'age_blocked_at', 'UPDATE'), 'age_blocked_at fora do grant';
end $$;

select 'ok: data_nascimento' as resultado;
rollback;
