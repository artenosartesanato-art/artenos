// Suspensão de conta (decisão da administração). Sem dependências de React.

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});

export function formatSuspensionEnd(until: string) {
  return dateTime.format(new Date(until)).replace(", ", " às ");
}

export type SuspendedRole = "client" | "artisan";

/** O que a conta não pode fazer, conforme seja cliente ou loja. */
export function suspensionLimits(role: SuspendedRole | null | undefined) {
  return role === "artisan"
    ? "Ela fica fora da vitrine e você não pode publicar ou editar peças, alterar a loja, comprar, favoritar ou enviar mensagens. Os pedidos já pagos ainda podem ser enviados."
    : "Você pode navegar pela Artenós, mas não pode comprar, favoritar ou enviar mensagens.";
}

/** Título do aviso: "Sua conta" (cliente) ou "Sua loja" (vendedora). */
export function suspensionTitle(until: string | null | undefined, role: SuspendedRole | null | undefined) {
  const subject = role === "artisan" ? "Sua loja está suspensa" : "Sua conta está suspensa";
  return until ? `${subject} até ${formatSuspensionEnd(until)}.` : `${subject}.`;
}

/** Texto mostrado quando a pessoa tenta fazer algo durante a suspensão. */
export function suspensionMessage(until: string | null | undefined, role?: SuspendedRole | null) {
  return `${suspensionTitle(until, role)} ${suspensionLimits(role)}`;
}

/** Erro do banco por causa da suspensão (o texto começa com "Sua conta está suspensa"). */
export function isSuspensionError(error: unknown) {
  const message = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  return /sua (conta|loja) está suspensa/i.test(message);
}

/** Suspensão ainda valendo? */
export function isSuspended(until: string | null | undefined, now = Date.now()) {
  return Boolean(until) && new Date(until!).getTime() > now;
}
