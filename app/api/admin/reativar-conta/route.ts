import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabaseAsUser } from '../../../../lib/supabase-admin';
import { sameOrigin } from '../../../../lib/request-guard';
import { accountReactivatedEmail } from '../../../../lib/account-deletion';
import { emailConfigured, sendEmail } from '../../../../lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Equipe reativa uma conta dentro dos 30 dias. A permissão é conferida no banco
// (admin_reactivate_account usa is_active_admin() com a sessão de quem chama);
// depois o login é liberado no Supabase Auth e a pessoa recebe um e-mail.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const asUser = getSupabaseAsUser(request);
  if (!asUser) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  const userId = String(body.userId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: 'Conta inválida.' }, { status: 400 });

  const { data, error } = await asUser.rpc('admin_reactivate_account', { p_user_id: userId });
  if (error) {
    const denied = error.code === '42501';
    return NextResponse.json({ error: denied ? 'Acesso negado.' : error.message }, { status: denied ? 403 : 409 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as { email: string; full_name: string } | undefined;

  const admin = getSupabaseAdmin();
  const { error: unbanError } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  if (unbanError) {
    console.error('[reativar-conta]', unbanError.message);
    return NextResponse.json({ error: 'A conta foi reativada, mas o login não foi liberado. Tente de novo.' }, { status: 500 });
  }
  if (emailConfigured() && row?.email) {
    const firstName = String(row.full_name ?? '').trim().split(/\s+/)[0] ?? '';
    await sendEmail({ to: row.email, ...accountReactivatedEmail(firstName) })
      .catch((mailError) => console.error('[reativar-conta] e-mail:', mailError instanceof Error ? mailError.message : mailError));
  }
  return NextResponse.json({ ok: true });
}
