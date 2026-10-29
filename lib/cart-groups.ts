// Agrupa os itens do carrinho por loja e associa cada grupo às opções de
// frete devolvidas pela função calculate-shipping. Os valores são tratados em
// centavos para não acumular erros de arredondamento.

export type CartItem = {
  item_id: string;
  product_id: string;
  product_name: string;
  store_name: string;
  unit_price: number;
  quantity: number;
  stock: number | null;
  product_active: boolean;
  added_at: string;
  /** Opcionais: presentes após a migração 20261028_carrinho_imagem_loja.sql. */
  image_url?: string | null;
  artisan_id?: string | null;
  /** Presentes após a migração 20261029_disponibilidade_estoque.sql. */
  availability?: "ready" | "made_to_order" | "sold_out" | null;
  max_quantity?: number | null;
  /** Presentes após a migração 20261029_descricao_observacoes.sql. */
  product_summary?: string | null;
  customer_notes?: string | null;
};

/** Quantidade máxima do item (sob encomenda não depende do estoque). */
export function cartItemLimit(item: Pick<CartItem, "stock" | "max_quantity">) {
  if (item.max_quantity != null) return item.max_quantity;
  return item.stock ?? 99;
}

export type ShippingOption = {
  id: string;
  serviceId: number;
  serviceName: string;
  companyName: string;
  price: number;
  carrierMinDays: number;
  carrierMaxDays: number;
  productionDays: number;
  totalMinDays: number;
  totalMaxDays: number;
  expiresAt: string;
};

export type ShippingGroup = {
  artisanId: string;
  storeName: string;
  originCep?: string;
  error?: string;
  options: ShippingOption[];
};

export type CartStoreGroup = {
  key: string;
  storeName: string;
  items: CartItem[];
  productsCents: number;
  shipping: ShippingGroup | null;
};

export const toCents = (value: number) => Math.round(Number(value) * 100);

export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function groupCartByStore(cart: CartItem[], shippingGroups: ShippingGroup[]): CartStoreGroup[] {
  const groups = new Map<string, CartStoreGroup>();
  for (const item of cart) {
    const key = item.artisan_id || `loja:${item.store_name}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, storeName: item.store_name, items: [], productsCents: 0, shipping: null };
      groups.set(key, group);
    }
    group.items.push(item);
    group.productsCents += toCents(item.unit_price) * item.quantity;
  }
  const unmatched = [...shippingGroups];
  for (const group of groups.values()) {
    const artisanId = group.items[0]?.artisan_id;
    let index = artisanId ? unmatched.findIndex((shipping) => shipping.artisanId === artisanId) : -1;
    if (index < 0) index = unmatched.findIndex((shipping) => shipping.storeName === group.storeName);
    if (index >= 0) group.shipping = unmatched.splice(index, 1)[0];
  }
  return [...groups.values()];
}
