import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getUserFromRequest } from '../../../../lib/supabase-admin';
import { createPayment, MpError } from '../../../../lib/mercadopago';
import { reconcilePayment } from '../../../../lib/payments';
import { clientIp, sameOrigin } from '../../../../lib/request-guard';
import { paymentAttemptAllowed } from '../../../../lib/payment-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INSTALLMENTS = 12;

type PayBody = { checkoutId?: unknown; formData?: unknown; deviceId?: unknown };

// Recebe os dados do Payment Brick (token do cartão ou Pix) e cria o pagamento no Mercado Pago.
// O VALOR vem do banco (checkouts.total_amount), nunca do navegador.
export async function POST(request: Request) {
  // Só aceita chamadas da própria página (proteção contra CSRF).
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Faça login para pagar.' }, { status: 401 });

  let body: PayBody;
  let attemptId: string | null = null;
  try {
    body = (await request.json()) as PayBody;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const checkoutId = typeof body.checkoutId === 'string' ? body.checkoutId : '';
  const formData =
    body.formData && typeof body.formData === 'object' ? (body.formData as Record<string, unknown>) : null;
  if (!UUID_RE.test(checkoutId) || !formData) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: checkout } = await admin.from('checkouts').select('*').eq('id', checkoutId).maybeSingle();
  if (!checkout || checkout.client_id !== user.id) {
    return NextResponse.json({ error: 'Compra não encontrada.' }, { status: 404 });
  }
  if (checkout.status === 'approved') {
    return NextResponse.json({ status: 'approved', checkoutStatus: 'approved' });
  }
  if (checkout.status === 'cancelled' || checkout.status === 'refunded') {
    return NextResponse.json({ error: 'Esta compra não está mais disponível. Volte ao carrinho.' }, { status: 409 });
  }
  if (checkout.status === 'awaiting_payment') {
    // Já existe um pagamento em andamento (ex.: Pix gerado). Não cria outro.
    return NextResponse.json({ status: 'pending', checkoutStatus: 'awaiting_payment' });
  }
  if (checkout.integration_version !== 2) {
    return NextResponse.json({ error: 'Esta compra é anterior à integração de frete. Entre em contato com o suporte.' }, { status: 409 });
  }

  // Só Pix e cartão. O Brick já é configurado assim, e aqui o servidor garante.
  const paymentMethodId = typeof formData.payment_method_id === 'string' ? formData.payment_method_id : '';
  const cardToken = typeof formData.token === 'string' ? formData.token : '';
  const isPix = paymentMethodId === 'pix';
  const isCard = cardToken.length > 0 && paymentMethodId.length > 0 && !isPix;
  if (!isPix && !isCard) {
    return NextResponse.json({ error: 'Forma de pagamento não permitida. Use Pix ou cartão.' }, { status: 400 });
  }

  // Parcelas escolhidas no Brick (cartão). O Mercado Pago ainda valida se a opção existe para o cartão/valor.
  const installments = Number(formData.installments ?? 1);
  if (isCard && (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS)) {
    return NextResponse.json({ error: 'Parcelamento inválido.' }, { status: 400 });
  }

  const [{ data: profile }, { data: items }] = await Promise.all([
    admin.from('profiles').select('full_name, document').eq('id', user.id).maybeSingle(),
    admin.from('checkout_items').select('product_id, product_name, unit_price, quantity').eq('checkout_id', checkoutId),
  ]);

  const document = String(profile?.document ?? '').replace(/\D/g, '');
  const [firstName, ...lastNames] = String(profile?.full_name ?? '').trim().split(/\s+/);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const payload: Record<string, unknown> = {
    transaction_amount: Number(checkout.total_amount),
    description: `Pedido Artenós ${checkoutId.slice(0, 8)}`,
    payment_method_id: paymentMethodId,
    external_reference: checkoutId,
    statement_descriptor: 'ARTENOS',
    payer: {
      email: user.email,
      first_name: firstName || undefined,
      last_name: lastNames.join(' ') || undefined,
      identification: document ? { type: document.length === 14 ? 'CNPJ' : 'CPF', number: document } : undefined,
    },
    additional_info: {
      items: (items ?? []).map((item) => ({
        id: String(item.product_id ?? ''),
        title: item.product_name,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
      })),
    },
  };
  if (isCard) {
    payload.token = cardToken;
    payload.installments = installments;
    if (formData.issuer_id !== undefined && formData.issuer_id !== null && formData.issuer_id !== '') {
      payload.issuer_id = formData.issuer_id;
    }
  }
  // O Mercado Pago só avisa URLs públicas em HTTPS. Em localhost a tela consulta o status sozinha (/api/checkout/sync).
  if (siteUrl.startsWith('https://')) {
    payload.notification_url = `${siteUrl.replace(/\/$/, '')}/api/webhooks/mercadopago`;
  }

  // Limite de tentativas de cobrança por conta e por IP (ver lib/payment-rate-limit.ts).
  if (!(await paymentAttemptAllowed((fn, args) => admin.rpc(fn, args), user.id, clientIp(request)))) {
    return NextResponse.json(
      { error: 'Muitas tentativas de pagamento seguidas. Aguarde alguns minutos e tente de novo.' },
      { status: 429 },
    );
  }

  try {
    const { data: claimedAttempt, error: attemptError } = await admin.rpc('begin_checkout_payment', { p_checkout_id: checkoutId });
    if (attemptError || !claimedAttempt) {
      return NextResponse.json({ error: attemptError?.message ?? 'Não foi possível reservar o pagamento.' }, { status: 409 });
    }
    attemptId = String(claimedAttempt);
    payload.metadata = { artenos_attempt_id: attemptId };
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : undefined;
    const payment = await createPayment(payload, String(attemptId), deviceId);
    const result = await reconcilePayment(payment);

    return NextResponse.json({
      status: payment.status,
      statusDetail: payment.status_detail ?? null,
      checkoutStatus: result.checkoutStatus ?? checkout.status,
    });
  } catch (error) {
    if (error instanceof MpError) {
      const pixKeyUnavailable = isPix && /collector user without key enabled for qr render/i.test(error.message);
      const creationDefinitelyRejected = [400, 401, 403, 422].includes(error.status);
      // 400/401/403/422 são recusas explícitas, sem cobrança criada. Timeout, 429 e 5xx
      // têm resultado incerto: nesses casos mantemos a tentativa para conciliação.
      if (attemptId && creationDefinitelyRejected) {
        const { error: resetError } = await admin.rpc('record_checkout_payment', {
          p_checkout_id: checkoutId, p_attempt_id: attemptId, p_payment_id: null,
          p_status: 'rejected', p_detail: pixKeyUnavailable ? 'pix_key_not_enabled' : 'invalid_request', p_method: null,
          p_qr: null, p_qr_base64: null, p_expires: null,
        });
        if (resetError) {
          console.error('[pagamentos] não foi possível restaurar a tentativa recusada:', resetError);
          return NextResponse.json({ error: 'O pagamento foi recusado, mas não foi possível liberar uma nova tentativa. Atualize o status antes de tentar novamente.' }, { status: 503 });
        }
      }
      console.error('[pagamentos] Mercado Pago recusou a criação do pagamento:', error.status, JSON.stringify(error.body));
      return NextResponse.json({
        error: pixKeyUnavailable
          ? creationDefinitelyRejected
            ? 'Pix indisponível: a conta recebedora precisa ter uma chave Pix ativa no Mercado Pago. Use cartão ou tente novamente após a regularização.'
            : 'Pix indisponível. Atualize o status da compra antes de tentar outro pagamento.'
          : `Não foi possível processar o pagamento: ${error.message}`,
      }, { status: 502 });
    }
    console.error('[pagamentos] erro inesperado:', error);
    return NextResponse.json({ error: 'Erro inesperado ao processar o pagamento.' }, { status: 500 });
  }
}
