-- Limpa somente o histórico de chat para reiniciar os testes.
-- Apaga mensagens e conversas (de pedidos, encomendas e produtos).
-- Preserva pedidos, encomendas, produtos e contas.
begin;
delete from public.messages;
delete from public.conversations;
commit;
