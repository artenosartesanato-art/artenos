# Validação

Ambiente: container Linux, Node 22.22, Chromium 1243 (Playwright), Supabase
local (Docker) com os scripts do repositório + reconstrução em `sandbox/`.
"Antes" = `main` (`25e58dd`) em build de produção na porta 3001; "depois" =
esta branch em build de produção na porta 3002; mesmo banco e mesmos dados.

## 1. Comandos e resultados

| Comando | Antes | Depois |
| --- | --- | --- |
| `npm run lint` | 4 erros, 29 avisos | **0 erros**, 14 avisos (`<img>` em imagens remotas/blob e dependências de hooks preexistentes) |
| `npm run typecheck` (`tsc --noEmit`) | ok | ok |
| `npm test` | não existia | **9/9** testes passando |
| `npm run build` | ok* | ok* |
| `tests/e2e/audit.cjs` (37 rotas × 5 larguras) | 1.205 ocorrências axe em 390/1440 px, 1 tela com overflow | **0** ocorrências, **0** overflow, **0** erros de console em 185 combinações |
| `audit.cjs` após a segunda rodada (cabeçalho/rodapé únicos, painel, acesso, mensagens) | — | **0** ocorrências axe, **0** overflow em 185 combinações; erros de console só no 404 (esperado) e no frete do carrinho (Edge Function fora do sandbox) |
| `audit.cjs` após as notificações (390 e 1440 px, sininho no cabeçalho) | — | **0** ocorrências axe, **0** overflow em 74 combinações; console só com o 404 esperado e o frete do sandbox |
| `audit.cjs` após o enquadramento da foto e a correção dos diálogos no celular (390 e 1440 px) | — | **0** ocorrências axe, **0** overflow em 74 combinações; console só com o 404 esperado e o frete do sandbox |
| `audit.cjs` após desempenho, visitante e sessão (390 e 1440 px) | — | **0** ocorrências axe, **0** overflow em 74 combinações; console só com o 404 esperado |
| `audit.cjs` com movimento reduzido (todo conteúdo visível) | — | **0** ocorrências / 74 combinações (390 e 1440 px) |
| `audit.cjs` após orçamento, chips, lojas na busca, filtro por UF, "Como funciona" e alinhamento do cadastro (390 e 1440 px, movimento reduzido) | — | **0** ocorrências axe, **0** overflow em 76 combinações; console só com o 404 esperado e o frete do sandbox (Edge Function ausente) |
| Alinhamento do cadastro (cliente e vendedor, 1440 px): topo e altura de cada campo comparados por linha da grade | — | **0** linhas desalinhadas (CPF × Telefone, Senha × Confirme, CEP × UF…) |
| Categorias da home no celular (390 px) | — | 9 blocos em grade 3×3, "Ver todas as categorias (15)" mostra os 15; sem rolagem lateral |
| `tests/e2e/mensagens-vendedor.cjs` | — | ok (10/10): `/mensagens` leva a artesã ao painel com a mesma conversa; links do cabeçalho e rodapé; compra de outra loja aberta no painel ("Sua compra"); com o Realtime bloqueado o aviso chega em até 40 s; sininho na cor do texto |
| `tests/e2e/journey.cjs` (390 e 1440 px) | — | ok |
| `tests/e2e/auth.cjs` | — | ok (inclui cadastro real no Supabase local) |
| `tests/e2e/interacoes.cjs` | — | ok |
| `tests/e2e/mensagens.cjs` (cliente × artesã, Realtime ligado) | — | ok: envio, recebimento em tempo real nos dois sentidos, indicação da peça, conversa reaproveitada |

\* `next build` e `next dev` param na primeira execução com o aviso de
vulnerabilidade do Next.js 16.4.0 e seguem na segunda (ver `SEGURANCA.md`).

## 2. Matriz de telas e jornadas

Larguras: 360, 390, 768, 1024 e 1440 px em todas as rotas da auditoria
automática. "Estados" lista o que foi exercitado de fato.

| Tela/jornada | Perfil | Estados testados | Resultado | Evidência | Pendência |
| --- | --- | --- | --- | --- | --- |
| Home | visitante, cliente | carregando, com dados, erro (código) | ok | `capturas/home-*.jpg`, auditoria | — |
| Menu mobile | todos | abrir, navegar, Escape, foco | ok | `capturas/novo-menu-produto-gaveta-390.jpg`, `journey` | — |
| Categorias e busca | visitante | com resultado, sem resultado + sugestões, filtros em gaveta, ordenar | ok | `capturas/categorias-*.jpg` | Paginação acima de 24 itens não exercitada (seed com 13 peças) |
| Detalhe da peça | cliente | quantidade, limite de estoque, esgotado, frete, adicionar, favoritar | ok | `journey` | Link para a loja depende da migração opcional |
| Adicionar ao carrinho | cliente, visitante | sucesso, clique duplo, estoque insuficiente, teclado, sem sessão | ok | `journey`, `interacoes` | — |
| Carrinho | cliente | vazio, com itens, quantidade, remover, frete indisponível | ok | `j_5_carrinho` | Cotação real do Melhor Envio não testada |
| Checkout/pagamento | cliente | — | **não validado** | código | Requer Mercado Pago sandbox e Edge Function |
| Pedidos | cliente | 3 status, filtros, busca, detalhes | ok | `capturas/pedidos-390.jpg` | — |
| Favoritos | cliente | vazio, com itens, remover, filtro | ok | auditoria | — |
| Lojas e loja | visitante | lista, filtro, loja com capa, loja inexistente | ok | `capturas/loja-1440.jpg` | — |
| Sob encomenda | visitante, cliente | lista, convite de login, formulário (render) | ok parcial | auditoria | Envio de solicitação não exercitado |
| Mensagens por peça | visitante, cliente, artesã | ícone no card e no detalhe, login com retorno, conversa nova com texto sugerido, envio, recebimento em tempo real, resposta, reabertura | ok | `mensagens.cjs` | Validado contra o sandbox com `conversas_produtos_topicos.sql` e `contexto_conversas_produtos.sql`; em produção, a regra `conversations_context_check` bloqueava a conversa; corrigida por `supabase/permitir_conversas_por_produto.sql`, validado no sandbox com a mesma regra de produção (conversa de peça aceita; conversa sem contexto e pedido + encomenda juntos continuam recusados) |
| Cabeçalho e rodapé | todos | 21 rotas × 5 perfis | ok | medição de caixas | — |
| Mensagens (novo layout) | cliente, artesã | lista, busca, filtros, conversa vazia com sugestões, histórico agrupado por dia e remetente, resposta com citação, Enter/Shift+Enter, Escape no painel de sugestões, celular (lista ↔ conversa) | ok | e2e `mensagens`, axe 0 em 390/1440, capturas | — |
| Notificações | cliente, artesã | mensagem nova (sininho, 2 notas, aviso, título da aba), abrir pelo painel, conversa aberta (1 nota, sem acumular), peça editada (silêncio), pedido atualizado (3 notas, aviso, lido ao abrir Pedidos), som desligado; no banco: rastreio, previsão, nota fiscal, venda paga, encomenda (resposta e cancelamento), mudança interna sem aviso, permissões | ok | e2e `notificacoes`, testes SQL, axe 0 no painel 390/1440 | Navegadores só tocam som depois do primeiro clique/tecla na página; o aviso visual aparece mesmo antes |
| Foto de perfil (enquadramento) | cliente (1280 px), artesã (390 px, toque) | escolher foto, Escape cancela, arrastar + zoom, salvar 512×512, reenquadrar a partir do original 1200×800, setas do teclado, foto no cabeçalho, Storage só com foto atual + original, axe no editor | ok | e2e `foto-perfil` (pixel central vermelho/azul) | Pinça testada só pela lógica (testes unitários); sem dispositivo físico |
| Visitante (carrinho e favoritos) | visitante → cliente | adicionar e favoritar sem login, páginas de carrinho/favoritos, quantidade, recarregar apaga, entrar leva para a conta, contador da conta | ok | e2e `visitante` (14) | Levar itens ao criar conta exige confirmar o e-mail na mesma aba; se a pessoa sair do site para confirmar, os itens se perdem (memória da aba, como pedido) |
| Controle de sessão | cliente, loja | cookie × localStorage, nova aba, fechar navegador, aviso e saída por inatividade, motivo no login, aparelho lembrado, saída entre abas, sair de todos os aparelhos, limite de tentativas, cabeçalhos | ok | e2e `sessao` (16), testes unitários | Inatividade testada adiantando o relógio da última atividade (não 30 min reais); limite de 15 min do admin pela lógica |
| Zerar chat | — | `zerar_mensagens.sql` no sandbox | ok | 0 mensagens e 0 conversas; conversa de peça (balão) e de pedido (`start_conversation`) recriadas; e2e `mensagens` passa depois | Recriação de conversa de encomenda não exercitada (sandbox sem encomendas) |
| Login | visitante | vazio, senha errada, sucesso, retorno ao destino | ok | `capturas/acesso-390.jpg`, `auth` | — |
| Cadastro de cliente | visitante | erros por campo, resumo, sucesso | ok | `auth` | ViaCEP simulado no teste (bloqueado na rede do ambiente) |
| Cadastro de artesã | visitante | render e validação | ok parcial | auditoria | Envio não exercitado |
| Recuperação de senha | visitante | envio, resposta neutra, link inválido | ok parcial | `auth` | Troca da senha pelo link não testada (sem servidor de e-mail) |
| Perfil | cliente | leitura | ok parcial | auditoria | Upload de foto e troca de e-mail não exercitados |
| Cadastro em análise | artesã pendente | leitura | ok | auditoria | — |
| Painel da artesã | artesã | visão geral com dados, menu mobile | ok | `capturas/vendedor-*.jpg` | — |
| Catálogo, loja, vendas, encomendas, repasses, precificação | artesã | render e acessibilidade | ok parcial | auditoria | Criação/edição de produto, upload e atualização de status não exercitados |
| Administração | admin | fila e tarifa | ok parcial | auditoria | Decisões de aprovação não exercitadas |
| 404 | todos | rota inexistente | ok | `capturas/404-1440.jpg` | — |
| Movimento reduzido | todos | animações e reveal desligados | ok | `interacoes` | — |
| Som | cliente | padrão desligado, persistência | ok | `interacoes` | Audição não verificável em ambiente headless |

## 3. Acessibilidade (WCAG 2.2 AA, escopo alterado)

- Contraste: tokens AA; axe sem violações em todas as rotas e larguras.
- Foco visível em todos os controles; `scroll-padding-top` impede que o
  cabeçalho fixo cubra o elemento focado (2.4.11).
- Diálogos e gavetas: `role="dialog"`, `aria-modal`, foco preso, Escape,
  fundo `inert`, retorno do foco (validado por teclado).
- Formulários: rótulos visíveis, `autocomplete`, erro por campo com
  `aria-invalid` + `aria-describedby`, resumo de erros focado.
- Estados não dependem só de cor; áreas de toque principais ≥ 44 px.
- Link "Pular para o conteúdo" em todas as áreas.
- Zoom de 200%: aproximado pelas larguras de 768 e 390 px da auditoria (uma
  tela de 1440 px com 200% equivale a ~720 px), sem overflow nem texto cortado.

## 4. Desempenho (Lighthouse 12.2.1)

### 4.1 Rodada de desempenho (imagens, servidor e CLS)

Mesmas condições (mobile, throttling simulado, CPU 4×, 3 execuções, mediana),
build de produção local com o Supabase do sandbox e dados reais.

| Rota | Perf. antes → depois | LCP | TBT | CLS | Peso |
| --- | --- | --- | --- | --- | --- |
| `/` | 66 → 80 | 4,07 → 3,26 s | 1.126 → 508 ms | 0 → 0 | 1.156 → 667 KB |
| `/categorias` | 56 → 88 | 7,09 → 2,77 s | 879 → 342 ms | 0 → 0 | 1.254 → 650 KB |
| `/loja` | 35 → 79 | 6,12 → 3,67 s | 818 → 256 ms | 0,757 → 0 | 786 → 616 KB |
| `/lojas` | 70 → 90 | 4,91 → 2,97 s | 466 → 227 ms | 0 → 0 | 609 → 612 KB |

Versão final (com carrinho de visitante e controle de sessão), duas rodadas
de 3 execuções: `/` 70 e 71, `/categorias` 83 e 80, `/loja` 71 e 92, `/lojas`
81 e 86; CLS 0 em todas; peso 640–699 KB. A variação entre rodadas chegou a
21 pontos (`/loja`). Home e categorias ficaram cerca de 8 pontos abaixo da
medição anterior às duas funções (+32 KB de JavaScript na home); continuam
acima do "antes" (66 e 56).

Perfil de CPU sem throttling: cerca de 150 ms de script e 330 ms de estilo,
layout e pintura na abertura da home; o restante do TBT medido vem da
simulação de CPU 4× do Lighthouse.

Custos e decisões: o otimizador de imagens roda na Vercel (há cota de
transformações por plano; com cache de 31 dias e 7 larguras, cada foto gera
poucas versões). Para desligar sem novo deploy de código, defina
`NEXT_PUBLIC_IMAGE_OPTIMIZATION=off` e faça um novo build.

### 4.2 Primeira rodada

Condições: Lighthouse padrão (mobile, throttling simulado, CPU 4×), build de
produção local, 3 execuções, mediana. Uma execução isolada não representa
usuários reais; a variação entre execuções chegou a 20 pontos.

| Rota | Perf. antes → depois | LCP | TBT | Peso | A11y |
| --- | --- | --- | --- | --- | --- |
| `/` | 85 → 70 | 4,1 s → 4,2 s | 309 → 657 ms | 1.857 → 1.161 KB | 96 → 100 |
| `/categorias` | 85 → 62 | 4,0 s → 7,1 s | 158 → 559 ms | 1.987 → 1.258 KB | 96 → 100 |
| `/lojas` | 68 → 76 | 8,6 s → 4,9 s | 326 → 318 ms | 1.358 → 626 KB | 96 → 100 |

O que melhorou: peso total (fonte de texto 1,47 MB → 20 KB), FCP, CLS (0),
acessibilidade e `/lojas`.

O que piorou e por quê:

- **LCP de `/categorias`**: o elemento do LCP passou a ser a primeira foto de
  peça, agora em destaque (borda a borda). As fotos são servidas no tamanho
  original do upload, depois que os dados chegam pelo cliente. Correção
  recomendada: servir imagens redimensionadas (otimizador do `next/image` ou
  transformação de imagens do Supabase Storage). Isso tem custo de
  hospedagem e ficou como decisão pendente.
- **TBT nas páginas com grade de produtos**: medido também com throttling
  real (DevTools, 3 execuções): `/categorias` ficou equivalente (≈ 680–800 ms
  antes × 706–747 ms depois) e a home subiu ≈ 20% (≈ 670 → 850 ms). Foram
  corrigidos durante a validação: layout forçado em sequência no scroll
  reveal (35 layouts numa tarefa), valor do contexto global sem memoização,
  diálogos de detalhe montados em todos os cards e prefetch de links de
  lista. O restante não foi atribuído com segurança a um componente; o
  próximo passo é carregar os dados da vitrine no servidor (hoje tudo é
  buscado no navegador).

## 5. Limitações

- O schema de produção não está no repositório; parte das RPCs foi
  reconstruída a partir do código (ver `sandbox/README.md`). Telas que
  dependem dessas RPCs foram validadas contra a reconstrução, não contra a
  produção.
- Não foram testados: pagamento (Mercado Pago), cotação de frete real
  (Melhor Envio), e-mails (Resend/Auth) e uploads. Realtime foi testado só
  no sandbox local.
- Imagens de produto do sandbox são ilustrações geradas localmente; os hosts
  de fotos externos estavam bloqueados no ambiente.
- Fotos reais das categorias: não incluídas. As APIs de imagens livres
  (Wikimedia Commons/Wikipédia) responderam 429 (limite de requisições)
  para o IP deste ambiente e o Openverse não respondeu; nenhuma imagem foi
  baixada contornando bloqueios. As categorias sem foto continuam com o
  ícone.
- Nenhuma compra real, e-mail real ou alteração em dados de produção foi
  feita.
