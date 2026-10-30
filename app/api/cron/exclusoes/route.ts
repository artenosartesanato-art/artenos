import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';
import { originalPathFor } from '../../../../lib/avatar-crop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Exclusão definitiva das contas cujo prazo de 30 dias venceu. Rodada uma vez
// por dia pela Vercel (vercel.json) com Authorization: Bearer <CRON_SECRET>.
// Idempotente: contas já excluídas não são processadas de novo.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('finalize_due_deletions');
  if (error) {
    console.error('[exclusoes]', error.message);
    return NextResponse.json({ error: 'Falha ao excluir as contas vencidas.' }, { status: 500 });
  }
  const result = data as { processed: number; accounts: { id: string; avatar_path: string | null }[]; failed: unknown[] };
  for (const account of result.accounts ?? []) {
    // Login com e-mail inválido e bloqueio permanente; a foto sai do Storage.
    const { error: authError } = await admin.auth.admin.updateUserById(account.id, {
      email: `excluida-${account.id.replace(/-/g, '')}@conta-excluida.invalid`,
      email_confirm: true, phone: '', user_metadata: {}, ban_duration: '876000h',
    });
    if (authError) console.error('[exclusoes] auth', account.id, authError.message);
    if (account.avatar_path) {
      await admin.storage.from('artenos-profile-avatars').remove([account.avatar_path, originalPathFor(account.avatar_path)]).catch(() => null);
    }
  }
  if (result.failed?.length) console.error('[exclusoes] falhas:', JSON.stringify(result.failed));
  console.info(`[exclusoes] ${result.processed} conta(s) excluída(s) definitivamente.`);
  return NextResponse.json({ processed: result.processed, failed: result.failed?.length ?? 0 });
}

export const GET = handle;
export const POST = handle;
