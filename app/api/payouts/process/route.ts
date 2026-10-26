import { NextResponse } from 'next/server';
import { processDuePayouts } from '../../../../lib/payouts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Processa os repasses vencidos (release_after <= agora). Serve para um agendador (ex.: Vercel Cron)
// rodar de tempos em tempos, principalmente quando PAYOUT_HOLD_DAYS > 0.
// Proteção: envie  Authorization: Bearer <CRON_SECRET>  (a Vercel Cron faz isso sozinha se CRON_SECRET existir).
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    return NextResponse.json(await processDuePayouts());
  } catch (error) {
    console.error('[repasses] erro:', error);
    return NextResponse.json({ error: 'Falha ao processar repasses.' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
