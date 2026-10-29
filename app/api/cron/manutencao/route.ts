import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Apaga registros vencidos: acessos com mais de 12 meses, tentativas
// bloqueadas no chat com mais de 6 meses e contadores de limite antigos.
// Rode uma vez por dia (ex.: Vercel Cron). Authorization: Bearer <CRON_SECRET>.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const { data, error } = await getSupabaseAdmin().rpc('purge_expired_records');
  if (error) {
    console.error('[manutencao]', error.message);
    return NextResponse.json({ error: 'Falha na limpeza.' }, { status: 500 });
  }
  return NextResponse.json({ removed: data });
}

export const GET = handle;
export const POST = handle;
