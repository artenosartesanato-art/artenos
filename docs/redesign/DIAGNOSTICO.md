# Diagnóstico de UX/UI e funcionamento — Artenós

Data: 28/10/2026 · Branch: `FEAT/REDESIGN-UX-UI-ARTE-NOSSA` · Base: `main` (`25e58dd`)

Legenda de evidência: **[N]** observado no navegador (Playwright + axe-core
sobre o Supabase local de teste) · **[C]** identificado apenas no código.

## 1. Stack e ambiente

- Next.js 16.4 (App Router, páginas client-side), React 19, TypeScript, CSS
  por rota, Bootstrap Icons locais, `sonner` para avisos.
- Supabase (Auth, Postgres/RPC, Storage, Edge Function `calculate-shipping`),
  Mercado Pago (Payment Brick + webhook), Resend (comprovantes), ViaCEP,
  Melhor Envio (frete, via Edge Function).
- Comandos: `npm run dev | build | start | lint`; adicionados `npm test` e
  `npm run typecheck`. Não havia testes automatizados.
- O repositório **não contém** o schema completo: faltam `products`,
  `cart_items`, `order_items`, `artisan_store_settings`, encomendas e várias
  RPCs (`list_my_orders`, `create_my_product`, `get_public_artisan_store`...).
  Para auditar com dados, foi montado um Supabase local (Docker) com todos os
  scripts do repositório e uma reconstrução mínima das partes ausentes,
  inferida do código (ver `sandbox/`). Não é o banco de produção.

## 2. Inventário

### Rotas e telas

| Rota | Perfil | Situação na auditoria |
| --- | --- | --- |
| `/` | todos | [N] validada |
| `/categorias` (`?busca`, `?categoria`, `?pronta`, `?min`, `?max`, `?ordem`) | todos | [N] validada (busca com e sem resultado) |
| `/lojas` | todos | [N] validada |
| `/loja?id=` | todos | [N] validada (loja existente e inexistente) |
| `/sob-encomenda` | todos; artesã vê atalho para o painel | [N] validada (lista, convite de login) |
| `/acesso` (`?aba=entrar|cliente|artesa`, `?voltar=`) | visitante | [N] validada: login, erros, cadastro de cliente concluído, recuperação |
| `/redefinir-senha` (nova) | link de recuperação | [N] estado "link inválido"; troca de senha **não** validada (sem servidor de e-mail no sandbox) |
| `/carrinho` | cliente | [N] validada (itens, quantidade, remoção, erro de frete); cotação real **não** validada |
| `/pagamento/[checkoutId]` | cliente | [C] apenas código: depende de Mercado Pago e da Edge Function |
| `/pedidos` | cliente | [N] validada com 3 pedidos (preparação, enviado, entregue) |
| `/favoritos` | cliente | [N] validada |
| `/mensagens` | cliente | [N] validada (lista e conversa) |
| `/perfil` | cliente | [N] validada (leitura); upload de foto não exercitado |
| `/repasses` | cliente → redireciona | [N] redireciona para `/` |
| `/cadastro-em-analise` | artesã pendente | [N] validada |
| `/vendedor` | artesã aprovada | [N] validada |
| `/vendedor/minha-loja`, `/catalogo`, `/encomendas`, `/vendas`, `/repasses`, `/precificacao`, `/mensagens`, `/perfil` | artesã aprovada | [N] renderização e acessibilidade; edição/salvamento exercitado apenas no catálogo (leitura) |
| `/administracao` | administradora | [N] validada (fila, tarifa) |
| `/termos`, `/privacidade` | todos | [N] validadas |
| Rota inexistente | todos | [N] antes: 404 padrão do Next; agora página própria |
| `/api/checkout/*`, `/api/webhooks/mercadopago`, `/api/payouts/process` | servidor | [C] fora do escopo visual |

### Perfis

Visitante · cliente (`account_type=client`) · artesã pendente
(`pending_review`/`assisted_review`) · artesã aprovada (`active`) ·
administradora (`admin_users`). Artesã aprovada também compra.

### Componentes compartilhados (antes → depois)

`CustomerHeader`, `StandaloneCustomerHeader`, `CustomerFooter`,
`MarketplaceProductCard`, `ProductDetailsButton`, `MarketplaceProvider`,
`marketplace-feedback`, `ScrollReveal`, `SellerShell`, `MessagesWorkspace`,
`BrandLogo`, `icons` → somados `ui/Dialog`, `StorefrontActionsProvider`
(carrinho, favoritos, convite de login), `SoundToggle`, utilitários
`lib/navigation`, `lib/cart-groups`, `lib/order-progress`,
`lib/registration-validation`, `lib/ui-sound`.

### Jornadas principais

1. Descobrir → ver peça → favoritar/adicionar → carrinho → frete → pagamento → pedido → mensagens.
2. Cadastro de cliente → confirmação de e-mail → login → retorno ao destino.
3. Cadastro de artesã → análise → aprovação → painel → catálogo → vendas.
4. Encomenda: escolher opção → pedir orçamento → resposta da artesã → conversa.
5. Administração: fila de solicitações → decisão → auditoria; tarifa.

### Estados verificados

Carregando (esqueletos), vazio (carrinho, favoritos, pedidos, busca sem
resultado, loja sem peças), sucesso (gaveta, cadastro, recuperação), erro
(frete indisponível, credenciais, validação, loja inexistente),
indisponível (peça esgotada, loja em pausa), sem sessão (convites de login).

## 3. Problemas encontrados

Prioridade: **P0** bloqueia uso · **P1** consistência/funcionamento · **P2** refinamento.

| # | Tela/componente | Evidência | Impacto | Pri. | Correção | Validação |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cabeçalho (mobile) | [N] ícone de menu era decorativo; links cortados ("Fa…") em rolagem horizontal | Favoritos, Pedidos e Mensagens inacessíveis no celular | P0 | Botão de menu real com gaveta acessível | e2e `journey`: abre, Escape devolve o foco |
| 2 | Login (mobile) | [N] painel da marca de ~880 px empurrava o formulário para baixo da dobra | Login exigia rolagem longa | P0 | Painel compacto no celular | botão "Entrar" a 720 px num viewport de 844 px |
| 3 | Categorias (mobile) | [N] filtros ocupavam a tela inteira antes dos resultados | Resultados escondidos | P0 | Filtros em gaveta com contagem de ativos | screenshot 390 px |
| 4 | Detalhe da peça | [C][N] modal sem botão de compra, sem foco preso nem retorno de foco | Não dava para comprar a partir do detalhe; teclado se perdia | P0 | Diálogo novo com quantidade, compra, favorito e prazos | e2e: adiciona 2 unidades e confirma badge |
| 5 | Adição ao carrinho | [C] confirmação por aviso flutuante; sem resumo nem foco | Pouca clareza do que aconteceu | P1 | Gaveta com item, subtotal e ações | e2e + screenshot |
| 6 | Contraste geral | [N] axe: 13–35 violações de contraste por tela (argila sobre claro, pêssego sobre musgo) | Leitura difícil; falha WCAG 1.4.3 | P1 | Tokens AA e migração dos CSS | axe: 0 nas telas públicas e do comprador |
| 7 | Menu da artesã | [N] "Comprar na Artenós" sempre ativo (`startsWith("/")`) | Navegação confusa | P1 | Regra de rota exata | screenshot do painel |
| 8 | Pedidos | [N] contadores mostravam "I" no lugar de "1" (algarismos antigos do Cormorant) | Números ilegíveis | P1 | `lining-nums` em títulos e valores | screenshot |
| 9 | Pedidos | [N] todos os status com a mesma cor; overflow horizontal a 390 px | Status indistinguíveis; rolagem lateral | P1 | Selos semânticos com texto, barra de progresso, abas roláveis | auditoria: sem overflow |
| 10 | Busca nas telas de conta | [C] em Pedidos, Favoritos e Sob encomenda a busca do cabeçalho filtrava a própria página | Mesma caixa com dois comportamentos | P1 | Busca global sempre leva ao catálogo; filtros locais na página | navegação manual |
| 11 | CEP | [C] lógica de CEP duplicada em 7 páginas, com mensagens diferentes | Inconsistência e consultas repetidas | P1 | CEP centralizado no `MarketplaceProvider` | header em todas as telas |
| 12 | Login | [C] "Manter conectado" não tinha efeito (sessão sempre persistida) | Promessa falsa | P1 | Removido | — |
| 13 | Login | [C][N] sem recuperação de senha | Conta bloqueada sem saída | P1 | "Esqueci minha senha" + `/redefinir-senha` (Supabase Auth) | e2e: envio e resposta neutra |
| 14 | Formulários de acesso | [N] erros só em aviso flutuante; abas sem navegação por setas | Correção difícil; teclado limitado | P1 | Erro por campo, resumo focado, abas ARIA completas | e2e `auth` |
| 15 | Retorno pós-login | [C] só existia para favorito | Usuária perdia o contexto | P1 | `?voltar=` com validação de caminho interno | teste unitário + e2e |
| 16 | Mensagens de erro | [C] textos como "Execute o script X.sql no Supabase" | Linguagem técnica para clientes/artesãs | P1 | Textos de recuperação para quem usa | varredura por "Supabase/.sql" |
| 17 | 404 | [N] página padrão do Next, sem navegação | Beco sem saída | P1 | Página própria com caminhos | auditoria |
| 18 | Carrinho | [C][N] itens sem foto e sem agrupamento; frete separado dos itens | Difícil entender custo por loja | P1 | Agrupamento por loja com frete, prazo e subtotal | screenshot; migração opcional para a foto |
| 19 | Painel da artesã | [N] visão geral só com atalhos, sem dados | Nenhuma visibilidade do que precisa de ação | P2 | Métricas reais e próximas ações | screenshot |
| 20 | Botão "Cadastrar uma peça" | [N] texto claro sobre pêssego (1,4:1) | Ilegível | P1 | Cores corrigidas | axe |
| 21 | Sob encomenda | [C] modais sem `role="dialog"`, Escape ou foco | Inacessível por teclado/leitor | P1 | `Dialog` | auditoria |
| 22 | Logotipo no admin e na análise | [N] estilo antigo pintava um círculo escuro sobre a marca | Marca deformada | P2 | Seletores ajustados | screenshot |
| 23 | Mensagens (mobile) | [N] painel vazio de 460 px abaixo da lista | Rolagem inútil | P2 | Painel oculto até abrir conversa | screenshot |
| 24 | Fontes | [C] DejaVu Sans em TTF: 1,47 MB | Carregamento lento no celular | P1 | Figtree woff2 (20 KB) | Lighthouse |
| 25 | Lint | [C] 4 erros de `setState` síncrono em efeitos | Renderizações em cascata | P2 | Carregamento adiado | `npm run lint`: 0 erros |
| 26 | Lojas | [C] `list_storefront_shops` limita a 24 lojas, mas `/lojas` pede 100 e filtra no navegador | Lojas além da 24ª nunca aparecem | P1 | **Pendente** (mudança de banco) | — |
| 27 | Detalhe da peça | [C] buscas não devolvem a loja (`artisan_id`) | Sem link para a loja a partir da peça | P2 | Migração opcional `shop_id`; o front só mostra o link quando existe | sandbox com migração |
| 28 | Página de produto | [C] não existe URL própria por peça | Não dá para compartilhar uma peça | P2 | **Proposta de nova etapa** (exige RPC por id) | — |

### 3.1 Segunda rodada (retorno da revisão)

| # | Tela | Evidência | Impacto | Prioridade | Correção | Validação |
| --- | --- | --- | --- | --- | --- | --- |
| 29 | Todas | [N] cada página montava (ou omitia) o próprio cabeçalho e rodapé; painel da loja, administração e análise tinham cabeçalhos próprios; termos, privacidade, acesso e redefinir senha sem rodapé | Formato e espaçamento diferentes entre telas | P1 | `SiteChrome` no layout raiz monta um único `CustomerHeader` e `CustomerFooter` para todas as rotas | medição das caixas do cabeçalho e rodapé em 21 rotas: posições idênticas |
| 30 | Perfil da artesã | [N] a foto do cabeçalho levava a `/perfil`, fora do painel | Duas telas de perfil para a mesma pessoa | P1 | Cabeçalho, CEP e `/perfil` levam a artesã aprovada para `/vendedor/perfil` | medição: `/perfil` → `/vendedor/perfil` |
| 31 | Painel da loja | [N] menu lateral e conteúdo com fundos diferentes | Separação marcada sem função | P2 | Mesmo fundo do site, divisória fina, mesma largura do cabeçalho; menu fixo rolável | screenshot 1440/390 |
| 32 | Acesso e cadastro | [C][N] painel da marca com `top: 0` e altura fixa `100dvh - 140px` sob um cabeçalho fixo de 126 px | Faixa vazia abaixo do painel, variando com zoom | P1 | Painel preso ao fim do cabeçalho (`--an-header-h` medido) até o fim da tela; texto compacto em telas baixas; logotipo duplicado removido | medição em 1366×768, 1440×900, 1920×1080, 1280×560 |
| 33 | Acesso e cadastro | [N] campos sem exemplo (nome, loja, cidade, senhas, história); redefinir senha com um único "olho" para os dois campos | Preenchimento menos guiado | P2 | Placeholders em todos os campos; "mostrar senha" em cada campo de senha | auditoria + e2e `auth` |
| 34 | Mensagens | [N] conversa sobre a peça só existia na página de mensagens | Cliente não tinha como perguntar a partir da peça | P1 | Ícone de balão no card e botão no detalhe ampliado (ocultos nas peças da própria loja) | e2e `mensagens` |
| 35 | Mensagens | [N] envio sem retorno visual; histórico rolava a página inteira | Dúvida se a mensagem saiu; cabeçalho cobria a conversa | P2 | Botão "Enviando…", texto preservado em caso de falha, rolagem só no histórico | e2e `mensagens` |
| 36 | Mensagens | [N] lista como cartões altos sem horário curto nem filtro; conversa sem separação por dia; balões com nome, assunto, data completa e "Responder" em texto; sugestões em janela modal; campo de uma linha; no celular, lista e conversa empilhadas | Leitura lenta, pouco espaço para a conversa, padrão diferente dos apps de mensagem que as pessoas já usam | P1 | Layout de app de conversa: lista com avatar, horário curto, busca e filtros (Peças, Pedidos, Encomendas); conversa com cabeçalho, peça fixada, separadores de dia, balões agrupados por remetente, horário dentro do balão, resposta com citação clicável; compositor com campo que cresce, Enter envia, Shift+Enter quebra linha, sugestões e assunto num painel acima do campo; no celular, lista ou conversa em tela cheia com botão de voltar | e2e `mensagens`, axe 0 em 390/1440 com conversa e sugestões abertas, testes unitários de datas e agrupamento |
| 38 | Notificações | [N] não havia aviso de mensagem nova nem de atualização de pedido/encomenda fora da página aberta | Cliente e loja só descobriam respostas e mudanças entrando em cada tela | P1 | `supabase/notificacoes.sql` (tabela, gatilhos, Realtime) + sininho com painel, contador na aba, aviso flutuante, sons (mensagem, atualização e toque discreto na conversa aberta) com interruptor próprio e contador de não lidas em cada conversa; editar peça no catálogo não notifica | e2e `notificacoes` (14 verificações), testes no banco por cenário, axe 0 no painel |
| 39 | Foto de perfil | [N] a foto era enviada como estava, sem como escolher o enquadramento; limite de 2 MB recusava fotos de celular | Rosto cortado ou fora do centro no círculo; erro ao enviar fotos comuns | P1 | Editor de enquadramento (arrastar, zoom por controle/roda/pinça, girar, teclado, prévia nos tamanhos reais); recorte 512×512 no navegador; original reduzido guardado para "Ajustar enquadramento" depois; arquivos de até 15 MB | e2e `foto-perfil` (18 verificações, cliente e loja, pixel central da foto salva), testes da matemática do recorte |
| 40 | Diálogos no celular | [C][N] a regra de celular mantinha `translateY(40px)` mesmo com o diálogo aberto | Toda folha inferior ficava 40 px abaixo da tela, cortando os botões do rodapé | P1 | Estado aberto com `transform: none` também no celular | medição: rodapé do diálogo termina no fim da tela |
| 41 | Desempenho | [N] Lighthouse com dados reais: fotos no tamanho original (até 123 KB por card), JPG; vitrine buscada só no navegador; CLS 0,76 em `/loja` (rodapé no meio da tela até os dados chegarem); `backdrop-filter` no cabeçalho fixo repintado a cada rolagem | Carregamento lento, LCP de 4–7 s, página "pulando" e rolagem travando em celulares | P1 | Otimizador de imagens do Next (AVIF/WebP, `sizes`, lazy, cache 31 dias) só para o Storage do projeto; home, `/categorias` (sem filtros), `/lojas` prontas no servidor (revalidação 60 s) e `/loja` por id; área de conteúdo com altura mínima da tela; cabeçalho opaco; `content-visibility` fora da tela; editor de foto sob demanda | Lighthouse (mediana de 3): / 66→80, /categorias 56→88, /loja 35→79, /lojas 70→90; CLS 0 em todas |
| 42 | Visitante | [C] carrinho e favoritos exigiam login | Pessoa desistia antes de conhecer o frete/conta | P1 | Carrinho e favoritos sem login, só na memória da aba (somem ao recarregar), levados para a conta ao entrar | e2e `visitante` (14) |
| 43 | Sessão | [C] sem controle além do padrão do supabase-js | Sessão esquecida aberta em computador compartilhado; sem saída remota | P1 | Ver `SEGURANCA.md` §1 | e2e `sessao` (16), testes unitários |
| 44 | Diálogos/cookies | [N] dividir a sessão em cookies cortava no meio de "%XX" ("URI malformed") com sessões grandes | Login quebrado para contas com metadados longos | P1 | Corte respeita os códigos; decodifica só depois de juntar | teste unitário + e2e da conta da loja |
| 37 | Dados de teste | [C] não havia script documentado explicando o que acontece depois de zerar o chat | Dúvida se zerar quebraria pedidos ou encomendas | P2 | `supabase/zerar_mensagens.sql` apaga mensagens e conversas, com a explicação de como cada conversa é recriada | sandbox: 0/0 após o script; conversa de peça e de pedido recriadas; e2e passa depois |

## 4. Fora do escopo desta entrega

Mudanças de banco além da migração opcional, endereços múltiplos, avaliações,
variações de produto, página de produto com URL própria e reformulação de
segurança. Achados de segurança estão em `SEGURANCA.md`.
