// Suspensão de conta (decisão da administração). Sem dependências de React.

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});

export function formatSuspensionEnd(until: string) {
  return dateTime.format(new Date(until)).replace(", ", " às ");
}

/** Texto curto mostrado quando a pessoa tenta fazer algo durante a suspensão. */
export function suspensionMessage(until: string | null | undefined) {
  return until
    ? `Sua conta está suspensa até ${formatSuspensionEnd(until)}. Enquanto isso, você pode navegar, mas não pode comprar, favoritar ou enviar mensagens.`
    : "Sua conta está suspensa. Enquanto isso, você pode navegar, mas não pode comprar, favoritar ou enviar mensagens.";
}

/** Erro do banco por causa da suspensão (o texto começa com "Sua conta está suspensa"). */
export function isSuspensionError(error: unknown) {
  const message = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  return /sua conta está suspensa/i.test(message);
}

/** Suspensão ainda valendo? */
export function isSuspended(until: string | null | undefined, now = Date.now()) {
  return Boolean(until) && new Date(until!).getTime() > now;
}
