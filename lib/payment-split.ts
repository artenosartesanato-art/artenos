// Split de pagamento (caminho A) — PREPARAÇÃO, ainda não ligado ao checkout.
//
// No split, cada loja conecta a própria conta do Mercado Pago (OAuth) e a
// cobrança é feita em nome dela, com `application_fee` = parte da Artenós.
// O Mercado Pago divide sozinho na hora do pagamento: a taxa dele sai do valor
// da loja, a Artenós recebe a comissão e a loja recebe o resto.
// Cada pagamento tem UMA loja: um carrinho com várias lojas vira uma cobrança
// por loja. Veja docs/SPLIT-PAGAMENTOS.md.
//
// Sem dependências (testável no Node).

export type SplitItem = { artisan_id: string; unit_price: number; quantity: number };
export type SplitShipping = { artisan_id: string; amount: number };

export type StoreCharge = {
  artisanId: string;
  /** Peças desta loja. */
  products: number;
  /** Frete desta loja (a comissão não incide sobre ele). */
  shipping: number;
  /** Valor da cobrança desta loja (peças + frete). */
  total: number;
  /** Comissão da Artenós (application_fee), só sobre as peças. */
  applicationFee: number;
};

const cents = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100);

/** Comissão da Artenós sobre as peças, em reais (arredondada ao centavo). */
export function applicationFee(productsTotal: number, feePercent: number) {
  if (!(productsTotal > 0) || !(feePercent > 0)) return 0;
  return Math.round(cents(productsTotal) * feePercent / 100) / 100;
}

/** Separa a compra em uma cobrança por loja, na ordem em que as lojas aparecem. */
export function chargesByStore(items: SplitItem[], shipping: SplitShipping[], feePercent: number): StoreCharge[] {
  const order: string[] = [];
  const productCents = new Map<string, number>();
  for (const item of items) {
    if (!productCents.has(item.artisan_id)) order.push(item.artisan_id);
    productCents.set(item.artisan_id, (productCents.get(item.artisan_id) ?? 0) + cents(item.unit_price) * item.quantity);
  }
  const shippingCents = new Map<string, number>();
  for (const row of shipping) shippingCents.set(row.artisan_id, (shippingCents.get(row.artisan_id) ?? 0) + cents(row.amount));
  return order.map((artisanId) => {
    const products = (productCents.get(artisanId) ?? 0) / 100;
    const freight = (shippingCents.get(artisanId) ?? 0) / 100;
    return {
      artisanId,
      products,
      shipping: freight,
      total: (cents(products) + cents(freight)) / 100,
      applicationFee: applicationFee(products, feePercent),
    };
  });
}
