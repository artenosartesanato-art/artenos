// Carrinho de quem não entrou na conta: puro (sem React), testável no Node.
// Vive só na memória da aba; o provedor o leva para a conta ao entrar.

export type GuestProduct = {
  id: string;
  name: string;
  price: number;
  image_url?: string | null;
  shop_name?: string | null;
  shop_id?: string | null;
  stock?: number | null;
  ready_to_ship?: boolean;
  category_name?: string | null;
};

export type GuestCartLine = { product: GuestProduct; quantity: number };

export const MAX_GUEST_LINES = 50;

/** Soma ao carrinho respeitando o estoque conhecido (mesma mensagem do servidor). */
export function guestCartAdd(cart: readonly GuestCartLine[], product: GuestProduct, quantity: number): GuestCartLine[] {
  const amount = Math.floor(quantity);
  if (!Number.isFinite(amount) || amount < 1) throw new Error("A quantidade informada não é válida.");
  if (product.stock === 0) throw new Error("Este produto não está mais disponível.");
  const current = cart.find((line) => line.product.id === product.id);
  const total = (current?.quantity ?? 0) + amount;
  if (product.stock != null && total > product.stock) {
    throw new Error(current
      ? "Estoque insuficiente. Você já possui a quantidade máxima disponível no carrinho."
      : "Estoque insuficiente para a quantidade escolhida.");
  }
  if (!current && cart.length >= MAX_GUEST_LINES) throw new Error("Seu carrinho atingiu o limite de itens.");
  return current
    ? cart.map((line) => line.product.id === product.id ? { product, quantity: total } : line)
    : [...cart, { product, quantity: amount }];
}

export function guestCartTotals(cart: readonly GuestCartLine[]) {
  return cart.reduce((totals, line) => ({
    count: totals.count + line.quantity,
    subtotalCents: totals.subtotalCents + Math.round(Number(line.product.price) * 100) * line.quantity,
  }), { count: 0, subtotalCents: 0 });
}
