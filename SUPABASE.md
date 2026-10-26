# Conectar a Artenós ao Supabase

O projeto entregue não está conectado a nenhum banco. A integração fica isolada em `lib/supabase.ts`.

1. Crie um projeto no Supabase.
2. No painel, abra o SQL Editor e execute manualmente `supabase/schema.sql`.
3. Copie `.env.example` para `.env` ou `.env.local`.
4. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os valores públicos do projeto.
5. Pare e inicie novamente `npm run dev` sempre que alterar as variáveis de ambiente.

Se você já executou uma versão anterior de `schema.sql`, não execute esse arquivo novamente. Execute apenas `supabase/migrations/20261009_add_profile_email.sql` para criar a coluna de e-mail, preencher os cadastros existentes e atualizar o trigger.

Para corrigir o favorito e ativar o controle de estoque no carrinho, execute `supabase/corrigir_favoritos_estoque_carrinho.sql` depois dos scripts de vitrine, mensagens e pedidos. Ele não cria produtos: valida as quantidades e confirma o saldo de forma atômica no checkout.

Para permitir pesquisas com pequenos erros de digitação, execute `supabase/busca_aproximada.sql` depois de `vitrine_cliente.sql` e do script de categorias. O arquivo ativa `pg_trgm` e atualiza somente a função pública de busca.

A área `/administracao` já está presente no código. Para preparar o banco, execute nesta ordem: `supabase/seguranca_aprovacao.sql`, `supabase/administracao_aprovacao.sql` e `supabase/painel_administrativo.sql`. Esses arquivos criam a fila, os administradores, as decisões e a auditoria. O disparo externo de e-mails será configurado separadamente e não foi ativado nesta etapa.

Se o painel do Supabase mostrar `Database error creating new user` ao criar a primeira administradora, execute `supabase/permitir_usuario_administrativo.sql`. Depois crie o usuário em Authentication e vincule seu ID em `public.admin_users` com o comando comentado no final do arquivo.

Se um artesão foi ativado diretamente em `profiles`, execute `supabase/sincronizar_aprovacao_artesao.sql`. Ele corrige a fila existente e instala um trigger para que futuras alterações manuais de aprovação também apareçam corretamente no painel administrativo.

Nunca coloque a `service_role` no navegador ou em uma variável iniciada por `NEXT_PUBLIC_`.

O cadastro usa Supabase Auth. Os dados complementares são enviados como `user_metadata`; o trigger do arquivo SQL os copia para `public.profiles` e copia o e-mail confirmado diretamente de `auth.users`. Clientes ficam ativos. Artesãs ficam em `pending_review` ou `assisted_review` até que você altere o status para `active` em um painel administrativo ou operação segura no servidor.

Para comprovar que o endereço de e-mail realmente existe, mantenha a confirmação por e-mail ativada em **Authentication > Providers > Email** no painel do Supabase. A validação JavaScript bloqueia formatos incompletos, como `nome@gmail`, mas somente o link de confirmação comprova que a pessoa tem acesso à caixa de entrada.

## Pagamento com Mercado Pago

As tabelas `checkouts`, `checkout_items`, `payouts` e `payout_accounts` já aparecem no schema compartilhado. Nesse caso, execute **somente** [a migração de integração](supabase/integracao_pagamento_frete_estoque.sql) no SQL Editor. Se estiver montando outro banco do zero, execute `supabase/pagamentos.sql` depois dos scripts de pedidos/carrinho e antes da migração. Nunca rode `pagamentos.sql` de novo num banco que já possua essas tabelas.

A migração adiciona o endereço, os fretes e a tarifa congelados ao checkout, reserva estoque de forma atômica, cria pedidos completos somente na confirmação do Mercado Pago e remove a possibilidade de criar pedidos pela política antiga de teste. Ela substitui as funções `create_checkout_from_cart` e `finalize_checkout`, desativa `checkout_cart` para usuários e adiciona as rotinas de conciliação/cancelamento. Não altera pedidos ou pagamentos antigos.

As credenciais de pagamento do ZIP foram incorporadas ao `.env` local principal, que é ignorado pelo Git. Confira no painel de hospedagem as mesmas variáveis de `.env.example`: `MP_ACCESS_TOKEN`, `NEXT_PUBLIC_MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `PAYOUT_HOLD_DAYS`, `PAYOUTS_MODE`, `RESEND_API_KEY`, `EMAIL_FROM` e `CRON_SECRET`. Defina `NEXT_PUBLIC_SITE_URL` para o endereço HTTPS público do aplicativo e configure o webhook de pagamentos do Mercado Pago em `https://SEU-DOMINIO/api/webhooks/mercadopago`. A `service_role` e o token privado nunca devem usar o prefixo `NEXT_PUBLIC_`. Reinicie o servidor depois de mudar o `.env`.

**Pendente para produção:** o `NEXT_PUBLIC_SITE_URL` recebido no ZIP não é HTTPS e o `MP_WEBHOOK_SECRET` veio vazio. Coloque o domínio HTTPS da instalação Next.js na primeira variável e copie o segredo da assinatura configurada no painel de webhooks do Mercado Pago para a segunda. Até lá, o webhook retorna erro 503; a consulta de status pela página funciona enquanto o comprador a mantém aberta. Não use a URL da antiga exportação estática como destino do webhook.

Agora o Next.js precisa rodar como aplicação com servidor (`npm run build` e `npm run start`, ou projeto Next.js na Vercel). O antigo modo de exportação estática não executa as rotas de cobrança, sincronização e webhook. O frete selecionado é somado ao valor enviado ao Mercado Pago e aparece no resumo e no comprovante. O Pix exibe QR Code e código copia e cola quando o provedor os retornar.

O modo `PAYOUTS_MODE=off` deixa os repasses para conferência manual. O modo `test` é somente para simulação do provedor; repasse automático real não foi implementado no código recebido. Com domínio de envio não verificado, o remetente de teste do Resend só entrega nas condições permitidas pela conta Resend.

Teste com credenciais de **teste** do Mercado Pago: adicione um produto com estoque, escolha o frete no carrinho, entre em pagamento, gere o Pix e confira total, QR Code e status. Só após a aprovação confira `orders`, `order_items`, `payouts` e `products.stock`. Um checkout iniciado mantém a reserva até confirmação/cancelamento; em erro de rede, atualize o status antes de cancelar.
