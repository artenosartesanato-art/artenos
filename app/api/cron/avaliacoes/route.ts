import { NextResponse } from 'next/server';
import { sendReviewReminders } from '../../../../lib/review-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pede avaliação de pedidos entregues há 3+ dias. Já roda todo dia junto com
// /api/cron/manutencao; esta rota serve para rodar à mão.
// Proteção: Authorization: Bearer <CRON_SECRET>.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    return NextResponse.json(await sendReviewReminders());
  } catch (error) {
    console.error('[avaliacoes] erro:', error);
    return NextResponse.json({ error: 'Falha ao enviar lembretes.' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
