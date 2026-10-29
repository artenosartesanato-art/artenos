import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getUserFromRequest } from '../../../../lib/supabase-admin';
import { sameOrigin } from '../../../../lib/request-guard';
import { originalPathFor } from '../../../../lib/avatar-crop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Exclusão da conta a pedido da pessoa (LGPD, art. 18, VI). Anonimiza o perfil
// e apaga o que não precisa ser guardado (public.anonymize_account); pedidos e
// pagamentos ficam pelos prazos legais, sem nome, documento ou contato.
// O acesso é bloqueado e o e-mail de login é trocado por um endereço inválido.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (String(body.confirm ?? '').trim().toUpperCase() !== 'EXCLUIR') {
    return NextResponse.json({ error: 'Digite EXCLUIR para confirmar.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: blockers, error: checkError } = await admin.rpc('account_deletion_blockers', { p_user_id: user.id });
  if (checkError) return NextResponse.json({ error: 'Não foi possível verificar a conta agora.' }, { status: 500 });
  if (Array.isArray(blockers) && blockers.length) {
    return NextResponse.json({ error: `Ainda não é possível excluir a conta. ${blockers.join(' ')}` }, { status: 409 });
  }

  const { data: profile } = await admin.from('profiles').select('avatar_path').eq('id', user.id).maybeSingle();
  const { error: anonymizeError } = await admin.rpc('anonymize_account', { p_user_id: user.id });
  if (anonymizeError) {
    console.error('[excluir-conta]', anonymizeError.message);
    const message = anonymizeError.message.replace(/^EXCLUSAO:\s*/, '');
    return NextResponse.json({ error: message.startsWith('Há ') ? `Ainda não é possível excluir a conta. ${message}` : 'Não foi possível excluir a conta agora.' }, { status: 500 });
  }

  if (profile?.avatar_path) {
    const path = String(profile.avatar_path);
    await admin.storage.from('artenos-profile-avatars').remove([path, originalPathFor(path)]).catch(() => null);
  }
  const anonymousEmail = `excluida-${user.id.replace(/-/g, '')}@conta-excluida.invalid`;
  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    email: anonymousEmail,
    email_confirm: true,
    phone: '',
    user_metadata: {},
    ban_duration: '876000h',
  });
  if (authError) console.error('[excluir-conta] auth:', authError.message);
  await admin.auth.admin.signOut(request.headers.get('authorization')!.slice(7), 'global').catch(() => null);
  return NextResponse.json({ ok: true });
}
