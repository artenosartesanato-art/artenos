-- Teste da foto de perfil da loja (rodar SOMENTE em banco local de teste,
-- depois de migrations/20261108_foto_perfil_loja.sql).
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'loja-foto@teste.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'cliente-foto@teste.local');
delete from public.profiles where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values
  ('00000000-0000-0000-0000-0000000000f1','artisan','active','Loja Foto','loja-foto@teste.local','88888888888','17999990008','15086426','Rua A','1','Rio Preto','SP','Loja Foto',now()),
  ('00000000-0000-0000-0000-0000000000f2','client','active','Cliente Foto','cliente-foto@teste.local','99999999999','17999990009','01001000','Rua C','3','São Paulo','SP',null,now());

do $$
declare failed boolean;
begin
  -- Cliente não tem foto de loja.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
  failed := false;
  begin perform public.set_my_store_logo('00000000-0000-0000-0000-0000000000f2/logo-a.png');
  exception when others then failed := true; end;
  assert failed, 'cliente não deveria definir foto de loja';

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  -- Arquivo de outra pasta é recusado.
  failed := false;
  begin perform public.set_my_store_logo('00000000-0000-0000-0000-0000000000f2/logo-a.png');
  exception when others then failed := true; end;
  assert failed, 'caminho de outra loja deveria falhar';

  perform public.set_my_store_logo('00000000-0000-0000-0000-0000000000f1/logo-a.png');
  assert (select logo_path from public.list_store_logos(array['00000000-0000-0000-0000-0000000000f1'::uuid]))
    = '00000000-0000-0000-0000-0000000000f1/logo-a.png', 'foto pública';

  -- Loja fora do ar não mostra a foto.
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set approval_status = 'pending_review' where id = '00000000-0000-0000-0000-0000000000f1';
  assert not exists (select 1 from public.list_store_logos(array['00000000-0000-0000-0000-0000000000f1'::uuid])), 'loja em análise';
  update public.profiles set approval_status = 'active' where id = '00000000-0000-0000-0000-0000000000f1';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

  -- Remover a foto.
  perform public.set_my_store_logo(null);
  assert not exists (select 1 from public.list_store_logos(array['00000000-0000-0000-0000-0000000000f1'::uuid])), 'foto removida';

  -- Conta excluída: a foto sai junto.
  perform public.set_my_store_logo('00000000-0000-0000-0000-0000000000f1/logo-b.png');
  perform set_config('artenos.anonymizing', 'on', true);
  update public.artisan_store_settings set announcement = null where artisan_id = '00000000-0000-0000-0000-0000000000f1';
  assert (select logo_path from public.artisan_store_settings where artisan_id = '00000000-0000-0000-0000-0000000000f1') is null,
    'exclusão limpa a foto';
end $$;

select 'ok: foto_perfil_loja' as resultado;
rollback;
