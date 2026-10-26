const storageKey = "artenos:product-inquiry";
const productIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validProductId(value: string | null): value is string {
  return Boolean(value && productIdPattern.test(value));
}

export function rememberProductInquiry(productId: string) {
  if (!validProductId(productId)) return;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ productId, at: Date.now() }));
  } catch { /* Storage can be unavailable in private browsing. The URL still carries the ID. */ }
}

export function pendingProductInquiry(): string | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { productId?: string; at?: number };
    const productId = saved.productId ?? null;
    if (validProductId(productId) &&
      typeof saved.at === "number" && Date.now() - saved.at < 15 * 60_000) {
      return productId;
    }
    sessionStorage.removeItem(storageKey);
  } catch { /* Ignore unavailable or invalid storage. */ }
  return null;
}

export function clearProductInquiry() {
  try { sessionStorage.removeItem(storageKey); } catch { /* URL navigation still works. */ }
}
