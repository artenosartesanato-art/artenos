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
  "/ajuda": ["/ajuda"],
  "/vendedor/mensagens": ["/vendedor/mensagens"],
};

/** O item está ativo na própria rota e em qualquer sub-rota (/x ou /x/...). */
export function isNavActive(href: string, pathname: string) {
  const prefixes = NAV_MATCHES[href] ?? [href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type AccountRole = "admin" | "seller" | "client";
export type AccountLink = { href: string; label: string };

/** Opções do menu da conta no cabeçalho, conforme o papel. */
export function accountLinks(role: AccountRole): AccountLink[] {
  if (role === "admin") {
    return [
      { href: "/administracao", label: "Painel de administração" },
      { href: "/administracao/perfil", label: "Meu perfil" },
    ];
  }
  if (role === "seller") {
    return [
      { href: "/vendedor", label: "Painel da loja" },
      { href: "/vendedor/perfil", label: "Meu perfil" },
      { href: "/pedidos", label: "Meus pedidos" },
    ];
  }
  return [
    { href: "/perfil", label: "Meu perfil" },
    { href: "/pedidos", label: "Meus pedidos" },
    { href: "/favoritos", label: "Favoritos" },
  ];
}

/** Páginas de comprador ou de loja que não existem para a equipe: o admin vai para o painel. */
const BUYER_ONLY = ["/perfil", "/pedidos", "/carrinho", "/comprar-agora", "/pagamento", "/favoritos", "/mensagens", "/vendedor", "/cadastro-em-analise", "/repasses"];

export function adminRedirectFor(pathname: string): string | null {
  return BUYER_ONLY.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ? "/administracao" : null;
}

export type LoginAccount = "admin" | "seller" | "client";

const startsWithSection = (path: string, section: string) =>
  path === section || path.startsWith(`${section}/`) || path.startsWith(`${section}?`) || path.startsWith(`${section}#`);

/**
 * Para onde voltar depois de entrar, conferindo se a conta pode abrir a página.
 * O "voltar" pode ter ficado de outra sessão (ex.: a sessão da equipe expirou
 * no painel e depois entrou a conta de uma loja): nesse caso é ignorado e a
 * pessoa vai para a página inicial da própria conta.
 */
export function returnPathForAccount(returnTo: string | null | undefined, account: LoginAccount): string | null {
  const path = safeReturnPath(returnTo);
  if (!path) return null;
  if (startsWithSection(path, "/administracao")) return account === "admin" ? path : null;
  if (account === "admin") return null; // a equipe só usa o painel
  if (startsWithSection(path, "/vendedor")) return account === "seller" ? path : null;
  return path;
}
