// Controle de sessão no navegador.
//
// * "Manter conectado neste aparelho": ligado → sessão no localStorage (dura
//   até sair); desligado → sessão em cookies de sessão (somem ao fechar o
//   navegador e valem para todas as abas).
// * Inatividade: sem "manter conectado", a sessão termina após 30 min sem uso;
//   contas administrativas sempre após 15 min. A última atividade é
//   compartilhada entre as abas.
// * Saída: endSession() encerra no servidor (nesta sessão ou em todas) e limpa
//   os dados da Artenós guardados no navegador.
import type { SupportedStorage } from "@supabase/supabase-js";

export const REMEMBER_KEY = "artenos:lembrar";
export const ACTIVITY_KEY = "artenos:ultima-atividade";
const SIGNING_OUT_KEY = "artenos:saindo";
const CHUNK = 3000;
const MAX_CHUNKS = 12;

export const IDLE_LIMIT_MS = 30 * 60_000;
export const ADMIN_IDLE_LIMIT_MS = 15 * 60_000;
export const IDLE_WARNING_MS = 60_000;

/** Rotas que exigem conta: ao perder a sessão, a pessoa vai para o login. */
export const PROTECTED_PREFIXES = ["/perfil", "/pedidos", "/mensagens", "/vendedor", "/administracao", "/pagamento", "/cadastro-em-analise", "/repasses", "/concluir-cadastro"];

export function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Limite de inatividade, ou null quando não há (aparelho lembrado, conta comum). */
export function idleLimitMs({ admin, remember }: { admin: boolean; remember: boolean }) {
  if (admin) return ADMIN_IDLE_LIMIT_MS;
  return remember ? null : IDLE_LIMIT_MS;
}

/* Cookies divididos em pedaços (um token da sessão passa de 4 KB às vezes). */

/**
 * Divide um texto JÁ codificado (encodeURIComponent) em pedaços de até `size`
 * sem cortar no meio de um código "%XX" (cortar ali quebrava a leitura).
 */
export function splitChunks(encoded: string, size = CHUNK) {
  const parts: string[] = [];
  let start = 0;
  while (start < encoded.length) {
    let end = Math.min(start + size, encoded.length);
    const escape = encoded.lastIndexOf("%", end - 1);
    if (escape >= end - 2 && escape >= start && end < encoded.length) end = escape;
    parts.push(encoded.slice(start, end));
    start = end;
  }
  return parts.length ? parts : [""];
}

/** Valor bruto (ainda codificado) do cookie. */
function readCookie(name: string) {
  const prefix = `${encodeURIComponent(name)}=`;
  const found = document.cookie.split("; ").find((entry) => entry.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}

/** `encoded` já vem codificado (ou null para apagar). */
function writeCookie(name: string, encoded: string | null) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = encoded === null
    ? `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
    : `${encodeURIComponent(name)}=${encoded}; Path=/; SameSite=Lax${secure}`;
}

const sessionCookies = {
  get(key: string) {
    const parts: string[] = [];
    for (let index = 0; index < MAX_CHUNKS; index += 1) {
      const part = readCookie(`${key}.${index}`);
      if (part === null) break;
      parts.push(part);
    }
    if (!parts.length) return null;
    try { return decodeURIComponent(parts.join("")); } catch { return null; }
  },
  set(key: string, value: string) {
    const parts = splitChunks(encodeURIComponent(value));
    parts.forEach((part, index) => writeCookie(`${key}.${index}`, part));
    for (let index = parts.length; index < MAX_CHUNKS; index += 1) {
      if (readCookie(`${key}.${index}`) === null) break;
      writeCookie(`${key}.${index}`, null);
    }
  },
  remove(key: string) {
    for (let index = 0; index < MAX_CHUNKS; index += 1) {
      if (readCookie(`${key}.${index}`) === null) break;
      writeCookie(`${key}.${index}`, null);
    }
  },
};

function local() {
  try { return window.localStorage; } catch { return null; }
}

/** Padrão: lembrado (mantém quem já estava conectado antes desta mudança). */
export function rememberDevice() {
  if (typeof window === "undefined") return true;
  return local()?.getItem(REMEMBER_KEY) !== "0";
}

export function setRememberDevice(remember: boolean) {
  local()?.setItem(REMEMBER_KEY, remember ? "1" : "0");
}

/** Armazenamento da sessão do Supabase conforme "manter conectado". */
export const authStorage: SupportedStorage = {
  getItem(key) {
    if (typeof window === "undefined") return null;
    return rememberDevice() ? local()?.getItem(key) ?? sessionCookies.get(key) : sessionCookies.get(key) ?? local()?.getItem(key) ?? null;
  },
  setItem(key, value) {
    if (typeof window === "undefined") return;
    if (rememberDevice()) {
      local()?.setItem(key, value);
      sessionCookies.remove(key);
    } else {
      sessionCookies.set(key, value);
      local()?.removeItem(key);
    }
  },
  removeItem(key) {
    if (typeof window === "undefined") return;
    local()?.removeItem(key);
    sessionCookies.remove(key);
  },
};

/* Atividade compartilhada entre abas. */

let lastWrite = 0;
/** Registra uso (no máximo a cada 10 s, salvo `force`, ex.: ao entrar ou "Continuar conectado"). */
export function markActivity(force = false) {
  const now = Date.now();
  if (!force && now - lastWrite < 10_000) return;
  lastWrite = now;
  local()?.setItem(ACTIVITY_KEY, String(now));
}

export function lastActivity() {
  const value = Number(local()?.getItem(ACTIVITY_KEY));
  return Number.isFinite(value) && value > 0 ? value : Date.now();
}

/** Saída pedida pela pessoa (ou por inatividade): não é "sessão expirada". */
export function expectedSignOut() {
  try { return window.sessionStorage.getItem(SIGNING_OUT_KEY) === "1"; } catch { return false; }
}

export function clearExpectedSignOut() {
  try { window.sessionStorage.removeItem(SIGNING_OUT_KEY); } catch { /* sem armazenamento */ }
}

/**
 * Encerra a sessão e apaga o que a Artenós guardou no navegador.
 * scope "global": em todos os aparelhos; "others": mantém só este.
 */
export async function endSession(scope: "local" | "global" | "others" = "local") {
  const { getSupabase } = await import("@/lib/supabase");
  if (scope !== "others") {
    try { window.sessionStorage.setItem(SIGNING_OUT_KEY, "1"); } catch { /* sem armazenamento */ }
  }
  const { error } = await getSupabase().auth.signOut({ scope });
  if (error && scope !== "local") return error;
  if (scope === "others") return null;
  // Intenções e rascunhos desta aba (ex.: conversa sobre peça) não sobrevivem à saída.
  try {
    Object.keys(window.sessionStorage).filter((key) => key.startsWith("artenos:") && key !== SIGNING_OUT_KEY)
      .forEach((key) => window.sessionStorage.removeItem(key));
  } catch { /* sem armazenamento */ }
  // A última atividade fica: outras abas usam para saber se saíram por
  // inatividade. É renovada no próximo login.
  return null;
}
