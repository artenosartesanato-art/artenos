import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getUserFromRequest } from '../../../lib/supabase-admin';
import { clientIp, sameOrigin } from '../../../lib/request-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVENTS = new Set(['login', 'logout', 'password_reset']);

// Registro de acesso (Marco Civil, art. 15): conta, evento, IP, navegador e
// horário. Guardado por 12 meses e apagado pela rota /api/cron/manutencao.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { event?: string };
  if (!body.event || !EVENTS.has(body.event)) return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 });
  const ip = clientIp(request);
  const { error } = await getSupabaseAdmin().from('access_logs').insert({
    user_id: user.id,
    event: body.event,
    ip: /^[0-9a-f:.]+$/i.test(ip) ? ip : null,
    user_agent: (request.headers.get('user-agent') ?? '').slice(0, 400) || null,
  });
  if (error) {
    console.error('[registro-acesso]', error.message);
    return NextResponse.json({ error: 'Não registrado.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
