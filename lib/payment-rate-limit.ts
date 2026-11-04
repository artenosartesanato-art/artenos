// Limite de tentativas de cobrança (contra teste de cartões roubados em massa).
// Conta só as tentativas que chegam ao Mercado Pago: folgado para quem erra o
// cartão algumas vezes, curto para um robô.

export const PAY_LIMITS = [
  { bucket: 'pagamento-usuario', by: 'user', limit: 10, windowSeconds: 600 },
  { bucket: 'pagamento-ip', by: 'ip', limit: 30, windowSeconds: 3600 },
] as const;

type RateLimitRpc = (
  fn: 'rate_limit_hit',
  args: { p_bucket: string; p_key: string; p_limit: number; p_window_seconds: number },
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * true = pode tentar pagar; false = passou do limite (responder 429).
 * Se o contador do banco falhar, libera (não trava vendas): login, origem e o
 * antifraude do Mercado Pago continuam valendo.
 */
export async function paymentAttemptAllowed(rpc: RateLimitRpc, userId: string, ip: string): Promise<boolean> {
  for (const rule of PAY_LIMITS) {
    const { data, error } = await rpc('rate_limit_hit', {
      p_bucket: rule.bucket,
      p_key: rule.by === 'user' ? userId : ip,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      console.error('[pagamentos] limite de tentativas indisponível:', error.message);
      return true;
    }
    if (data === false) return false;
  }
  return true;
}
