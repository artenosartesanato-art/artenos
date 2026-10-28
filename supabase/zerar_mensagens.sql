-- Zera o histórico de mensagens sem afetar o funcionamento do chat.
-- Execute no SQL Editor do Supabase quando quiser recomeçar os testes.
--
-- O que faz:
--   * apaga todas as mensagens (public.messages);
--   * mantém todas as conversas (de pedido, encomenda e peça), com seus
--     vínculos, para que continuem abrindo normalmente;
--   * volta a data da "última mensagem" de cada conversa para a data em que
--     ela foi criada, para a lista não mostrar atividade que não existe mais.
--
-- O que NÃO faz: não apaga conversas, pedidos, encomendas, peças, contas,
-- regras (RLS), funções, gatilhos nem a configuração de tempo real.
--
-- Diferença para zerar_mensagens_teste.sql: aquele também apaga as conversas.
-- Este mantém as conversas, então nada precisa ser recriado depois.
--
-- Segurança: roda numa transação. Se algo falhar (por exemplo, outra tabela
-- que dependa de mensagens), nada é apagado. Não há como desfazer depois do
-- commit; faça um backup antes se o histórico tiver valor.
begin;

delete from public.messages;

update public.conversations
set last_message_at = created_at
where last_message_at is distinct from created_at;

commit;

-- Conferência (deve mostrar 0 mensagens e as conversas preservadas):
select
  (select count(*) from public.messages) as mensagens,
  (select count(*) from public.conversations) as conversas;
