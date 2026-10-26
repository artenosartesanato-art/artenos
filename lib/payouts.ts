import 'server-only';
import { getSupabaseAdmin } from './supabase-admin';
import { MpError, mpRequest } from './mercadopago';

type PayoutRow = { id: string; artisan_id: string; net_amount: number | string; attempts: number };
type MpPayoutResponse = { id?: string; status?: string };

// PAYOUTS_MODE:
//   off  (padrão) -> os repasses ficam "pending" na tabela payouts; você paga por Pix no app do banco
//                    e marca como pago (select public.finish_payout('<id>', 'paid', 'referência');).
//   test          -> envia à API de Payouts do Mercado Pago em modo de teste (X-test-token), sem mover dinheiro real.
// Repasse automático real exige a assinatura da requisição (X-signature) e habilitação da conta no Mercado Pago;
// isso NÃO está implementado aqui (a documentação não detalha o processo). Veja a documentação de Payouts.
export async function processDuePayouts(limit = 20) {
  const mode = process.env.PAYOUTS_MODE ?? 'off';
  if (mode === 'off') return { mode, processed: 0 };
  if (mode !== 'test') {
    throw new Error('PAYOUTS_MODE inválido. Use "off" ou "test". Repasse automático em produção ainda não foi implementado.');
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('claim_due_payouts', { p_limit: limit });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as PayoutRow[];
  let sent = 0;

  for (const row of rows) {
    const finish = (result: 'sent' | 'retry' | 'failed', reference: string | null, message: string | null) =>
      admin.rpc('finish_payout', { p_id: row.id, p_result: result, p_reference: reference, p_error: message });

    try {
      const { data: account, error: accountError } = await admin
        .from('payout_accounts')
        .select('pix_key_type, pix_key')
        .eq('artisan_id', row.artisan_id)
        .maybeSingle();
      if (accountError) throw new Error(accountError.message);

      if (!account) {
        await finish('retry', null, 'A artesã ainda não cadastrou a chave Pix.');
        continue;
      }

      const value = Number(row.net_amount);
      if (value < 1) {
        await finish('failed', null, 'Valor líquido abaixo do mínimo de R$ 1,00 para repasse.');
        continue;
      }

      const response = await mpRequest<MpPayoutResponse>('/v1/payouts', {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': `${row.id}-${row.attempts}`,
          'X-test-token': 'true',
          'X-enforce-signature': 'false',
        },
        body: {
          external_reference: row.id,
          description: 'Repasse Artenós',
          transactions: [
            {
              description: 'Repasse de venda no Artenós',
              type: 'pix',
              pix: { type: account.pix_key_type, chave: account.pix_key },
              amount: { currency: 'BRL', value },
              external_reference: row.id,
            },
          ],
        },
      });

      await finish('sent', response.id ?? null, null);
      sent += 1;
    } catch (error) {
      const message = error instanceof MpError ? `${error.message} (${error.status})` : String(error);
      console.error('[repasses] falha ao enviar', row.id, message);
      await finish('retry', null, message.slice(0, 500));
    }
  }

  return { mode, processed: rows.length, sent };
}
