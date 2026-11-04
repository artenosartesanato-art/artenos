// Carrinho de quem não entrou na conta: puro (sem React), testável no Node.
// Vive só na memória da aba; o provedor o leva para a conta ao entrar.
import { maxQuantityFor, type Availability } from "./availability.ts";

export type GuestProduct = {
  id: string;
  name: string;
  price: number;
  image_url?: string | null;
  shop_name?: string | null;
  shop_id?: string | null;
  stock?: number | null;
  ready_to_ship?: boolean;
  availability?: Availability | null;
  category_name?: string | null;
};

export type GuestCartLine = { product: GuestProduct; quantity: number };

export const MAX_GUEST_LINES = 50;

/** Soma ao carrinho respeitando o estoque conhecido (mesma mensagem do servidor). */
export function guestCartAdd(cart: readonly GuestCartLine[], product: GuestProduct, quantity: number): GuestCartLine[] {
  const amount = Math.floor(quantity);
  if (!Number.isFinite(amount) || amount < 1) throw new Error("A quantidade informada não é válida.");
  const max = maxQuantityFor(product);
  if (max === 0) throw new Error("Peça esgotada no momento.");
  const current = cart.find((line) => line.product.id === product.id);
  const total = (current?.quantity ?? 0) + amount;
  if (total > max) {
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
