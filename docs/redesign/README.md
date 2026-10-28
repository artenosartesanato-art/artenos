# Redesenho de UX/UI da Artenós

Branch: `FEAT/REDESIGN-UX-UI-ARTE-NOSSA` (base `main`).

| Documento | Conteúdo |
| --- | --- |
| [DIAGNOSTICO.md](DIAGNOSTICO.md) | Inventário de rotas, perfis, componentes e jornadas; tabela de problemas (evidência → impacto → prioridade → correção → validação). |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Direção de arte, tokens, componentes, movimento, som e o fluxo de referência de "adicionar ao carrinho". |
| [VALIDACAO.md](VALIDACAO.md) | Comandos e resultados, matriz de telas × perfis × larguras, acessibilidade, desempenho e limitações. |
| [SEGURANCA.md](SEGURANCA.md) | Achados de segurança registrados para a auditoria futura (não corrigidos aqui). |
| [sandbox/](sandbox/README.md) | Supabase local com dados de teste usado na auditoria. |
| [capturas/](capturas/) | Capturas antes × depois nas mesmas larguras. |

## Como rodar e revisar

1. Instale as dependências:

   ```bash
   npm ci
   ```

2. Configure `.env.local` apontando para um Supabase (de teste ou o sandbox
   local descrito em `sandbox/README.md`).
3. Rode os checks:

   ```bash
   npm run lint
   ```

   ```bash
   npm run typecheck
   ```

   ```bash
   npm test
   ```

   ```bash
   npm run build
   ```

4. Suba a aplicação:

   ```bash
   npm run dev
   ```

5. Testes de navegador (precisam de Playwright e do sandbox com as contas de
   teste; não fazem compras nem chamam serviços externos):

   ```bash
   BASE_URL=http://localhost:3000 node tests/e2e/journey.cjs
   ```

   ```bash
   BASE_URL=http://localhost:3000 node tests/e2e/auth.cjs
   ```

   ```bash
   BASE_URL=http://localhost:3000 node tests/e2e/interacoes.cjs
   ```

   ```bash
   BASE_URL=http://localhost:3000 node tests/e2e/mensagens.cjs
   ```

   ```bash
   node tests/e2e/audit.cjs http://localhost:3000 ./auditoria
   ```

   `audit.cjs` também precisa do pacote `axe-core` disponível no
   `NODE_PATH`.

## Roteiro de revisão sugerido (15 minutos)

1. Celular (390 px): abra o menu ☰, navegue para Categorias e use **Filtros**.
2. Toque numa peça, aumente a quantidade e **Adicionar**: veja a gaveta, o
   badge e a volta do foco ao fechar com Escape.
3. Ative **Sons da interface** no rodapé e adicione outra peça.
4. Carrinho: itens agrupados por loja, frete e subtotal de cada loja.
5. Pedidos: barra de progresso e selos de status.
6. Acesso: envie o login vazio, depois com senha errada; teste
   "Esqueci minha senha" e as setas nas abas.
7. Painel da artesã: mesmo cabeçalho e rodapé da vitrine, menu lateral no
   mesmo fundo do conteúdo; a foto no cabeçalho abre `/vendedor/perfil`.
8. Mensagens: no card de uma peça, toque no balão; envie uma pergunta e
   responda com a conta da artesã em outra janela.
9. Ative "Reduzir movimento" no sistema e recarregue: nada deve animar.

## Ações necessárias no Supabase

- (Opcional, recomendado) executar
  `supabase/migrations/20261028_vitrine_carrinho_contexto.sql` para mostrar a
  foto no carrinho e o link da loja no detalhe da peça. O front funciona sem
  ela.
- Incluir `https://SEU-DOMINIO/redefinir-senha` nas Redirect URLs do Auth
  para a recuperação de senha.
- Para zerar o histórico de mensagens (testes), use
  `supabase/zerar_mensagens.sql`: apaga só as mensagens e mantém as
  conversas. O `zerar_mensagens_teste.sql` também apaga as conversas.
- Para as conversas por peça: executar `supabase/conversas_produtos_topicos.sql`,
  `supabase/contexto_conversas_produtos.sql` e
  `supabase/permitir_conversas_por_produto.sql` (a regra
  `conversations_context_check` de produção só aceitava conversa de pedido ou
  encomenda e bloqueava a conversa sobre a peça), e confirmar que a
  tabela `messages` está na publicação `supabase_realtime` (feito em
  `supabase/mensagens.sql`). Sem isso, o ícone de mensagem abre a página,
  mas a conversa não é criada.
