-- Foto de perfil da loja (além da capa).
-- Fica no mesmo bucket público da capa (artenos-store-assets), na pasta da
-- própria loja: <id da loja>/logo-<uuid>.<ext>. Aparece no lugar das iniciais
-- na página da loja, na lista de lojas, na vitrine e no detalhe da peça.
begin;

alter table public.artisan_store_settings add column if not exists logo_path text;

-- A loja troca (ou remove, com null) a própria foto.
create or replace function public.set_my_store_logo(p_logo_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_path text := nullif(btrim(coalesce(p_logo_path, '')), '');
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para alterar a foto da loja'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and account_type = 'artisan') then
    raise exception 'Só lojas podem ter foto de perfil da loja';
  end if;
  if v_path is not null and (v_path not like auth.uid()::text || '/logo-%' or char_length(v_path) > 200 or v_path like '%..%') then
    raise exception 'Arquivo de foto inválido';
  end if;
  insert into public.artisan_store_settings(artisan_id, logo_path) values (auth.uid(), v_path)
  on conflict (artisan_id) do update set logo_path = excluded.logo_path, updated_at = now();
end $$;
revoke all on function public.set_my_store_logo(text) from public, anon;
grant execute on function public.set_my_store_logo(text) to authenticated;

-- A própria loja vê a foto mesmo antes da aprovação (Minha loja).
create or replace function public.get_my_store_logo()
returns text language sql stable security definer set search_path = '' as $$
  select logo_path from public.artisan_store_settings where artisan_id = auth.uid();
$$;
revoke all on function public.get_my_store_logo() from public, anon;
grant execute on function public.get_my_store_logo() to authenticated;

-- Fotos de várias lojas de uma vez (só lojas aprovadas e ativas).
create or replace function public.list_store_logos(p_artisan_ids uuid[])
returns table (artisan_id uuid, logo_path text)
language sql stable security definer set search_path = '' as $$
  select s.artisan_id, s.logo_path
  from public.artisan_store_settings s
  join public.profiles p on p.id = s.artisan_id
  where s.artisan_id = any((coalesce(p_artisan_ids, '{}'::uuid[]))[1:100])
    and s.logo_path is not null
    and p.account_type = 'artisan' and p.approval_status = 'active'
    and coalesce(p.account_status, 'active') = 'active';
$$;
revoke all on function public.list_store_logos(uuid[]) from public;
grant execute on function public.list_store_logos(uuid[]) to anon, authenticated;

-- Conta excluída: a foto da loja sai junto com a capa e o aviso.
create or replace function public.clear_store_logo_on_anonymize()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('artenos.anonymizing', true), '') = 'on' then new.logo_path := null; end if;
  return new;
end $$;
drop trigger if exists clear_store_logo_on_anonymize on public.artisan_store_settings;
create trigger clear_store_logo_on_anonymize before update on public.artisan_store_settings
  for each row execute function public.clear_store_logo_on_anonymize();

commit;
