-- Execute uma vez no SQL Editor do Supabase (depois de conversas_produtos_topicos.sql).
-- Corrige o erro "violates check constraint conversations_context_check" ao
-- abrir uma conversa sobre uma peça.
--
-- Regra anterior: toda conversa precisava de um pedido OU de uma encomenda.
-- Regra nova: continua igual para pedidos e encomendas (nunca os dois ao mesmo
-- tempo) e passa a aceitar conversa sobre uma peça, sem pedido nem encomenda,
-- desde que tenha o nome da peça (product_name_snapshot). O nome é usado em vez
-- de product_id porque product_id fica vazio se a peça for apagada, e a
-- conversa precisa continuar válida.
--
-- Não altera nem apaga registros. Se alguma conversa existente não cumprir a
-- regra nova, o comando falha e nada é alterado (transação).
begin;

alter table public.conversations
  drop constraint if exists conversations_context_check;

alter table public.conversations
  add constraint conversations_context_check check (
    (order_id is not null and custom_order_request_id is null)
    or (order_id is null and custom_order_request_id is not null)
    or (order_id is null and custom_order_request_id is null and product_name_snapshot is not null)
  );

commit;
