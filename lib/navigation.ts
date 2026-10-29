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

/** Quem tem loja usa só as mensagens do painel; clientes, /mensagens. */
export function messagesHref(sellerPanel: boolean, query = "") {
  const base = sellerPanel ? "/vendedor/mensagens" : "/mensagens";
  return query ? `${base}?${query.replace(/^\?/, "")}` : base;
}

/**
 * Rotas que acendem cada item do menu principal. A página de uma loja é
 * /loja?id=… (singular), então "Lojas" precisa reconhecer /loja também.
 */
export const NAV_MATCHES: Record<string, string[]> = {
  "/categorias": ["/categorias"],
  "/lojas": ["/lojas", "/loja"],
  "/favoritos": ["/favoritos"],
  "/pedidos": ["/pedidos", "/pagamento"],
  "/mensagens": ["/mensagens"],
  "/vendedor/mensagens": ["/vendedor/mensagens"],
};

/** O item está ativo na própria rota e em qualquer sub-rota (/x ou /x/...). */
export function isNavActive(href: string, pathname: string) {
  const prefixes = NAV_MATCHES[href] ?? [href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
