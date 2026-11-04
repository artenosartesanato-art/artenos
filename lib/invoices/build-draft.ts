import { InvoiceDataError, type InvoiceDraft, type TaxRegime } from "./types.ts";

// Contexto devolvido por public.invoice_context(order_id).
export type InvoiceContext = {
  order: {
    id: string; code: string | null; subtotal: number; shipping_amount: number; total_amount: number;
    payment_reference: string | null; recipient_name: string | null; shipping_cep: string | null; shipping_address: string | null;
    shipping_number: string | null; shipping_city: string | null; shipping_state: string | null;
  };
  buyer: { name: string; document: string | null; email: string | null };
  seller: {
    person_type: "pf" | "pj"; document: string; legal_name: string; tax_regime: TaxRegime; state_registration: string | null;
    municipal_registration: string | null; cep: string; street: string; number: string; complement: string | null;
    district: string; city: string; state: string; ibge_city_code: string | null;
  } | null;
  items: { name: string; quantity: number; unit_price: number; subtotal: number; ncm: string | null; cfop: string | null; origin: number | null }[];
};

const digits = (value: string | null | undefined) => String(value ?? "").replace(/\D/g, "");
const cents = (value: number) => Math.round(Number(value) * 100) / 100;

/** Monta o rascunho da NF-e ou lista o que falta (InvoiceDataError). */
export function buildInvoiceDraft(context: InvoiceContext): InvoiceDraft {
  const missing: string[] = [];
  const seller = context.seller;
  if (!seller) missing.push("dados fiscais da loja");
  const buyerDocument = digits(context.buyer.document);
  if (buyerDocument.length !== 11 && buyerDocument.length !== 14) missing.push("CPF/CNPJ de quem comprou");
  if (!context.order.shipping_cep || !context.order.shipping_city || !context.order.shipping_state) missing.push("endereço de entrega");
  context.items.forEach((item) => {
    if (!/^\d{8}$/.test(item.ncm ?? "")) missing.push(`NCM de “${item.name}”`);
    if (!/^\d{4}$/.test(item.cfop ?? "")) missing.push(`CFOP de “${item.name}”`);
  });
  if (!context.items.length) missing.push("itens do pedido");
  if (missing.length || !seller) throw new InvoiceDataError(`Faltam dados para a nota: ${missing.join(", ")}.`);

  const items = context.items.map((item) => ({
    description: item.name.slice(0, 120),
    quantity: item.quantity,
    unitPrice: cents(item.unit_price),
    total: cents(item.subtotal),
    ncm: item.ncm!,
    cfop: item.cfop!,
    origin: item.origin ?? 0,
  }));
  const itemsTotal = cents(items.reduce((sum, item) => sum + item.total, 0));
  const shipping = cents(context.order.shipping_amount ?? 0);
  const total = cents(context.order.total_amount);
  // O que o pedido cobrou a menos que itens + frete é desconto.
  const discount = Math.max(0, cents(itemsTotal + shipping - total));

  return {
    orderId: context.order.id,
    orderCode: context.order.code,
    idempotencyKey: `artenos-pedido-${context.order.id}`,
    kind: "nfe",
    issuer: {
      name: seller.legal_name,
      document: digits(seller.document),
      personType: seller.person_type,
      taxRegime: seller.tax_regime,
      stateRegistration: seller.state_registration,
      municipalRegistration: seller.municipal_registration,
      address: {
        cep: seller.cep, street: seller.street, number: seller.number, complement: seller.complement,
        district: seller.district, city: seller.city, state: seller.state, ibgeCityCode: seller.ibge_city_code,
      },
    },
    recipient: {
      name: context.order.recipient_name || context.buyer.name,
      document: buyerDocument,
      personType: buyerDocument.length === 14 ? "pj" : "pf",
      email: context.buyer.email,
      address: {
        cep: digits(context.order.shipping_cep), street: context.order.shipping_address ?? "", number: context.order.shipping_number ?? "S/N",
        city: context.order.shipping_city ?? "", state: (context.order.shipping_state ?? "").toUpperCase(),
      },
    },
    items,
    shipping,
    discount,
    total,
    paymentReference: context.order.payment_reference,
  };
}
