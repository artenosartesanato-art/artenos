> **Redesenho de UX/UI (2026):** diagnóstico, sistema visual, validação e
> sandbox local estão em [`docs/redesign/`](docs/redesign/README.md).

# Conectar a Artenós ao Supabase

> **E-mails (esqueci minha senha, comprovantes):** configuração pelo Gmail em [`docs/EMAIL-GMAIL.md`](docs/EMAIL-GMAIL.md).

O projeto entregue não está conectado a nenhum banco. A integração fica isolada em `lib/supabase.ts`.

1. Crie um projeto no Supabase.
2. No painel, abra o SQL Editor e execute manualmente `supabase/schema.sql`.
3. Copie `.env.example` para `.env` ou `.env.local`.
4. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os valores públicos do projeto.
5. Pare e inicie novamente `npm run dev` sempre que alterar as variáveis de ambiente.

Se você já executou uma versão anterior de `schema.sql`, não execute esse arquivo novamente. Execute as correções específicas necessárias. Para proteger o fluxo de aprovação atual, execute `supabase/seguranca_aprovacao.sql` uma única vez.

Depois da segurança da aprovação, execute `supabase/administracao_aprovacao.sql` uma única vez. Ele cria o cadastro de administradores, a fila de solicitações dos artesãos e o histórico de auditoria. O arquivo não aprova nem rejeita cadastros automaticamente.

Para permitir que artesãos pendentes entrem apenas na área de acompanhamento, execute também `supabase/acesso_restrito_artesao.sql` uma única vez, depois dos arquivos de segurança, administração e sob encomenda. Esse script não muda o status de ninguém: ele centraliza a verificação de artesão aprovado e impede que uma conta pendente crie ou altere serviços de vendedor.

Para habilitar a área `/administracao`, execute `supabase/painel_administrativo.sql` depois de `administracao_aprovacao.sql`. Em seguida, cadastre a primeira proprietária em `public.admin_users` usando o comando comentado no final do arquivo. Apenas administradores ativos podem listar dados completos ou executar decisões. Aprovação, recusa, solicitação de correções, suspensão e reativação passam por uma função transacional e entram no histórico de auditoria.

Nunca coloque a `service_role` no navegador ou em uma variável iniciada por `NEXT_PUBLIC_`.

O cadastro usa Supabase Auth. Os dados complementares são enviados como `user_metadata`, mas o navegador não escolhe o status de aprovação. O trigger copia os dados para `public.profiles`, obtém o e-mail diretamente de `auth.users` e define o status no banco: clientes ficam ativos; artesãs ficam em `pending_review` ou `assisted_review`. Somente uma futura operação administrativa segura poderá mudar esse status para `active`.

Para comprovar que o endereço de e-mail realmente existe, mantenha a confirmação por e-mail ativada em **Authentication > Providers > Email** no painel do Supabase. A validação JavaScript bloqueia formatos incompletos, como `nome@gmail`, mas somente o link de confirmação comprova que a pessoa tem acesso à caixa de entrada.

## Integração de frete

1. Execute `supabase/dados_frete.sql` e depois `supabase/integracao_frete.sql` no SQL Editor.
2. Crie uma conta no Sandbox do Melhor Envio e gere um token com permissão de cálculo de frete.
3. Em **Supabase > Edge Functions > Secrets**, configure:
   - `MELHOR_ENVIO_TOKEN`: token do Melhor Envio;
   - `MELHOR_ENVIO_API_URL`: `https://sandbox.melhorenvio.com.br` durante os testes;
   - `MELHOR_ENVIO_USER_AGENT`: `Artenos (artenos.artesanato@gmail.com)`.
4. Publique `supabase/functions/calculate-shipping/index.ts` como a função `calculate-shipping`.

Com Supabase CLI, a publicação pode ser feita com:

```bash
supabase functions deploy calculate-shipping
```

O token é segredo do servidor. Nunca use `NEXT_PUBLIC_` e nunca coloque esse token no navegador. Para produção, gere credenciais próprias no ambiente oficial do Melhor Envio e altere `MELHOR_ENVIO_API_URL` para `https://www.melhorenvio.com.br`.
