// "Comprar" sem estar logado: guarda a peça nesta aba, manda para o login e,
// ao voltar em /comprar-agora, retoma a compra. Puro (testável no Node).
export const BUY_NOW_KEY = "artenos:comprar-agora";
export const BUY_NOW_PATH = "/comprar-agora";
const MAX_AGE_MS = 30 * 60_000;

export type PendingBuyNow = { productId: string; quantity: number; at: number };

export function serializePendingBuyNow(productId: string, quantity: number, now = Date.now()) {
  return JSON.stringify({ productId, quantity: Math.max(1, Math.min(99, Math.floor(quantity))), at: now } satisfies PendingBuyNow);
}

/** Intenção válida (mesmo formato, menos de 30 minutos) ou null. */
export function parsePendingBuyNow(raw: string | null, now = Date.now()): PendingBuyNow | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingBuyNow;
    if (!/^[0-9a-f-]{36}$/i.test(String(value.productId))) return null;
    if (!Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 99) return null;
    if (!Number.isFinite(value.at) || now - value.at > MAX_AGE_MS || value.at > now + 60_000) return null;
    return value;
  } catch {
    return null;
  }
}
