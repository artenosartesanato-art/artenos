import { NextResponse } from 'next/server';
import { auditIp, getSupabaseAdmin, getUserFromRequest } from '../../../../lib/supabase-admin';
import { clientIp } from '../../../../lib/request-guard';
import { buildExport, exportFileName, exportToJson, type ExportInput } from '../../../../lib/data-export';
import { exportToXlsx } from '../../../../lib/data-export-xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// LGPD, art. 18: cópia dos dados da conta. Planilha (padrão) ou JSON
// (?formato=json, portabilidade). Só a própria pessoa (token da sessão): toda
// consulta é filtrada pelo id de quem pediu, nunca por um id vindo da URL.
// Sem hash de senha, tokens, chaves, ids internos ou dados de cartão.
const LIMIT = 5000;

type Row = Record<string, unknown>;

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const admin = getSupabaseAdmin();
  const { data: allowed } = await admin.rpc('rate_limit_hit', { p_bucket: 'exportar-dados', p_key: user.id, p_limit: 1, p_window_seconds: 600 });
  if (allowed === false) {
    return NextResponse.json({ error: 'Você já baixou seus dados há pouco. Tente de novo em 10 minutos.' }, { status: 429 });
  }
  const format = new URL(request.url).searchParams.get('formato') === 'json' ? 'json' : 'xlsx';

  const rows = async (query: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await query;
    return error ? [] : ((data ?? []) as Row[]);
  };
  const uid = user.id;
  const [profileRows, buyerOrders, favorites, conversations, productReviews, storeReviews] = await Promise.all([
    rows(admin.from('profiles').select('id,account_type,approval_status,full_name,email,document,phone,cep,address,address_number,city,state,store_name,specialty,story,terms_accepted_at,created_at').eq('id', uid).limit(1)),
    rows(admin.from('orders').select('id,order_code,created_at,artisan_id,status,subtotal,shipping_amount,total_amount,checkout_id,shipping_cep,shipping_address,shipping_number,shipping_complement,shipping_city,shipping_state').eq('client_id', uid).order('created_at', { ascending: false }).limit(LIMIT)),
    rows(admin.from('storefront_favorites').select('product_id,created_at').eq('user_id', uid).limit(LIMIT)),
    rows(admin.from('conversations').select('id,order_id,client_id,artisan_id,product_name_snapshot').or(`client_id.eq.${uid},artisan_id.eq.${uid}`).limit(LIMIT)),
    rows(admin.from('product_reviews').select('product_id,rating,comment,status,created_at').eq('client_id', uid).limit(LIMIT)),
    rows(admin.from('store_reviews').select('artisan_id,rating,comment,status,created_at').eq('client_id', uid).limit(LIMIT)),
  ]);
  const profile = profileRows[0] ?? null;
  const isSeller = profile?.account_type === 'artisan';
  const ids = (list: Row[], key: string) => [...new Set(list.map((row) => String(row[key] ?? '')).filter(Boolean))].slice(0, 1000);

  const conversationIds = ids(conversations, 'id');
  const orderIds = ids(buyerOrders, 'id');
  const checkoutIds = ids(buyerOrders, 'checkout_id');
  const productIds = [...new Set([...ids(favorites, 'product_id'), ...ids(productReviews, 'product_id')])];
  const [orderItems, checkouts, products, messages, sellerData] = await Promise.all([
    orderIds.length ? rows(admin.from('order_items').select('order_id,product_name,quantity,unit_price,subtotal,made_to_order,customer_notes').in('order_id', orderIds).limit(LIMIT)) : [],
    checkoutIds.length ? rows(admin.from('checkouts').select('id,payment_method').eq('client_id', uid).in('id', checkoutIds)) : [],
    productIds.length ? rows(admin.from('products').select('id,name,artisan_id').in('id', productIds)) : [],
    conversationIds.length ? rows(admin.from('messages').select('conversation_id,sender_id,body,created_at').in('conversation_id', conversationIds).order('created_at').limit(LIMIT)) : [],
    isSeller ? Promise.all([
      rows(admin.from('artisan_store_settings').select('announcement,production_time_days,vacation_mode').eq('artisan_id', uid).limit(1)),
      rows(admin.from('products').select('name,category_id,price,stock,availability,active,created_at').eq('artisan_id', uid).order('created_at', { ascending: false }).limit(LIMIT)),
      rows(admin.from('orders').select('order_code,created_at,product_name,status,subtotal,shipping_amount,total_amount,platform_fee_amount,artisan_net_amount,nf_status').eq('artisan_id', uid).order('created_at', { ascending: false }).limit(LIMIT)),
      rows(admin.from('payouts').select('created_at,gross_amount,platform_fee,gateway_fee,net_amount,status,release_after,paid_at').eq('artisan_id', uid).order('created_at', { ascending: false }).limit(LIMIT)),
      rows(admin.from('storefront_categories').select('id,name')),
    ]) : null,
  ]);

  // Nomes das lojas citadas (pedidos, favoritos, conversas, avaliações).
  const storeIds = [...new Set([...ids(buyerOrders, 'artisan_id'), ...ids(products, 'artisan_id'), ...ids(conversations, 'artisan_id'), ...ids(storeReviews, 'artisan_id')])];
  const stores = storeIds.length ? await rows(admin.from('profiles').select('id,store_name').in('id', storeIds)) : [];
  const storeNames = Object.fromEntries(stores.map((store) => [String(store.id), String(store.store_name ?? '')]));

  let cookieConsent: ExportInput['cookieConsent'] = null;
  try {
    const raw = request.headers.get('x-cookie-consent');
    if (raw && raw.length < 300) cookieConsent = JSON.parse(raw) as ExportInput['cookieConsent'];
  } catch { /* escolha de cookies é opcional */ }

  const result = buildExport({
    email: user.email ?? '', profile, cookieConsent, buyerOrders, orderItems, checkouts, storeNames, favorites,
    favoriteProducts: products, conversations, messages, productReviews, storeReviews, reviewedProducts: products,
    ...(sellerData ? {
      storeSettings: sellerData[0][0] ?? null, products: sellerData[1], sales: sellerData[2], payouts: sellerData[3],
      categories: Object.fromEntries(sellerData[4].map((category) => [String(category.id), String(category.name)])),
    } : {}),
  });

  await admin.from('access_logs').insert({ user_id: uid, event: 'data_export', ip: auditIp(clientIp(request)) });
  const now = new Date();
  const body = format === 'json'
    ? JSON.stringify(exportToJson(result), null, 2)
    : new Uint8Array(await exportToXlsx(result));
  return new NextResponse(body, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${exportFileName(now, format)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
