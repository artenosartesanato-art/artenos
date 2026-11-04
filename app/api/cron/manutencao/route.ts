import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';
import { sendReviewReminders } from '../../../../lib/review-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Apaga registros vencidos: acessos com mais de 12 meses, tentativas
// bloqueadas no chat com mais de 6 meses e contadores de limite antigos.
// Também envia os pedidos de avaliação (pedidos entregues há 3+ dias), que não
// tinham agendamento próprio. Rode uma vez por dia (vercel.json).
// Authorization: Bearer <CRON_SECRET>.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  // Lembretes primeiro e independentes: uma falha na limpeza não impede os avisos.
  const reviews = await sendReviewReminders().catch((reviewError) => {
    console.error('[manutencao] lembretes de avaliação:', reviewError);
    return null;
  });
  const { data, error } = await getSupabaseAdmin().rpc('purge_expired_records');
  if (error) {
    console.error('[manutencao]', error.message);
    return NextResponse.json({ error: 'Falha na limpeza.', reviews }, { status: 500 });
  }
  return NextResponse.json({ removed: data, reviews });
}

export const GET = handle;
export const POST = handle;
