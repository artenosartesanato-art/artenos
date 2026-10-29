# Privacidade e segurança: o que está implementado e o que configurar

A página `/privacidade` só promete o que está nesta lista. Se uma prática mudar,
atualize a página e `NEXT_PUBLIC_PRIVACY_UPDATED_AT`.

> A Política de Privacidade precisa ser revisada por advogado antes de ir ao ar.

## Implementado no código

| Prática | Onde |
|---|---|
| HTTPS obrigatório (redireciona `http://` atrás do proxy) e HSTS | `next.config.ts` (`HTTPS_REDIRECT=false` desliga o redirecionamento) |
| X-Frame-Options, `frame-ancestors`, nosniff, Referrer-Policy, Permissions-Policy | `next.config.ts` |
| CSP completa em modo Report-Only, com relatórios em `/api/csp-report` | `next.config.ts`; `CSP_ENFORCE=true` passa a bloquear |
| Senhas: hash bcrypt do Supabase Auth (a Artenós não guarda senha) | Supabase Auth |
| Segredos só no servidor (`MP_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASSWORD`, `TURNSTILE_SECRET_KEY`) | `.env.example`; nenhum com `NEXT_PUBLIC_` |
| CSRF: rotas POST só aceitam o próprio domínio (`Origin`) | `lib/request-guard.ts` em `/api/checkout/*`, `/api/ajuda`, `/api/conta/excluir`, `/api/registro-acesso` |
| Limite de envios no servidor: chat (20/min), avaliações (20/h), denúncias e orçamentos (10/h), Central de Ajuda (5/h por IP, 3/h por e-mail), exportação de dados (5/h) | `20261029_seguranca_privacidade.sql`, `20261029_central_ajuda.sql` |
| Login e cadastro: limite do Supabase Auth + limite local no navegador + Turnstile opcional | `lib/login-throttle.ts`, `components/turnstile-widget.tsx` |
| Registros de acesso (login, saída, troca de senha, exportação e exclusão) com IP e navegador por 12 meses | `access_logs`, `/api/registro-acesso`, `/api/cron/manutencao` |
| Exportar meus dados (JSON) e excluir minha conta (anonimização) | Meu perfil › Privacidade e dados; `/api/conta/exportar`, `/api/conta/excluir`, `anonymize_account` |
| Aviso de cookies com "Aceitar todos" / "Somente essenciais"; scripts opcionais só com aceite | `components/cookie-consent.tsx` (`OptionalScripts`) |
| Filtro de termos ofensivos e denúncias | `20261029_moderacao_chat.sql` |

## Configurar no Supabase (painel)

1. **Authentication → Rate Limits**: mantenha os limites de login, cadastro e e-mail ligados.
2. **Authentication → Attack Protection → CAPTCHA** (opcional): escolha Cloudflare Turnstile, cole a
   *secret key* e defina `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (e `TURNSTILE_SECRET_KEY` para a Central de Ajuda)
   no app. Ligue os dois juntos: com o CAPTCHA ativo no Supabase e sem a chave no app, o login falha.
3. **Authentication → Policies** de senha: mínimo de 8 caracteres (o app já exige).
4. Rode `supabase/auditoria_rls.sql` e confira: nenhuma tabela sem RLS e políticas de pedidos/mensagens
   sempre filtrando por `auth.uid()`.

## Agendador (cron)

Configure chamadas diárias, com o cabeçalho `Authorization: Bearer <CRON_SECRET>`:

- `GET /api/cron/manutencao` — apaga registros vencidos (acessos > 12 meses, tentativas bloqueadas > 6 meses);
- `GET /api/cron/avaliacoes` — pede avaliação de pedidos entregues há 3+ dias;
- `GET /api/payouts/process` — repasses (já existia).

Na Vercel, isso pode ser feito com Vercel Cron (`vercel.json`) ou por um agendador externo.

## CSP: como ligar o bloqueio

1. Publique com o padrão (Report-Only).
2. Faça compras de teste com Pix e cartão, abra a Central de Ajuda e o login.
3. Veja os avisos `[csp]` no log do servidor. Se aparecer um domínio legítimo bloqueado (ex.: novo domínio do
   Mercado Pago), inclua-o em `next.config.ts`.
4. Sem violações, defina `CSP_ENFORCE=true` e publique de novo.

## Dados que dependem de você

Razão social, CNPJ, endereço, e-mail e telefone de suporte, WhatsApp, horário, nome e e-mail do encarregado (DPO):
variáveis `NEXT_PUBLIC_COMPANY_*`, `NEXT_PUBLIC_SUPPORT_*` e `NEXT_PUBLIC_DPO_*`. Enquanto vazias, as páginas mostram "a definir".
Confirme também a região do Supabase e o provedor de hospedagem (seção 7 da política).
