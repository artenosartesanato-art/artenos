// Consentimento de cookies. Hoje a Artenós só usa armazenamento essencial
// (sessão, preferências e carrinho de visitante); scripts de análise ou
// publicidade, se um dia forem adicionados, só podem carregar com "all".

export type CookieChoice = "essential" | "all";
export const CONSENT_KEY = "artenos:cookies";
export const CONSENT_VERSION = 1;
export const CONSENT_EVENT = "artenos:cookies-change";
export const OPEN_EVENT = "artenos:cookies-open";

type Stored = { choice: CookieChoice; version: number; at: string };

export function parseConsent(raw: string | null): CookieChoice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Stored;
    if (value.version !== CONSENT_VERSION) return null;
    return value.choice === "all" || value.choice === "essential" ? value.choice : null;
  } catch {
    return null;
  }
}

export function serializeConsent(choice: CookieChoice, now = new Date()) {
  return JSON.stringify({ choice, version: CONSENT_VERSION, at: now.toISOString() } satisfies Stored);
}

export function readConsent(): CookieChoice | null {
  try { return parseConsent(window.localStorage.getItem(CONSENT_KEY)); } catch { return null; }
}

export function saveConsent(choice: CookieChoice) {
  try { window.localStorage.setItem(CONSENT_KEY, serializeConsent(choice)); } catch { /* sem armazenamento */ }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
}

/** Reabre o aviso (link "Cookies" no rodapé). */
export function openCookiePreferences() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
