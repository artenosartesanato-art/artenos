// Notificações ponta a ponta no sandbox (precisa de supabase/notificacoes.sql).
// Cliente e artesã em navegadores separados; as ações "do outro lado" usam as
// mesmas funções do app via supabase-js com as contas de teste.
// Uso: BASE_URL=http://localhost:3000 node tests/e2e/notificacoes.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const base = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
const out = (n) => `${process.env.OUT_DIR || '.'}/n_${n}.png`;
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8')
  .split('\n').filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
const PRODUCT_ID = 'ae9d9c49-65e4-4da0-bf74-9341a39c1077';
const PASSWORD = 'Artenos@2026';

function check(label, ok, detail = '') {
  console.log((ok ? 'ok   ' : 'FALHA') + ' ' + label + (detail ? ` (${detail})` : ''));
  if (!ok) process.exitCode = 1;
}

async function api(email) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { client, id: data.user.id };
}

async function browser(b, email) {
  const page = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  // Conta os tons tocados (cada nota = um oscilador iniciado).
  await page.addInitScript(() => {
    window.__tones = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) { window.__tones += 1; return start.apply(this, args); };
  });
  page.on('pageerror', (e) => console.log(email, 'PAGEERROR', e.message));
  await page.goto(base + '/acesso', { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await page.locator('form:has(input[name=password]) button:not([type=button])').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/acesso'), { timeout: 15000 });
  return page;
}

const bellCount = (page) => page.locator('.store-bell').getAttribute('aria-label')
  .then((label) => Number((label || '').match(/(\d+) não/)?.[1] || 0));
const tones = (page) => page.evaluate(() => window.__tones);
const waitFor = async (fn, timeout = 12000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)); }
  return false;
};

(async () => {
  const b = await chromium.launch();
  const stamp = new Date().toISOString().slice(11, 19);
  const buyer = await api('cliente@sandbox.artenos.test');
  const seller = await api('barro@sandbox.artenos.test');
  const { data: conversationId, error: convError } = await buyer.client.rpc('start_product_conversation', { p_product_id: PRODUCT_ID });
  if (convError) throw convError;
  await buyer.client.rpc('mark_notifications_read', { p_ids: null });
  await seller.client.rpc('mark_notifications_read', { p_ids: null });

  const sellerPage = await browser(b, 'barro@sandbox.artenos.test');
  const clientPage = await browser(b, 'cliente@sandbox.artenos.test');
  await sellerPage.goto(base + '/vendedor', { waitUntil: 'networkidle' });
  await clientPage.goto(base + '/', { waitUntil: 'networkidle' });
  await sellerPage.locator('.store-bell').waitFor({ timeout: 15000 });
  await clientPage.locator('.store-bell').waitFor({ timeout: 15000 });
  // Navegadores só liberam som depois de uma interação.
  await sellerPage.mouse.click(5, 300); await clientPage.mouse.click(5, 300);

  // 1) Nova mensagem: sininho, som e aviso na tela, sem recarregar.
  const sellerTonesBefore = await tones(sellerPage);
  await buyer.client.from('messages').insert({ conversation_id: conversationId, sender_id: buyer.id, body: `Oi! A peça vai embalada? (${stamp})` });
  check('artesã: sininho conta a mensagem nova', await waitFor(async () => (await bellCount(sellerPage)) >= 1));
  check('artesã: som de mensagem (2 notas)', (await tones(sellerPage)) - sellerTonesBefore === 2, `${(await tones(sellerPage)) - sellerTonesBefore} notas`);
  check('artesã: aviso na tela', await sellerPage.locator('[data-sonner-toast]', { hasText: 'Nova mensagem' }).first().isVisible().catch(() => false));
  check('artesã: título da aba com contador', /^\(\d+\) /.test(await sellerPage.title()), await sellerPage.title());
  await sellerPage.screenshot({ path: out('1_aviso') });

  // 2) Painel: abre, mostra a mensagem e leva à conversa.
  await sellerPage.locator('.store-bell').click();
  const item = sellerPage.locator('.notif-item', { hasText: 'Nova mensagem' }).first();
  await item.waitFor({ timeout: 5000 });
  await sellerPage.waitForTimeout(500);
  await sellerPage.screenshot({ path: out('2_painel') });
  await item.click();
  await sellerPage.waitForURL(/\/vendedor\/mensagens\?conversa=/, { timeout: 10000 });
  await sellerPage.locator('#messages-text').waitFor({ timeout: 15000 });
  check('clicar no aviso abre a conversa certa', (await sellerPage.locator('.chat-context').innerText()).includes('Vaso de terracota'));
  check('aviso lido ao abrir', await waitFor(async () => (await bellCount(sellerPage)) === 0));

  // 3) Conversa aberta: chega mensagem → toque discreto (1 nota), sem acumular.
  const softBefore = await tones(sellerPage);
  await buyer.client.from('messages').insert({ conversation_id: conversationId, sender_id: buyer.id, body: `Obrigada! (${stamp})` });
  await sellerPage.locator('.chat-msg', { hasText: `Obrigada! (${stamp})` }).waitFor({ timeout: 10000 });
  await sellerPage.waitForTimeout(800);
  check('conversa aberta: toque discreto (1 nota)', (await tones(sellerPage)) - softBefore === 1, `${(await tones(sellerPage)) - softBefore} notas`);
  check('conversa aberta: não acumula no sininho', (await bellCount(sellerPage)) === 0);

  // 4) Loja só edita a peça: cliente não recebe nada.
  const clientTonesBefore = await tones(clientPage);
  const clientCountBefore = await bellCount(clientPage);
  await seller.client.rpc('set_my_product_active', { p_product_id: PRODUCT_ID, p_active: false });
  await seller.client.rpc('set_my_product_active', { p_product_id: PRODUCT_ID, p_active: true });
  await clientPage.waitForTimeout(3000);
  check('editar a peça não notifica o cliente', (await bellCount(clientPage)) === clientCountBefore && (await tones(clientPage)) === clientTonesBefore);

  // 5) Loja atualiza o pedido do cliente: som de atualização e aviso.
  const { data: orders } = await seller.client.from('orders').select('id, status').eq('client_id', buyer.id).eq('artisan_id', seller.id).limit(1);
  const order = orders[0];
  const nextStatus = order.status === 'preparing' ? 'shipped' : 'preparing';
  await seller.client.rpc('update_order_fulfillment', { p_order_id: order.id, p_status: nextStatus, p_tracking_code: 'BR' + Date.now() });
  check('cliente: sininho conta a atualização do pedido', await waitFor(async () => (await bellCount(clientPage)) > clientCountBefore));
  check('cliente: som de atualização (3 notas)', (await tones(clientPage)) - clientTonesBefore === 3, `${(await tones(clientPage)) - clientTonesBefore} notas`);
  check('cliente: aviso com o novo status', await clientPage.locator('[data-sonner-toast]', { hasText: 'Pedido:' }).first().isVisible().catch(() => false));
  await clientPage.screenshot({ path: out('3_cliente_pedido') });
  await clientPage.goto(base + '/pedidos', { waitUntil: 'networkidle' });
  check('abrir Pedidos marca o aviso como lido', await waitFor(async () => (await bellCount(clientPage)) === clientCountBefore));

  // 6) Som desligado: chega aviso sem tocar.
  await clientPage.locator('.store-bell').click();
  await clientPage.locator('.notif-sound').click();
  await clientPage.keyboard.press('Escape');
  const mutedBefore = await tones(clientPage);
  await seller.client.from('messages').insert({ conversation_id: conversationId, sender_id: seller.id, body: `Vai sim, com papel de seda. (${stamp})` });
  await waitFor(async () => (await bellCount(clientPage)) > clientCountBefore);
  check('som desligado: aviso chega sem tocar', (await tones(clientPage)) === mutedBefore);
  await clientPage.locator('.store-bell').click();
  await clientPage.locator('.notif-sound').click(); // religa para os próximos testes
  await clientPage.keyboard.press('Escape');

  await b.close();
})().catch((error) => { console.error(error); process.exit(1); });
