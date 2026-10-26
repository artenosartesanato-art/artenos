import 'server-only';
import { getSupabaseAdmin } from './supabase-admin';
import { gatewayFeeOf, type MpPayment } from './mercadopago';
import { sendReceiptEmail } from './receipt-email';
import { processDuePayouts } from './payouts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cents = (value: number | string) => Math.round(Number(value) * 100);

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} inválido: use um número entre ${min} e ${max}.`);
  }
  return value;
}

// % do Artenós sobre o valor de cada artesã (PLATFORM_FEE_PERCENT, padrão 10) e dias de espera antes do repasse
// (PAYOUT_HOLD_DAYS, padrão 0). Ficam no servidor: o navegador nunca decide a comissão.
export const payoutHoldDays = () => numberEnv('PAYOUT_HOLD_DAYS', 0, 0, 90);

export type ReconcileResult = { handled: boolean; checkoutStatus?: string; reason?: string };

// Ponto único que transforma "o que o Mercado Pago diz" em "o que acontece no Artenós".
// Chamado pelo webhook, pela rota de pagamento e pela rota de sincronização. Pode rodar várias vezes
// para o mesmo pagamento sem efeitos duplicados.
export async function reconcilePayment(payment: MpPayment): Promise<ReconcileResult> {
  const reference = payment.external_reference ?? '';
  if (!UUID_RE.test(reference)) return { handled: false, reason: 'pagamento sem referência do Artenós' };

  const admin = getSupabaseAdmin();
  const { data: checkout, error } = await admin.from('checkouts').select('*').eq('id', reference).maybeSingle();
  if (error) throw new Error(error.message);
  if (!checkout) return { handled: false, reason: 'compra não encontrada' };

  const paymentId = String(payment.id);
  if (checkout.integration_version === 2 &&
      payment.metadata?.artenos_attempt_id !== checkout.payment_attempt_id) {
    throw new Error('Tentativa de pagamento diferente da registrada; conciliação manual necessária.');
  }

  // ---------- aprovado ----------
  if (payment.status === 'approved') {
    const sameAmount = cents(payment.transaction_amount) === cents(checkout.total_amount);
    const sameCurrency = !payment.currency_id || payment.currency_id === 'BRL';
    if (!sameAmount || !sameCurrency) {
      console.error('[pagamentos] valor ou moeda divergente', {
        checkout: checkout.id,
        esperado: checkout.total_amount,
        recebido: payment.transaction_amount,
        moeda: payment.currency_id,
      });
      return { handled: false, reason: 'valor divergente do pedido' };
    }

    const { error: finalizeError } = await admin.rpc('finalize_checkout', {
      p_checkout_id: checkout.id,
      p_mp_payment_id: paymentId,
      p_payment_method: payment.payment_type_id ?? payment.payment_method_id ?? null,
      p_gateway_fee: gatewayFeeOf(payment),
      p_fee_percent: Number(checkout.platform_fee_percent ?? 0),
      p_hold_days: payoutHoldDays(),
    });
    if (finalizeError) throw new Error(finalizeError.message);

    await admin.from('checkouts').update({ mp_status_detail: payment.status_detail ?? null }).eq('id', checkout.id);

    // Etapas posteriores: falhar aqui não pode desfazer o pagamento, e todas são seguras de repetir.
    await sendReceiptEmail(checkout.id).catch((e) => console.error('[comprovante] não enviado:', String(e)));
    await processDuePayouts().catch((e) => console.error('[repasses] erro:', String(e)));

    return { handled: true, checkoutStatus: 'approved' };
  }

  // ---------- reembolso / estorno ----------
  if (payment.status === 'refunded' || payment.status === 'charged_back') {
    if (checkout.status === 'approved' && checkout.mp_payment_id === paymentId) {
      const { data: alreadyPaid, error: refundError } = await admin.rpc('mark_checkout_refunded', {
        p_checkout_id: checkout.id,
      });
      if (refundError) throw new Error(refundError.message);
      if (Number(alreadyPaid) > 0) {
        console.error('[pagamentos] reembolso com repasse já pago ou em andamento: acerte manualmente', checkout.id);
      }
      return { handled: true, checkoutStatus: 'refunded' };
    }
    return { handled: false, reason: 'reembolso de pagamento que não é o atual' };
  }

  // ---------- demais estados: só valem para o pagamento atual da compra ----------
  if (checkout.status !== 'pending' && checkout.status !== 'awaiting_payment') {
    return { handled: false, reason: `compra já está ${checkout.status}` };
  }
  if (checkout.mp_payment_id && checkout.mp_payment_id !== paymentId) {
    return { handled: false, reason: 'pagamento antigo' };
  }

  const qr = payment.point_of_interaction?.transaction_data;
  const { error: stateError } = await admin.rpc('record_checkout_payment', {
    p_checkout_id: checkout.id,
    p_attempt_id: payment.metadata?.artenos_attempt_id ?? null,
    p_payment_id: paymentId, p_status: payment.status,
    p_detail: payment.status_detail ?? null,
    p_method: payment.payment_type_id ?? payment.payment_method_id ?? null,
    p_qr: qr?.qr_code ?? null, p_qr_base64: qr?.qr_code_base64 ?? null,
    p_expires: payment.date_of_expiration ?? null,
  });
  if (stateError) throw new Error(stateError.message);
  const { data: refreshed } = await admin.from('checkouts').select('status').eq('id', checkout.id).single();
  return { handled: true, checkoutStatus: refreshed?.status };
}
