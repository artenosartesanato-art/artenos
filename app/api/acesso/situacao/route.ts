import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';
import { clientIp, sameOrigin } from '../../../../lib/request-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tela de login: o Supabase só responde "conta bloqueada" quando a senha está
// certa. Para mostrar a data da exclusão sem revelar contas a terceiros, esta
// rota confere e-mail e senha de novo e só então lê a situação da conta.
// Senha errada (ou conta inexistente) devolve "unknown", como qualquer erro.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const admin = getSupabaseAdmin();
  const { data: allowed } = await admin.rpc('rate_limit_hit', { p_bucket: 'situacao-conta', p_key: clientIp(request), p_limit: 10, p_window_seconds: 600 });
  if (allowed === false) return NextResponse.json({ status: 'unknown' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password || email.length > 254 || password.length > 200) return NextResponse.json({ status: 'unknown' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  const probe = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (data.session) {
    // Entrou (conta ativa): não é o caso desta rota; encerra a sessão criada aqui.
    await admin.auth.admin.signOut(data.session.access_token, 'local').catch(() => null);
    return NextResponse.json({ status: 'unknown' });
  }
  if (error?.code !== 'user_banned') return NextResponse.json({ status: 'unknown' });

  const { data: rows } = await admin.rpc('account_status_by_email', { p_email: email });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (row?.account_status === 'pending_deletion' && row.deletion_scheduled_at) {
    return NextResponse.json({ status: 'pending_deletion', scheduledAt: row.deletion_scheduled_at });
  }
  return NextResponse.json({ status: 'blocked' });
}
