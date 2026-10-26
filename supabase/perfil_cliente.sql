-- Execute manualmente no SQL Editor do Supabase após a criação de public.profiles.
-- Não altera cadastros existentes, pedidos, carrinho ou mensagens.
-- A foto fica em um bucket privado; apenas o dono pode ler, enviar e excluir.

alter table public.profiles add column if not exists avatar_path text;

-- A política existente limita a LINHA ao dono, mas não limita as COLUNAS.
-- Mantém editáveis telefone, endereço e dados da loja; bloqueia alteração direta de
-- account_type, approval_status, document, email e datas de aceite/cadastro.
revoke update on public.profiles from public, anon, authenticated;
grant update (
  full_name, phone, cep, address, address_number, city, state,
  store_name, specialty, story, avatar_path, updated_at
) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artenos-profile-avatars',
  'artenos-profile-avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "Artenos avatar owner can read" on storage.objects;
create policy "Artenos avatar owner can read"
on storage.objects for select to authenticated
using (
  bucket_id = 'artenos-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Artenos avatar owner can upload" on storage.objects;
create policy "Artenos avatar owner can upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'artenos-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Artenos avatar owner can delete" on storage.objects;
create policy "Artenos avatar owner can delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'artenos-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
