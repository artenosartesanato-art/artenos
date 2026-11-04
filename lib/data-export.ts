// "Baixar meus dados" (LGPD, art. 18): monta as abas a partir dos dados da
// própria conta. Puro: a rota busca os dados, este módulo organiza (nomes em
// português, status traduzidos, CPF mascarado, sem ids internos) e o mesmo
// resultado vira planilha (lib/data-export-xlsx.ts) ou JSON.

export type ColumnType = "text" | "long" | "date" | "money" | "int";
export type Column = { key: string; header: string; type?: ColumnType };
export type Sheet = { name: string; columns: Column[]; rows: Record<string, unknown>[] };
export type ExportResult = { generatedAt: string; account: { name: string; email: string; createdAt: string | null }; sheets: Sheet[] };

type Row = Record<string, unknown>;
export type ExportInput = {
  email: string;
  profile: Row | null;
  /** Escolha de cookies guardada no navegador de quem pediu (se enviada). */
  cookieConsent?: { choice?: string; at?: string } | null;
  buyerOrders: Row[];
  orderItems: Row[];
  checkouts: Row[];
  storeNames: Record<string, string>;
  favorites: Row[];
  favoriteProducts: Row[];
  conversations: Row[];
  messages: Row[];
  productReviews: Row[];
  storeReviews: Row[];
  reviewedProducts: Row[];
  // Loja
  storeSettings?: Row | null;
  products?: Row[];
  categories?: Record<string, string>;
  sales?: Row[];
  payouts?: Row[];
};

export const ORDER_STATUS: Record<string, string> = {
  payment_confirmed: "Pagamento confirmado", preparing: "Em preparação", shipped: "A caminho",
  out_for_delivery: "Saiu para entrega", delivered: "Entregue", delivery_failed: "Problema na entrega",
  cancelled: "Cancelado", refunded: "Reembolsado",
};
const PAYOUT_STATUS: Record<string, string> = {
  pending: "Aguardando liberação", processing: "Em processamento", paid: "Pago", failed: "Falhou", cancelled: "Cancelado",
};
const PAYMENT_METHOD: Record<string, string> = {
  pix: "Pix", credit_card: "Cartão de crédito", debit_card: "Cartão de débito", account_money: "Saldo Mercado Pago", ticket: "Boleto",
};
const AVAILABILITY: Record<string, string> = { ready: "Pronta entrega", made_to_order: "Sob encomenda", sold_out: "Esgotada" };
const REVIEW_STATUS: Record<string, string> = { published: "Publicada", hidden: "Oculta", removed: "Removida", pending: "Em análise" };
const NF_STATUS: Record<string, string> = {
  nao_aplicavel: "Não se aplica", pendente: "Pendente", processando: "Em emissão", emitida: "Emitida",
  aguardando_loja: "Aguardando a loja", erro: "Com erro", cancelada: "Cancelada",
};
const APPROVAL: Record<string, string> = {
  active: "Aprovada", pending_review: "Em análise", assisted_review: "Cadastro assistido", under_review: "Em análise",
  changes_requested: "Ajustes pedidos", rejected: "Recusada", suspended: "Suspensa",
};
const COOKIE_CHOICE: Record<string, string> = { all: "Aceitou todos", essential: "Somente essenciais" };

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));
const label = (map: Record<string, string>, value: unknown) => map[str(value)] ?? str(value);

/** "***.456.789-**" (CPF) ou "**.345.678/0001-**" (CNPJ): só o miolo aparece. */
export function maskDocument(value: unknown) {
  const digits = str(value).replace(/\D/g, "");
  if (digits.length === 11) return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  if (digits.length === 14) return `**.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-**`;
  return digits ? "***" : "";
}

function address(parts: unknown[]) {
  return parts.map(str).map((part) => part.trim()).filter(Boolean).join(", ");
}

export function exportFileName(now: Date, extension: "xlsx" | "json") {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  return `artenos-meus-dados-${date}.${extension}`;
}

export function buildExport(input: ExportInput, now = new Date()): ExportResult {
  const profile = input.profile ?? {};
  const isSeller = profile.account_type === "artisan";
  const orderCode = new Map(input.buyerOrders.map((order) => [str(order.id), str(order.order_code) || "—"]));
  const paymentByCheckout = new Map(input.checkouts.map((checkout) => [str(checkout.id), label(PAYMENT_METHOD, checkout.payment_method)]));
  const productName = new Map([...input.favoriteProducts, ...input.reviewedProducts].map((product) => [str(product.id), str(product.name)]));
  const productStore = new Map(input.favoriteProducts.map((product) => [str(product.id), input.storeNames[str(product.artisan_id)] ?? ""]));
  const sheets: Sheet[] = [];

  sheets.push({
    name: "Dados pessoais",
    columns: [
      { key: "nome", header: "Nome" }, { key: "email", header: "E-mail" }, { key: "telefone", header: "Telefone" },
      { key: "documento", header: "CPF/CNPJ" }, { key: "tipo", header: "Tipo de conta" }, { key: "cadastro", header: "Cadastro em", type: "date" },
      { key: "comunicacao", header: "Comunicações", type: "long" },
    ],
    rows: [{
      nome: str(profile.full_name), email: str(profile.email) || input.email, telefone: str(profile.phone),
      documento: maskDocument(profile.document), tipo: isSeller ? "Loja" : "Comprador", cadastro: profile.created_at ?? null,
      comunicacao: "Só e-mails de serviço (pedidos e conta). A Artenós não envia publicidade.",
    }],
  });

  const addresses: Row[] = [];
  const registered = address([profile.address, profile.address_number, profile.city, profile.state]);
  if (registered) addresses.push({ uso: "Cadastro", endereco: address([profile.address, profile.address_number]), cidade: str(profile.city), uf: str(profile.state), cep: str(profile.cep) });
  const seen = new Set<string>();
  for (const order of input.buyerOrders) {
    const line = address([order.shipping_address, order.shipping_number, order.shipping_complement]);
    const key = `${line}|${str(order.shipping_cep)}`;
    if (!line || seen.has(key)) continue;
    seen.add(key);
    addresses.push({ uso: `Entrega (pedido ${orderCode.get(str(order.id))})`, endereco: line, cidade: str(order.shipping_city), uf: str(order.shipping_state), cep: str(order.shipping_cep) });
  }
  if (addresses.length) {
    sheets.push({ name: "Endereços", columns: [
      { key: "uso", header: "Uso" }, { key: "endereco", header: "Endereço" }, { key: "cidade", header: "Cidade" },
      { key: "uf", header: "UF" }, { key: "cep", header: "CEP" },
    ], rows: addresses });
  }

  if (input.buyerOrders.length) {
    sheets.push({ name: "Pedidos", columns: [
      { key: "pedido", header: "Pedido" }, { key: "data", header: "Data", type: "date" }, { key: "loja", header: "Loja" },
      { key: "status", header: "Status" }, { key: "itens", header: "Valor dos itens", type: "money" }, { key: "frete", header: "Frete", type: "money" },
      { key: "total", header: "Total", type: "money" }, { key: "pagamento", header: "Forma de pagamento" },
    ], rows: input.buyerOrders.map((order) => ({
      pedido: orderCode.get(str(order.id)), data: order.created_at, loja: input.storeNames[str(order.artisan_id)] ?? "",
      status: label(ORDER_STATUS, order.status), itens: num(order.subtotal), frete: num(order.shipping_amount), total: num(order.total_amount),
      pagamento: paymentByCheckout.get(str(order.checkout_id)) ?? "",
    })) });
  }
  if (input.orderItems.length) {
    sheets.push({ name: "Itens dos pedidos", columns: [
      { key: "pedido", header: "Pedido" }, { key: "peca", header: "Peça" }, { key: "quantidade", header: "Quantidade", type: "int" },
      { key: "unitario", header: "Valor unitário", type: "money" }, { key: "subtotal", header: "Subtotal", type: "money" },
      { key: "tipo", header: "Tipo" }, { key: "observacoes", header: "Observações para a loja", type: "long" },
    ], rows: input.orderItems.map((item) => ({
      pedido: orderCode.get(str(item.order_id)) ?? "", peca: str(item.product_name), quantidade: num(item.quantity),
      unitario: num(item.unit_price), subtotal: num(item.subtotal), tipo: item.made_to_order ? "Sob encomenda" : "Pronta entrega",
      observacoes: str(item.customer_notes),
    })) });
  }
  if (input.favorites.length) {
    sheets.push({ name: "Favoritos", columns: [
      { key: "peca", header: "Peça" }, { key: "loja", header: "Loja" }, { key: "data", header: "Salvo em", type: "date" },
    ], rows: input.favorites.map((favorite) => ({
      peca: productName.get(str(favorite.product_id)) || "Peça indisponível", loja: productStore.get(str(favorite.product_id)) ?? "", data: favorite.created_at,
    })) });
  }
  if (input.messages.length) {
    const conversation = new Map(input.conversations.map((item) => [str(item.id), item]));
    sheets.push({ name: "Mensagens", columns: [
      { key: "conversa", header: "Conversa" }, { key: "data", header: "Data e hora", type: "date" },
      { key: "autor", header: "Autor" }, { key: "texto", header: "Mensagem", type: "long" },
    ], rows: input.messages.map((message) => {
      const thread = conversation.get(str(message.conversation_id)) ?? {};
      const store = input.storeNames[str(thread.artisan_id)] ?? "Loja";
      const topic = str(thread.product_name_snapshot) || (thread.order_id ? `Pedido ${orderCode.get(str(thread.order_id)) ?? ""}`.trim() : "Conversa");
      const mine = str(message.sender_id) === str(profile.id);
      const otherSide = str(message.sender_id) === str(thread.client_id) ? "Cliente" : store;
      return { conversa: str(thread.client_id) === str(profile.id) ? `${store} · ${topic}` : `Cliente · ${topic}`, data: message.created_at, autor: mine ? "Você" : otherSide, texto: str(message.body) };
    }) });
  }
  const reviews = [
    ...input.productReviews.map((review) => ({ sobre: `Peça: ${productName.get(str(review.product_id)) || "—"}`, review })),
    ...input.storeReviews.map((review) => ({ sobre: `Loja: ${input.storeNames[str(review.artisan_id)] ?? "—"}`, review })),
  ];
  if (reviews.length) {
    sheets.push({ name: "Avaliações", columns: [
      { key: "sobre", header: "Sobre" }, { key: "nota", header: "Nota", type: "int" }, { key: "comentario", header: "Comentário", type: "long" },
      { key: "status", header: "Situação" }, { key: "data", header: "Data", type: "date" },
    ], rows: reviews.map(({ sobre, review }) => ({
      sobre, nota: num(review.rating), comentario: str(review.comment), status: label(REVIEW_STATUS, review.status), data: review.created_at,
    })) });
  }
  const consents: Row[] = [];
  if (profile.terms_accepted_at) consents.push({ item: "Termos de Uso e Política de Privacidade", situacao: "Aceito", data: profile.terms_accepted_at });
  if (input.cookieConsent?.choice) consents.push({ item: "Cookies (neste navegador)", situacao: label(COOKIE_CHOICE, input.cookieConsent.choice), data: input.cookieConsent.at || null });
  consents.push({ item: "Comunicações", situacao: "Só e-mails de serviço (sem publicidade)", data: null });
  sheets.push({ name: "Consentimentos", columns: [
    { key: "item", header: "Item" }, { key: "situacao", header: "Situação" }, { key: "data", header: "Data", type: "date" },
  ], rows: consents });

  if (isSeller) {
    const settings = input.storeSettings ?? {};
    sheets.push({ name: "Loja", columns: [
      { key: "nome", header: "Nome da loja" }, { key: "especialidade", header: "Especialidade" }, { key: "historia", header: "História", type: "long" },
      { key: "situacao", header: "Situação" }, { key: "producao", header: "Prazo de produção (dias)", type: "int" },
      { key: "ferias", header: "Modo férias" }, { key: "aviso", header: "Aviso da loja", type: "long" },
    ], rows: [{
      nome: str(profile.store_name), especialidade: str(profile.specialty), historia: str(profile.story),
      situacao: label(APPROVAL, profile.approval_status), producao: num(settings.production_time_days),
      ferias: settings.vacation_mode ? "Ligado" : "Desligado", aviso: str(settings.announcement),
    }] });
    if (input.products?.length) {
      sheets.push({ name: "Peças", columns: [
        { key: "titulo", header: "Título" }, { key: "categoria", header: "Categoria" }, { key: "preco", header: "Preço", type: "money" },
        { key: "estoque", header: "Estoque", type: "int" }, { key: "disponibilidade", header: "Disponibilidade" },
        { key: "status", header: "Status" }, { key: "criada", header: "Criada em", type: "date" },
      ], rows: input.products.map((product) => ({
        titulo: str(product.name), categoria: input.categories?.[str(product.category_id)] ?? "", preco: num(product.price),
        estoque: num(product.stock), disponibilidade: label(AVAILABILITY, product.availability),
        status: product.active ? "Publicada" : "Despublicada", criada: product.created_at,
      })) });
    }
    if (input.sales?.length) {
      sheets.push({ name: "Vendas", columns: [
        { key: "pedido", header: "Pedido" }, { key: "data", header: "Data", type: "date" }, { key: "pecas", header: "Peças" },
        { key: "status", header: "Status" }, { key: "itens", header: "Valor dos itens", type: "money" },
        { key: "frete", header: "Frete", type: "money" }, { key: "total", header: "Total", type: "money" },
        { key: "tarifa", header: "Tarifa Artenós", type: "money" }, { key: "liquido", header: "Valor para a loja", type: "money" },
        { key: "nota", header: "Nota fiscal" },
      ], rows: input.sales.map((sale) => ({
        pedido: str(sale.order_code) || "—", data: sale.created_at, pecas: str(sale.product_name), status: label(ORDER_STATUS, sale.status),
        itens: num(sale.subtotal), frete: num(sale.shipping_amount), total: num(sale.total_amount),
        tarifa: num(sale.platform_fee_amount), liquido: num(sale.artisan_net_amount), nota: label(NF_STATUS, sale.nf_status),
      })) });
    }
    if (input.payouts?.length) {
      sheets.push({ name: "Repasses", columns: [
        { key: "criado", header: "Criado em", type: "date" }, { key: "bruto", header: "Valor bruto", type: "money" },
        { key: "tarifa", header: "Tarifa Artenós", type: "money" }, { key: "gateway", header: "Tarifa do pagamento", type: "money" },
        { key: "liquido", header: "Valor líquido", type: "money" }, { key: "status", header: "Status" },
        { key: "liberacao", header: "Liberação a partir de", type: "date" }, { key: "pago", header: "Pago em", type: "date" },
      ], rows: input.payouts.map((payout) => ({
        criado: payout.created_at, bruto: num(payout.gross_amount), tarifa: num(payout.platform_fee), gateway: num(payout.gateway_fee),
        liquido: num(payout.net_amount), status: label(PAYOUT_STATUS, payout.status), liberacao: payout.release_after, pago: payout.paid_at,
      })) });
    }
  }

  return {
    generatedAt: now.toISOString(),
    account: { name: str(profile.full_name), email: str(profile.email) || input.email, createdAt: str(profile.created_at) || null },
    sheets,
  };
}

/** JSON (portabilidade, LGPD art. 18, V): mesmas abas e colunas da planilha, com valores brutos. */
export function exportToJson(result: ExportResult) {
  return {
    gerado_em: result.generatedAt,
    conta: { nome: result.account.name, email: result.account.email, criada_em: result.account.createdAt },
    abas: Object.fromEntries(result.sheets.map((sheet) => [
      sheet.name,
      sheet.rows.map((row) => Object.fromEntries(sheet.columns.map((column) => [column.header, row[column.key] ?? null]))),
    ])),
  };
}
