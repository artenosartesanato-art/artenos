// Limite de tentativas de login neste navegador (camada extra: o Supabase
// também limita no servidor). Depois de 5 erros em 10 min para o mesmo
// e-mail, espera 1 min; cada novo bloqueio dobra, até 15 min.
// Guarda só um resumo (hash) do e-mail, nunca o endereço.

export const MAX_FAILURES = 5;
export const WINDOW_MS = 10 * 60_000;
export const BASE_LOCK_MS = 60_000;
export const MAX_LOCK_MS = 15 * 60_000;
const KEY = "artenos:tentativas-login";

export type ThrottleEntry = { failures: number[]; lockedUntil: number; locks: number };
export type ThrottleState = Record<string, ThrottleEntry>;

export function emailKey(email: string) {
  let hash = 5381;
  for (const char of email.trim().toLowerCase()) hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0;
  return (hash >>> 0).toString(36);
}

export function checkThrottle(state: ThrottleState, email: string, now: number) {
  const entry = state[emailKey(email)];
  const retryInMs = entry ? Math.max(0, entry.lockedUntil - now) : 0;
  return { allowed: retryInMs === 0, retryInMs };
}

export function registerFailure(state: ThrottleState, email: string, now: number): ThrottleState {
  const key = emailKey(email);
  const entry = state[key] ?? { failures: [], lockedUntil: 0, locks: 0 };
  const failures = [...entry.failures.filter((time) => now - time < WINDOW_MS), now];
  if (failures.length < MAX_FAILURES) return { ...state, [key]: { ...entry, failures } };
  const lock = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** entry.locks);
  return { ...state, [key]: { failures: [], lockedUntil: now + lock, locks: entry.locks + 1 } };
}

export function registerSuccess(state: ThrottleState, email: string): ThrottleState {
  const next = { ...state };
  delete next[emailKey(email)];
  return next;
}

export function loadThrottle(): ThrottleState {
  try { return JSON.parse(window.localStorage.getItem(KEY) || "{}") as ThrottleState; } catch { return {}; }
}

export function saveThrottle(state: ThrottleState) {
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sem armazenamento */ }
}

export function waitLabel(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}
