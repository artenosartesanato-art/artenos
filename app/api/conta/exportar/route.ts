import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getUserFromRequest } from '../../../../lib/supabase-admin';
import { clientIp } from '../../../../lib/request-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// LGPD, art. 18: cópia dos dados pessoais da conta, em JSON. Só a própria
// pessoa (token da sessão). Tabelas que não existirem no banco são ignoradas.
const SOURCES: { name: string; table: string; column: string }[] = [
  { name: 'perfil', table: 'profiles', column: 'id' },
  { name: 'pedidos_como_comprador', table: 'orders', column: 'client_id' },
  { name: 'vendas_da_loja', table: 'orders', column: 'artisan_id' },
  { name: 'compras_abertas', table: 'checkouts', column: 'client_id' },
  { name: 'mensagens_enviadas', table: 'messages', column: 'sender_id' },
  { name: 'conversas_como_comprador', table: 'conversations', column: 'client_id' },
  { name: 'conversas_da_loja', table: 'conversations', column: 'artisan_id' },
  { name: 'favoritos', table: 'storefront_favorites', column: 'user_id' },
  { name: 'carrinho', table: 'cart_items', column: 'client_id' },
  { name: 'avaliacoes_de_pecas', table: 'product_reviews', column: 'client_id' },
  { name: 'avaliacoes_de_lojas', table: 'store_reviews', column: 'client_id' },
  { name: 'pedidos_de_orcamento', table: 'custom_order_requests', column: 'client_id' },
  { name: 'denuncias', table: 'conversation_reports', column: 'reporter_id' },
  { name: 'chamados_de_ajuda', table: 'support_tickets', column: 'user_id' },
  { name: 'notificacoes', table: 'notifications', column: 'user_id' },
  { name: 'pecas_da_loja', table: 'products', column: 'artisan_id' },
  { name: 'configuracoes_da_loja', table: 'artisan_store_settings', column: 'artisan_id' },
  { name: 'conta_de_repasse', table: 'payout_accounts', column: 'artisan_id' },
  { name: 'repasses', table: 'payouts', column: 'artisan_id' },
  { name: 'registros_de_acesso', table: 'access_logs', column: 'user_id' },
];

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const admin = getSupabaseAdmin();
  const { data: allowed } = await admin.rpc('rate_limit_hit', { p_bucket: 'exportar-dados', p_key: user.id, p_limit: 5, p_window_seconds: 3600 });
  if (allowed === false) return NextResponse.json({ error: 'Muitas exportações seguidas. Tente de novo em uma hora.' }, { status: 429 });

  const result: Record<string, unknown> = {
    gerado_em: new Date().toISOString(),
    conta: { id: user.id, email: user.email, criada_em: user.created_at, ultimo_acesso: user.last_sign_in_at },
  };
  for (const source of SOURCES) {
    const { data, error } = await admin.from(source.table).select('*').eq(source.column, user.id).limit(5000);
    if (!error && data && data.length) result[source.name] = data;
  }
  const orderIds = ((result.pedidos_como_comprador as { id: string }[] | undefined) ?? []).map((order) => order.id);
  if (orderIds.length) {
    const { data } = await admin.from('order_items').select('*').in('order_id', orderIds.slice(0, 1000));
    if (data?.length) result.itens_dos_pedidos = data;
  }

  await admin.from('access_logs').insert({ user_id: user.id, event: 'data_export', ip: /^[0-9a-f:.]+$/i.test(clientIp(request)) ? clientIp(request) : null });
  return new NextResponse(JSON.stringify(result, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="artenos-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
