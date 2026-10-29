// Perguntas frequentes da Central de Ajuda. Descrevem o que a plataforma faz
// hoje; revise junto com os Termos de Uso quando as regras mudarem.

export type FaqGroup = { id: string; title: string; items: { q: string; a: string[] }[] };

export const FAQ: FaqGroup[] = [
  {
    id: "comprar",
    title: "Comprar",
    items: [
      { q: "Como compro uma peça?", a: [
        "Abra a peça e toque em “Comprar agora” para ir direto ao pagamento só com ela, ou em “Adicionar ao carrinho” para juntar peças de várias lojas.",
        "Antes de pagar você escolhe o frete de cada loja para o CEP do seu cadastro.",
      ] },
      { q: "Qual a diferença entre pronta entrega e sob encomenda?", a: [
        "Pronta entrega: a peça já está feita e há unidades em estoque.",
        "Sob encomenda: a loja produz depois do seu pedido; o prazo de produção aparece na peça e entra no prazo de entrega. Você pode deixar observações para a loja (cor, nome, tamanho).",
      ] },
      { q: "Onde acompanho meu pedido?", a: [
        "Em Pedidos você vê o pagamento, a produção (para peças sob encomenda), o envio com código de rastreio e a entrega. Cada mudança também aparece no sininho.",
      ] },
      { q: "Posso falar com a loja antes de comprar?", a: [
        "Sim. Use o botão de mensagem na peça. A conversa fica em Mensagens. Não combine pagamentos fora da Artenós: compras pagas por fora não têm a nossa proteção.",
      ] },
    ],
  },
  {
    id: "encomendas",
    title: "Encomendas e orçamentos",
    items: [
      { q: "Como peço uma peça personalizada?", a: [
        "Na página da loja, em “Peça um orçamento”, descreva o que você imagina. A loja responde com valor e prazo, e vocês combinam os detalhes pela conversa.",
        "Seus pedidos de orçamento ficam em Pedidos › Orçamentos sob encomenda.",
      ] },
      { q: "O que significam os status da encomenda?", a: [
        "Aguardando confirmação da loja → Em produção → Pronto para envio → Enviado → Entregue. O status aparece no card da peça, em Pedidos e você recebe um aviso a cada mudança.",
      ] },
    ],
  },
  {
    id: "pagamento",
    title: "Pagamento",
    items: [
      { q: "Quais formas de pagamento são aceitas?", a: [
        "Pix e cartão de crédito, processados pelo Mercado Pago.",
      ] },
      { q: "A Artenós guarda os dados do meu cartão?", a: [
        "Não. Os dados do cartão são digitados em campos do Mercado Pago e vão direto para eles; nem a Artenós nem a loja recebem o número do cartão.",
      ] },
      { q: "O Pix expirou ou o pagamento foi recusado. E agora?", a: [
        "Volte à página de pagamento do pedido e gere uma nova tentativa. Enquanto o pagamento não é confirmado, as unidades a pronta entrega ficam reservadas por um tempo e depois voltam ao estoque.",
      ] },
    ],
  },
  {
    id: "frete",
    title: "Frete e entrega",
    items: [
      { q: "Como o frete é calculado?", a: [
        "Pelas transportadoras disponíveis para o CEP de origem da loja e o CEP do seu cadastro, considerando peso, medidas e o prazo de produção da peça.",
      ] },
      { q: "Mudei de endereço. O que faço?", a: [
        "Atualize o CEP e o endereço em Meu perfil antes de pagar. Depois do pagamento, fale com a loja pela conversa do pedido.",
      ] },
    ],
  },
  {
    id: "trocas",
    title: "Trocas e devoluções",
    items: [
      { q: "Posso desistir da compra?", a: [
        "Em compras pela internet você pode desistir em até 7 dias do recebimento (art. 49 do Código de Defesa do Consumidor). Fale com a loja pela conversa do pedido ou com a Central de Ajuda.",
        "Peças feitas sob medida ou personalizadas a seu pedido podem ter regras diferentes; combine com a loja antes da produção.",
      ] },
      { q: "A peça chegou com defeito ou diferente do anunciado.", a: [
        "Fotografe a peça e a embalagem e fale com a loja pela conversa do pedido. Se não houver solução, abra um chamado aqui com o número do pedido.",
      ] },
    ],
  },
  {
    id: "vender",
    title: "Vender na Artenós",
    items: [
      { q: "Como abro minha loja?", a: [
        "Crie uma conta de artesã ou artesão em “Venda na Artenós”. O cadastro passa por análise da equipe; você acompanha o andamento e recebe a resposta por e-mail.",
      ] },
      { q: "Quanto custa vender?", a: [
        "A Artenós cobra uma tarifa sobre o valor dos produtos de cada venda, informada no painel da loja. O frete não entra na tarifa.",
      ] },
      { q: "Como recebo pelas vendas?", a: [
        "Cadastre sua chave Pix em Repasses. O valor de cada venda (já descontadas a tarifa e a taxa do meio de pagamento) aparece em Repasses com a data de liberação.",
      ] },
    ],
  },
];
