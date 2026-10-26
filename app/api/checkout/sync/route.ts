import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getUserFromRequest } from '../../../../lib/supabase-admin';
import { findPaymentByReference, getPayment } from '../../../../lib/mercadopago';
import { reconcilePayment } from '../../../../lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A tela de pagamento chama esta rota enquanto espera o Pix (e ao abrir a página).
// Ela pergunta ao Mercado Pago como está o pagamento e atualiza o banco. Assim o fluxo funciona
// mesmo se o webhook atrasar ou não chegar (ex.: testando em localhost).
export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Faça login.' }, { status: 401 });

  let checkoutId = '';
  try {
    const body = (await request.json()) as { checkoutId?: unknown };
    checkoutId = typeof body.checkoutId === 'string' ? body.checkoutId : '';
  } catch {
    // corpo vazio
  }
  if (!UUID_RE.test(checkoutId)) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: checkout } = await admin.from('checkouts').select('*').eq('id', checkoutId).maybeSingle();
  if (!checkout || checkout.client_id !== user.id) {
    return NextResponse.json({ error: 'Compra não encontrada.' }, { status: 404 });
  }
  if (checkout.status === 'approved' || checkout.status === 'refunded') {
    return NextResponse.json({ checkoutStatus: checkout.status });
  }

  try {
    const payment = checkout.mp_payment_id
      ? await getPayment(checkout.mp_payment_id)
      : await findPaymentByReference(checkout.id);

    if (!payment) return NextResponse.json({ checkoutStatus: checkout.status });

    const result = await reconcilePayment(payment);
    return NextResponse.json({ checkoutStatus: result.checkoutStatus ?? checkout.status });
  } catch (error) {
    console.error('[pagamentos] erro ao sincronizar:', error);
    return NextResponse.json({ error: 'Não foi possível consultar o pagamento agora.' }, { status: 502 });
  }
}
