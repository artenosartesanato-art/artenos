# Segurança

As proteções existentes (RLS, funções `security definer`, validação no
servidor, segredos fora do navegador) foram preservadas. A seção 1 descreve o
controle de sessão implementado a pedido; a seção 2 lista achados registrados
para a auditoria especializada.

## 1. Controle de sessão (implementado)

| Controle | Como funciona | Onde | Validação |
| --- | --- | --- | --- |
| Manter conectado | Opção no login (desmarcada na primeira vez). Marcada: sessão no `localStorage`, dura até sair. Desmarcada: sessão em cookies de sessão (`SameSite=Lax`, `Secure` em HTTPS), que somem ao fechar o navegador e valem para todas as abas | `lib/session.ts` (`authStorage`), `app/acesso/page.tsx` | e2e `sessao`: cookie × localStorage, nova aba conectada, "fechar navegador" desconecta |
| Inatividade | Sem "manter conectado": sai após 30 min sem uso; contas administrativas sempre após 15 min. Aviso 1 min antes ("Continuar conectado" / "Sair agora"). Atividade compartilhada entre abas | `components/session-guard.tsx` | e2e: aviso, continuar, saída com motivo |
| Sessão encerrada em outro lugar | Ao voltar para a aba, ao ficar visível e a cada 5 min a sessão é conferida no servidor (`getUser`). Se não existir mais (ex.: "sair de todos"), sai e explica | `components/session-guard.tsx` | e2e: outro aparelho perde o acesso |
| Saída em uma aba | As outras abas saem juntas; em rota protegida vão ao login com o motivo | `SessionGuard`, `PROTECTED_PREFIXES` | e2e |
| Sair de todos os aparelhos | Botão no perfil (confirmação) → `signOut({ scope: "global" })` | `app/perfil/page.tsx` | e2e |
| Troca de senha | Depois de trocar, as sessões dos outros aparelhos são encerradas (`scope: "others"`) | `app/perfil/page.tsx` | código |
| Limpeza ao sair | Toda saída passa por `endSession()`: encerra no servidor e apaga intenções/rascunhos da Artenós no `sessionStorage`; carrinho, favoritos, notificações e foto em memória são zerados pelo provedor | `lib/session.ts`, `components/marketplace-state.tsx` | e2e: tokens apagados do navegador |
| Limite de tentativas | 5 senhas erradas em 10 min para o mesmo e-mail bloqueiam por 1 min (dobra a cada bloqueio, até 15 min), sem chamar o servidor. Guarda só um hash do e-mail. Camada extra: o Supabase também limita no servidor | `lib/login-throttle.ts` | testes unitários + e2e (0 chamadas no bloqueio) |
| Motivo no login | `/acesso?motivo=inatividade|expirada|todos|saiu` mostra o porquê da saída | `app/acesso/page.tsx` | e2e |
| Cabeçalhos HTTP | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (câmera, microfone, localização), HSTS 2 anos, COOP | `next.config.ts` | e2e |

Limites conhecidos: a sessão continua acessível a JavaScript da própria página
(localStorage ou cookie não-HttpOnly), como no padrão do supabase-js; tokens
HttpOnly exigiriam autenticação no servidor (`@supabase/ssr` + middleware),
uma mudança de arquitetura. O limite de tentativas no navegador pode ser
contornado por quem chama a API direto; o limite real é o do Supabase Auth
(ajustável em Authentication → Rate Limits). Não há CSP completa de scripts
para não quebrar o pagamento.

## 2. Achados registrados (para a auditoria especializada)

| # | Achado | Onde | Evidência | Recomendação |
| --- | --- | --- | --- | --- |
| 1 | Versão do Next.js com vulnerabilidade conhecida | `package.json` (`next@16.4.0`) | `next build` e `next dev` exibem aviso "Your version of Next.js is affected by a known security vulnerability" e recomendam `next upgrade --agent=security` | Atualizar o Next.js numa branch separada, rodar build, lint, testes e a auditoria de navegador. |
| 2 | Enumeração de CPF/CNPJ | `supabase/corrigir_cadastro.sql` — `is_registration_document_available` liberada para `anon` | Qualquer visitante pode perguntar se um documento já está cadastrado | Avaliar limite de taxa, captcha ou mover a checagem para dentro do cadastro (resposta única de erro). |
| 3 | Política de teste em pedidos | `supabase/mensagens.sql` cria "TESTE - cliente cria pedido" | É removida por `integracao_pagamento_frete_estoque.sql`; não foi possível confirmar o estado em produção | Confirmar no banco de produção que a política não existe. |
| 4 | Schema de produção não versionado | Tabelas e RPCs de produtos, carrinho, pedidos, loja e encomendas não estão no repositório | Ver `DIAGNOSTICO.md` | Versionar o schema real (migrações) para permitir revisão de RLS e grants. |
| 5 | Dados enviados a terceiro | CEP digitado é enviado do navegador para `viacep.com.br` | `components/customer-header.tsx`, `app/acesso/page.tsx`, `lib/supabase.ts` | Comportamento preexistente; avaliar menção na política de privacidade. |
| 6 | Redirecionamento após login | Novo parâmetro `?voltar=` | **Mitigado nesta entrega**: `lib/navigation.ts` aceita só caminhos internos (bloqueia `//host`, `https://`, `\`, controle e a própria `/acesso`), com testes em `tests/unit/navigation.test.ts` | Manter os testes ao alterar a regra. |
| 7 | Recuperação de senha | Nova tela `/redefinir-senha` | Usa só a API do Supabase Auth; a resposta de envio é neutra (não revela se o e-mail existe) | Cadastrar `https://SEU-DOMINIO/redefinir-senha` em **Authentication > URL Configuration > Redirect URLs** e revisar o modelo de e-mail. |
| 8 | Leitura pública de peças | Sandbox | A policy de insert de `storefront_favorites` confere a peça com `EXISTS` em `products`; no sandbox não havia leitura pública e nenhum favorito era gravado | Confirmar em produção a policy de leitura de `products` para peças ativas de lojas públicas (o sandbox foi alinhado a isso). |
