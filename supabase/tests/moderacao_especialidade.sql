-- Teste do filtro de termos na especialidade e no cadastro (rodar SOMENTE em
-- banco local de teste, depois de migrations/20261107_moderacao_especialidade.sql).
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'loja-esp@teste.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'loja-esp2@teste.local');
delete from public.profiles where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');

do $$
declare failed boolean := false;
begin
  -- Cadastro com especialidade "Outro" limpa: passa.
  insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address,
    address_number, city, state, store_name, specialty, terms_accepted_at)
  values ('00000000-0000-0000-0000-0000000000e1','artisan','active','Loja Esp','loja-esp@teste.local','66666666666',
    '17999990006','15086426','Rua A','1','Rio Preto','SP','Loja Esp','Marchetaria',now());

  -- Cadastro com especialidade ofensiva: barrado já na inserção.
  begin
    insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address,
      address_number, city, state, store_name, specialty, terms_accepted_at)
    values ('00000000-0000-0000-0000-0000000000e2','artisan','active','Loja Esp 2','loja-esp2@teste.local','77777777777',
      '17999990007','15086426','Rua A','1','Rio Preto','SP','Loja Esp 2','p.u.t.a',now());
  exception when check_violation then failed := true; end;
  assert failed, 'inserção com especialidade ofensiva deveria falhar';

  -- Edição da especialidade (Minha loja): barrada com termo, liberada sem.
  failed := false;
  begin
    update public.profiles set specialty = 'c0rn0 artesanal' where id = '00000000-0000-0000-0000-0000000000e1';
  exception when check_violation then failed := true; end;
  assert failed, 'edição com especialidade ofensiva deveria falhar';
  update public.profiles set specialty = 'Vitral' where id = '00000000-0000-0000-0000-0000000000e1';
  assert (select specialty from public.profiles where id = '00000000-0000-0000-0000-0000000000e1') = 'Vitral', 'edição limpa';
end $$;

select 'ok: moderacao_especialidade' as resultado;
rollback;
