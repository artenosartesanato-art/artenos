// Retorno ao destino pretendido depois do login. Só aceita caminhos internos
// para impedir redirecionamentos abertos (ex.: "//site.com" ou "https://").
export const RETURN_PARAM = "voltar";
const BLOCKED_RETURN = /^\/(acesso|cadastro-em-analise)(\/|\?|$)/;

export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(path) || path.length > 300) return null;
  if (BLOCKED_RETURN.test(path)) return null;
  return path;
}

export function currentPath() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

export function accessHref(returnTo?: string | null) {
  const path = safeReturnPath(returnTo);
  return path && path !== "/" ? `/acesso?${RETURN_PARAM}=${encodeURIComponent(path)}` : "/acesso";
}
