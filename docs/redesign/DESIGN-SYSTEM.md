# Sistema visual da Artenós

Referência para quem desenvolve e revisa telas. Todos os tokens estão em
`app/globals.css`; os componentes React compartilhados estão em `components/`.

## 1. Direção de arte

A identidade existente foi preservada — logotipo em novelo, paleta terrosa
(marrom, argila, pêssego, pérola, musgo) e o display Cormorant Garamond — e
aplicada com mais critério:

| Princípio | Como aparece |
| --- | --- |
| **Artesanal e humano** | Raio "orgânico" (`22px 8px 22px 8px`) em botões de destaque, faixas e herói; monogramas das lojas em formas levemente irregulares; fio sob os links de navegação. |
| **A peça em primeiro plano** | Cards com foto de borda a borda (4:5, `object-fit: cover`), fundo neutro e sombras quentes discretas; a cor fica para estados e ações. |
| **Expressivo na descoberta, objetivo na compra** | Home, lojas e coleções usam o display em tamanhos grandes e faixas de cor. Carrinho, formulários e painel usam texto, contraste e hierarquia, sem ornamento. |
| **Confiança sem inventar** | Só aparecem fatos reais da plataforma (lojas analisadas pela equipe, frete por loja, Mercado Pago, mensagens do pedido). Não há avaliações, selos, urgência ou números fictícios. |

## 2. Cor

A paleta oficial não mudou. Foram criadas **variantes derivadas** para atingir
WCAG 2.2 AA, porque a argila original (`#b26b4f`) tem 3,5–4,1:1 sobre os
fundos claros e era usada em textos pequenos em quase todas as telas.

| Token | Valor | Uso | Contraste |
| --- | --- | --- | --- |
| `--artenos-marrom` | `#4b3026` | texto principal, botão primário | 10,4:1 sobre `--an-bg` |
| `--an-text-muted` | `#6b5a4e` | texto secundário | 5,7:1 sobre `--an-bg` |
| `--an-argila-texto` | `#8f4f34` | sobrelinhas, links de destaque | 5,5:1 sobre `--an-bg` |
| `--an-argila-forte` | `#9a5538` | fundo com texto branco (badge do carrinho) | 5,6:1 |
| `--artenos-musgo` | `#566044` | ações de compra, sucesso | 6,0:1 com pérola |
| `--an-musgo-escuro` | `#454d36` | herói e boas-vindas com texto pêssego | 5,6:1 |
| `--an-line-strong` | `#9c7c68` | borda de campos (WCAG 1.4.11) | 3,4–3,8:1 |
| `--an-erro` / `--an-alerta` | `#a23827` / `#7a5500` | estados | ≥ 4,5:1 nos fundos próprios |

Regras:

- Argila original só em superfícies, ilustrações e detalhes não textuais.
- Estados nunca dependem só de cor: todo selo tem texto (ex.: "A caminho",
  "Esgotado") e os erros têm ícone + mensagem.
- Os CSS das páginas foram migrados de hex fixos para os tokens; valores com
  transparência (`#4b302614`) continuam em hex para não alterar o desenho.

## 3. Tipografia

| Papel | Fonte | Observação |
| --- | --- | --- |
| Texto e interface | **Figtree** variável (`public/fonts/Figtree-Variable.woff2`, OFL) | Substitui a DejaVu Sans no site: 20 KB contra 1,47 MB das duas TTF. A DejaVu continua no kit de marca para materiais editáveis. |
| Títulos | Cormorant Garamond variável | Mantida. Usa `font-variant-numeric: lining-nums` em títulos e valores, porque os algarismos de estilo antigo faziam o "1" parecer "I" (ex.: contadores de pedidos). |

Escala (`--an-fs-*`): 11, 12, 14, 16, 18, 22 px e três tamanhos fluidos com
`clamp()` (`2xl`, `3xl`, `display`). Corpo com altura de linha 1,6.

## 4. Espaço, raio, sombra e camadas

- Espaçamento em base 4 (`--an-s-1` a `--an-s-16`).
- Raios: `sm 8`, `md 12`, `lg 18`, `xl 28`, `pill` e `organic`.
- Sombras quentes (`rgb(75 48 38 / …)`) em três níveis.
- Camadas: cabeçalho 40, menus 60, sobreposições 1000, avisos 1100.
- Áreas de toque dos controles principais: ≥ 44 × 44 px.

## 5. Componentes

| Componente | Onde | Estados |
| --- | --- | --- |
| `.an-btn` (+ `--secondary`, `--moss`, `--ghost`, `--danger`, `--lg`, `--sm`, `--block`) | todas as áreas | hover, foco, pressionado (`scale .97`), desabilitado, `aria-busy` |
| `.an-field`, `.field` | formulários | foco, `aria-invalid`, dica, erro com ícone |
| `.an-badge` (+ `--warm`, `--muted`, `--danger`) | disponibilidade, status | sempre com texto |
| `.an-alert` (+ `--error`, `--info`) | erros de tela e de formulário | `role="alert"` quando dinâmico |
| `.an-skeleton`, `ProductGridSkeleton` | listas, cards, painel | brilho desativado em movimento reduzido |
| `.an-state` | vazio, erro, sem acesso | sempre com próxima ação |
| `Dialog` (`components/ui/dialog.tsx`) | detalhe da peça, login, encomenda, boas-vindas | foco preso, Escape, fundo inerte em pilha, retorno do foco, rolagem bloqueada |
| `Dialog variant="drawer"` / `"drawer-left"` | carrinho, menu mobile, filtros, menu da loja | idem, com deslize lateral |
| `MarketplaceProductCard` | vitrine, loja, favoritos | carregando, indisponível, loja em pausa, sem foto |
| `CustomerHeader` / `CustomerFooter` | área pública e do comprador | link ativo (`aria-current`), menu mobile, CEP |
| `SoundToggle` | rodapé, menu mobile, gaveta do carrinho, menu da loja | `role="switch"` |
| `.an-stepper` | quantidade | limites de estoque e 99 |

## 6. Movimento

Tokens: `--an-dur-instant 120ms`, `--an-dur-fast 160ms`, `--an-dur-base 240ms`,
`--an-dur-slow 340ms`; curvas `--an-ease-out`, `--an-ease-in`,
`--an-ease-in-out` e `--an-ease-spring` (leve, sem oscilação visível).

| Efeito | Onde | Duração |
| --- | --- | --- |
| Fade + translateY por rolagem | títulos de seção, cards, categorias, lojas, métricas | 340 ms, escalonamento de 55 ms (máx. 275 ms) |
| Hover lift | cards, categorias, lojas (só com `hover: hover`) | 240 ms |
| Press feedback | botões e coração | 120 ms |
| Scale + fade | diálogos | 240–340 ms |
| Slide-in | gaveta do carrinho, menu, filtros | 340 ms entrada / 240 ms saída |
| Check desenhado + pulso | confirmação na gaveta e badge do carrinho | 360–520 ms |
| Skeleton shimmer | carregamentos | 1,4 s |

Garantias:

- Só `transform` e `opacity` são animados nas transições principais.
- O scroll reveal **só esconde elementos abaixo da dobra** e somente quando há
  `IntersectionObserver` e movimento permitido; anima uma vez e remove a
  classe. Sem JavaScript, tudo aparece normalmente. Sem scroll hijacking nem
  parallax.
- `prefers-reduced-motion: reduce` zera transições e animações (inclusive as
  disparadas por interação) e o reveal não é aplicado.

## 7. Som de interface

`lib/ui-sound.ts` sintetiza sons curtos com Web Audio (sem arquivos e sem
licenças de terceiros):

- **Desligado por padrão**; preferência em `localStorage`
  (`artenos:sons-interface`), alternada pelo `SoundToggle`.
- Toca só após uma ação: adicionar ao carrinho (dois tons ascendentes),
  remover do carrinho e erro ao adicionar.
- Volume baixo (≤ 0,07), duração ≤ 220 ms, intervalo mínimo de 250 ms entre
  sons (sem sobreposição).
- Nenhuma informação depende do áudio: toda confirmação também é visual.
- Qualquer falha de áudio é ignorada e não afeta a ação.

## 8. Adicionar ao carrinho (fluxo de referência)

1. Sem sessão: abre o convite de login, que leva a `/acesso?voltar=<página>`.
2. O botão acionado fica em carregamento (`aria-busy`) e novos cliques são
   ignorados até a resposta (`pendingCartIds`).
3. Só depois da resposta do RPC `add_to_cart` o carrinho é recarregado.
4. Badge do cabeçalho atualiza e pulsa; som opcional.
5. Gaveta lateral com foto, nome, loja, quantidade, subtotal do item e
   resumo do carrinho; foco vai para "Ver carrinho e calcular frete".
6. "Continuar comprando", Escape ou clique fora fecham e devolvem o foco ao
   elemento de origem (mesmo quando a gaveta foi aberta a partir do diálogo
   da peça).
7. Em erro (ex.: estoque insuficiente), um único aviso de erro e nenhuma
   confirmação de sucesso.
