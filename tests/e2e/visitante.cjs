// Visitante sem login: carrinho e favoritos só na memória da aba; recarregar
// apaga; entrar na conta leva tudo para a conta. Sandbox local.
// Uso: BASE_URL=http://localhost:3000 node tests/e2e/visitante.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const base = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
const out = (n) => `${process.env.OUT_DIR || '.'}/v_${n}.png`;
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8')
  .split('\n').filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
const EMAIL = 'cliente@sandbox.artenos.test';
const CART_PRODUCT = 'Vaso de terracota torneado à mão';
const FAVORITE_PRODUCT = 'Vaso musgo';

function check(label, ok, detail = '') {
  console.log((ok ? 'ok   ' : 'FALHA') + ' ' + label + (detail ? ` (${detail})` : ''));
  if (!ok) process.exitCode = 1;
}
const badge = (page) => page.locator('.store-cart-link').getAttribute('aria-label').then((l) => Number((l || '').match(/(\d+)/)?.[1] || 0));

(async () => {
  // Estado limpo da conta de teste.
  const api = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: session } = await api.auth.signInWithPassword({ email: EMAIL, password: 'Artenos@2026' });
  const userId = session.user.id;
  const { data: before } = await api.rpc('list_cart');
  for (const item of before || []) await api.rpc('remove_from_cart', { p_item_id: item.item_id });
  const { data: found } = await api.rpc('browse_storefront_products', {
    p_query: FAVORITE_PRODUCT, p_category_id: null, p_min_price: null, p_max_price: null,
    p_ready_only: false, p_sort: 'newest', p_limit: 5, p_offset: 0,
  });
  const favProduct = (found || []).find((product) => product.name === FAVORITE_PRODUCT);
  if (favProduct) await api.from('storefront_favorites').delete().eq('user_id', userId).eq('product_id', favProduct.id);

  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  async function addAsGuest() {
    await page.goto(base + '/categorias', { waitUntil: 'networkidle' });
    const card = page.locator('.store-product', { hasText: CART_PRODUCT }).first();
    await card.locator('.store-product-add').click();
    await page.locator('.cart-drawer').waitFor({ timeout: 8000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const fav = page.locator('.store-product', { hasText: FAVORITE_PRODUCT }).first().locator('button[aria-pressed]').first();
    await fav.click();
    await page.waitForTimeout(400);
    return fav;
  }

  // 1) Visitante adiciona sem login.
  const fav = await addAsGuest();
  check('visitante adiciona ao carrinho sem login', (await badge(page)) === 1);
  check('aviso de visitante na gaveta', true);
  check('visitante favorita sem login', (await fav.getAttribute('aria-pressed')) === 'true');

  // 2) Páginas de carrinho e favoritos (navegação interna mantém a memória).
  await page.locator('.store-cart-link').click();
  await page.waitForURL('**/carrinho');
  await page.locator('.cart-item', { hasText: CART_PRODUCT }).waitFor({ timeout: 8000 });
  check('carrinho de visitante lista a peça', true);
  await page.getByRole('button', { name: 'Aumentar quantidade' }).first().click();
  check('quantidade ajustável no carrinho de visitante', (await badge(page)) === 2);
  check('aviso "sem login" no carrinho', await page.locator('.cart-guest-alert').isVisible());
  await page.screenshot({ path: out('1_carrinho') });
  await page.locator('.store-nav-links a[href="/favoritos"]').click();
  await page.waitForURL('**/favoritos');
  check('favoritos de visitante listam a peça', await page.locator('.store-product', { hasText: FAVORITE_PRODUCT }).first().isVisible({ timeout: 5000 }).catch(() => false));

  // 3) Recarregar apaga (memória da aba).
  await page.reload({ waitUntil: 'networkidle' });
  check('recarregar esvazia o carrinho do visitante', (await badge(page)) === 0);
  check('recarregar esvazia os favoritos do visitante', await page.locator('.store-product', { hasText: FAVORITE_PRODUCT }).count() === 0);

  // 4) Adiciona de novo e entra: tudo vai para a conta.
  await addAsGuest();
  await page.locator('.store-account').click();
  await page.waitForURL('**/acesso**');
  await page.fill('input[name=email]', EMAIL);
  await page.fill('input[name=password]', 'Artenos@2026');
  await page.locator('form:has(input[name=password]) button:not([type=button])').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/acesso'), { timeout: 15000 });
  const carried = await page.locator('[data-sonner-toast]', { hasText: 'Levamos para sua conta' }).first()
    .waitFor({ timeout: 10000 }).then(() => true, () => false);
  check('aviso "levamos para sua conta" ao entrar', carried);
  await page.waitForTimeout(800);
  const { data: cart } = await api.from('cart_items').select('quantity, product_id').eq('client_id', userId);
  const { data: favs } = await api.from('storefront_favorites').select('product_id').eq('user_id', userId).eq('product_id', favProduct.id);
  check('carrinho do visitante foi para a conta', (cart || []).reduce((t, i) => t + i.quantity, 0) === 1, JSON.stringify(cart));
  check('favorito do visitante foi para a conta', (favs || []).length === 1);
  check('contador do cabeçalho vem da conta', (await badge(page)) === 1);
  await page.goto(base + '/carrinho', { waitUntil: 'networkidle' });
  check('carrinho da conta mostra a peça', await page.locator('.cart-item', { hasText: CART_PRODUCT }).first().isVisible({ timeout: 8000 }).catch(() => false));
  await page.screenshot({ path: out('2_conta') });

  await b.close();
})().catch((error) => { console.error(error); process.exit(1); });
