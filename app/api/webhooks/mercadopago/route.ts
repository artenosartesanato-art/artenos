import { NextResponse } from 'next/server';
import { getPayment, MpError, verifyWebhookSignature } from '../../../../lib/mercadopago';
import { reconcilePayment } from '../../../../lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NotificationBody = { type?: string; action?: string; data?: { id?: string | number } } | null;

// O Mercado Pago avisa aqui quando um pagamento muda de estado (aprovado, recusado, reembolsado...).
// Configure em Suas integrações → Webhooks: https://SEU-DOMINIO/api/webhooks/mercadopago (evento "Pagamentos").
// Não confiamos no corpo do aviso: confirmamos a assinatura e consultamos o pagamento direto na API.
export async function POST(request: Request) {
  const url = new URL(request.url);

  let body: NotificationBody = null;
  try {
    body = (await request.json()) as NotificationBody;
  } catch {
    // alguns avisos antigos vêm só na query string
  }

  const queryId = url.searchParams.get('data.id');
  const dataId = queryId ?? (body?.data?.id !== undefined ? String(body.data.id) : null) ?? url.searchParams.get('id');
  const type = body?.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic');

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook não configurado.' }, { status: 503 });
  }
  const valid = verifyWebhookSignature({
    signature: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    dataId: queryId ?? dataId,
    secret,
  });
  if (!valid) {
    console.error('[webhook] assinatura inválida');
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
  }

  if (type !== 'payment' || !dataId) return NextResponse.json({ ignored: true });

  try {
    const payment = await getPayment(dataId);
    const result = await reconcilePayment(payment);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // 404 = pagamento que não existe (ex.: o teste de notificação do painel). Responder 200 evita reenvios.
    if (error instanceof MpError && error.status === 404) return NextResponse.json({ ignored: true });
    console.error('[webhook] erro ao processar:', error);
    return NextResponse.json({ error: 'Falha ao processar.' }, { status: 500 }); // o Mercado Pago tenta de novo
  }
}
