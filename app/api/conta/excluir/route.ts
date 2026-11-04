import { NextResponse } from 'next/server';
import { auditIp, getSupabaseAdmin, getUserFromRequest } from '../../../../lib/supabase-admin';
import { clientIp, sameOrigin } from '../../../../lib/request-guard';
import { deletionRequestedEmail } from '../../../../lib/account-deletion';
import { emailConfigured, sendEmail } from '../../../../lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pedido de exclusão da conta (LGPD, art. 18, VI), em duas etapas:
// agora a conta é desativada (public.request_account_deletion), o login é
// bloqueado e todas as sessões terminam; em 30 dias o job /api/cron/exclusoes
// apaga ou anonimiza de vez. Até lá, só a equipe reativa (pedido por e-mail).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (String(body.confirm ?? '').trim() !== 'EXCLUIR') {
    return NextResponse.json({ error: 'Digite EXCLUIR para confirmar.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: blockers, error: checkError } = await admin.rpc('account_deletion_blockers', { p_user_id: user.id });
  if (checkError) return NextResponse.json({ error: 'Não foi possível verificar a conta agora.' }, { status: 500 });
  if (Array.isArray(blockers) && blockers.length) {
    return NextResponse.json({ error: 'Ainda não é possível excluir a conta.', blockers }, { status: 409 });
  }

  const { data: scheduledAt, error: requestError } = await admin.rpc('request_account_deletion', {
    p_user_id: user.id, p_ip: auditIp(clientIp(request)),
  });
  if (requestError || !scheduledAt) {
    console.error('[excluir-conta]', requestError?.message);
    const message = requestError?.message.replace(/^EXCLUSAO:\s*/, '') ?? '';
    return message.startsWith('Há ')
      ? NextResponse.json({ error: 'Ainda não é possível excluir a conta.', blockers: [message] }, { status: 409 })
      : NextResponse.json({ error: 'Não foi possível excluir a conta agora.' }, { status: 500 });
  }

  // Login bloqueado até a exclusão definitiva (+1 dia de folga para o job) e
  // todas as sessões encerradas, em todos os aparelhos.
  const hours = Math.ceil((new Date(String(scheduledAt)).getTime() - Date.now()) / 3_600_000) + 24;
  const { error: banError } = await admin.auth.admin.updateUserById(user.id, { ban_duration: `${hours}h` });
  if (banError) console.error('[excluir-conta] bloqueio:', banError.message);
  await admin.auth.admin.signOut(request.headers.get('authorization')!.slice(7), 'global').catch(() => null);

  if (emailConfigured() && user.email) {
    const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    const firstName = String(profile?.full_name ?? '').trim().split(/\s+/)[0] ?? '';
    const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ?? '';
    await sendEmail({ to: user.email, ...deletionRequestedEmail(firstName, String(scheduledAt), support), replyTo: support || undefined })
      .catch((error) => console.error('[excluir-conta] e-mail:', error instanceof Error ? error.message : error));
  }
  return NextResponse.json({ ok: true, scheduledAt });
}
