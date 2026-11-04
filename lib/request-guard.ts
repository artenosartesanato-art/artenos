// Proteções comuns das rotas POST do servidor.

/**
 * Bloqueia POST vindo de outro site (CSRF): o Origin (ou o Referer) precisa
 * ser o próprio domínio da requisição ou o NEXT_PUBLIC_SITE_URL.
 */
export function sameOrigin(request: Request): boolean {
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) return false;
  let origin: string;
  try {
    origin = new URL(source).origin;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  try { allowed.add(new URL(request.url).origin); } catch { /* ignore */ }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host) allowed.add(`${proto}://${host}`);
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) { try { allowed.add(new URL(site).origin); } catch { /* ignore */ } }
  return allowed.has(origin);
}

/** IP de quem chamou (atrás do proxy da hospedagem). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "desconhecido").trim();
}
