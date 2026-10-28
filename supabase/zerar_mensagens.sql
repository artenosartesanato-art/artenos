-- Zera o chat (mensagens e conversas) sem afetar o funcionamento.
-- Execute no SQL Editor do Supabase quando quiser recomeçar os testes.
--
-- O que faz:
--   * apaga todas as mensagens (public.messages);
--   * apaga todas as conversas (public.conversations) de peça, pedido e
--     encomenda;
--   * apaga os avisos de mensagem do sininho (se notificacoes.sql já foi
--     executado). Avisos de pedido, venda e encomenda são mantidos.
--
-- Por que não quebra nada: cada conversa é recriada sozinha quando alguém a
-- abre de novo —
--   * peça: pelo balão de mensagem no card/detalhe (start_product_conversation);
--   * pedido: em Mensagens > "Compras/Vendas sem conversa" (start_conversation);
--   * encomenda: pela página de encomendas (open_custom_order_conversation).
--
-- O que NÃO faz: não apaga pedidos, encomendas, peças, contas, regras (RLS),
-- funções, gatilhos, a regra conversations_context_check nem a configuração
-- de tempo real.
--
-- Segurança: roda numa transação. Se algo falhar (por exemplo, outra tabela
-- que dependa de conversas), nada é apagado. Não há como desfazer depois do
-- commit; faça um backup antes se o histórico tiver valor.
begin;

delete from public.messages;
delete from public.conversations;
-- Avisos de mensagem apontariam para conversas que não existem mais.
do $$
begin
  if to_regclass('public.notifications') is not null then
    delete from public.notifications where kind = 'mensagem';
  end if;
end $$;

commit;

-- Conferência (deve mostrar 0 e 0):
select
  (select count(*) from public.messages) as mensagens,
  (select count(*) from public.conversations) as conversas;
