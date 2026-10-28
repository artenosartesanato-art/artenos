# Achados de segurança (para a auditoria futura)

Esta entrega **não** reformulou segurança, autenticação ou infraestrutura. As
proteções existentes (RLS, funções `security definer`, validação no servidor,
segredos fora do navegador) foram preservadas. Abaixo, o que foi notado
durante a auditoria de UX, sem correção aplicada, salvo indicação.

| # | Achado | Onde | Evidência | Recomendação |
| --- | --- | --- | --- | --- |
| 1 | Versão do Next.js com vulnerabilidade conhecida | `package.json` (`next@16.4.0`) | `next build` e `next dev` exibem aviso "Your version of Next.js is affected by a known security vulnerability" e recomendam `next upgrade --agent=security` | Atualizar o Next.js numa branch separada, rodar build, lint, testes e a auditoria de navegador. |
| 2 | Enumeração de CPF/CNPJ | `supabase/corrigir_cadastro.sql` — `is_registration_document_available` liberada para `anon` | Qualquer visitante pode perguntar se um documento já está cadastrado | Avaliar limite de taxa, captcha ou mover a checagem para dentro do cadastro (resposta única de erro). |
| 3 | Política de teste em pedidos | `supabase/mensagens.sql` cria "TESTE - cliente cria pedido" | É removida por `integracao_pagamento_frete_estoque.sql`; não foi possível confirmar o estado em produção | Confirmar no banco de produção que a política não existe. |
| 4 | Schema de produção não versionado | Tabelas e RPCs de produtos, carrinho, pedidos, loja e encomendas não estão no repositório | Ver `DIAGNOSTICO.md` | Versionar o schema real (migrações) para permitir revisão de RLS e grants. |
| 5 | Dados enviados a terceiro | CEP digitado é enviado do navegador para `viacep.com.br` | `components/customer-header.tsx`, `app/acesso/page.tsx`, `lib/supabase.ts` | Comportamento preexistente; avaliar menção na política de privacidade. |
| 6 | Redirecionamento após login | Novo parâmetro `?voltar=` | **Mitigado nesta entrega**: `lib/navigation.ts` aceita só caminhos internos (bloqueia `//host`, `https://`, `\`, controle e a própria `/acesso`), com testes em `tests/unit/navigation.test.ts` | Manter os testes ao alterar a regra. |
| 7 | Recuperação de senha | Nova tela `/redefinir-senha` | Usa só a API do Supabase Auth; a resposta de envio é neutra (não revela se o e-mail existe) | Cadastrar `https://SEU-DOMINIO/redefinir-senha` em **Authentication > URL Configuration > Redirect URLs** e revisar o modelo de e-mail. |
