-- Avisos (sininho, contador de mensagens): o site lia public.notifications e
-- recebia 403 (PostgREST 42501, "permission denied"). notificacoes.sql criou a
-- tabela e a regra de acesso (RLS: cada pessoa lê só os próprios avisos), mas
-- não concedeu a leitura ao papel "authenticated" — em projetos em que tabelas
-- novas não são liberadas automaticamente para a API, a leitura é recusada.
-- Só leitura: avisos nascem pelos gatilhos e são marcados como lidos pela
-- função mark_notifications_read. Pode ser rodado mais de uma vez.
begin;

grant select on public.notifications to authenticated;

-- Tempo real: a tabela precisa estar na publicação do Realtime.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

commit;
