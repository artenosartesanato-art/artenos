// Mensagens por produto, ponta a ponta no sandbox: o cliente abre a conversa
// pelo ícone do card, envia; a artesã recebe em tempo real e responde; o
// cliente recebe a resposta sem recarregar. Uso: BASE_URL=... node mensagens.cjs
const { chromium } = require('playwright');
const base = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
const out = (n) => `${process.env.OUT_DIR || '.'}/m_${n}.png`;
const PRODUCT = process.env.PRODUCT_NAME || 'Vaso de terracota torneado à mão';

async function login(browser, email, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(email, 'PAGEERROR', e.message));
  await page.goto(base + '/acesso', { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'Artenos@2026');
  await page.locator('form:has(input[name=password]) button:not([type=button])').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/acesso'), { timeout: 15000 });
  return page;
}

function check(label, ok) {
  console.log((ok ? 'ok   ' : 'FALHA') + ' ' + label);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch();
  const stamp = new Date().toISOString().slice(11, 19);
  const question = `Teste ${stamp}: esta peça vai bem ao forno?`;
  const answer = `Resposta ${stamp}: não, apenas decorativa.`;

  // Visitante: o ícone leva ao login com retorno para a conversa.
  const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await guest.goto(base + '/categorias?q=' + encodeURIComponent(PRODUCT), { waitUntil: 'networkidle' });
  const guestLink = guest.locator('.store-product-message').first();
  await guestLink.waitFor({ timeout: 15000 });
  check('visitante: ícone leva ao acesso com retorno', /\/acesso\?voltar=%2Fmensagens%3Fproduto%3D/.test(await guestLink.getAttribute('href')));

  const client = await login(browser, 'cliente@sandbox.artenos.test', 1280);
  await client.goto(base + '/categorias?q=' + encodeURIComponent(PRODUCT), { waitUntil: 'networkidle' });
  const card = client.locator('.store-product', { hasText: PRODUCT }).first();
  await card.locator('.store-product-message').waitFor({ timeout: 15000 });
  check('card mostra o ícone de mensagem', await card.locator('.store-product-message').isVisible());

  // O detalhe ampliado também tem o atalho.
  await card.locator('.store-product-title').click();
  const detailsLink = client.locator('[role=dialog] .product-details-message');
  await detailsLink.waitFor({ timeout: 8000 });
  check('detalhe ampliado mostra o atalho', await detailsLink.isVisible());
  await detailsLink.click();
  await client.waitForURL(/\/mensagens\?produto=/, { timeout: 15000 });

  const compose = client.locator('#messages-text');
  await compose.waitFor({ timeout: 15000 });
  const header = await client.locator('.chat-pane').innerText();
  check('conversa indica o produto', header.includes(PRODUCT));
  // A sugestão só é preenchida em conversa nova (sem mensagens), depois que o histórico carrega.
  const prefilled = await client.waitForFunction(
    (name) => document.querySelector('#messages-text')?.value.includes(name), PRODUCT, { timeout: 6000 },
  ).then(() => true, () => false);
  if (await client.locator('.chat-msg').count()) console.log('n/a   texto inicial (conversa já tinha mensagens)');
  else check('texto inicial sugerido com o nome do produto', prefilled);
  await client.screenshot({ path: out('1_cliente_conversa') });

  const seller = await login(browser, 'barro@sandbox.artenos.test', 1280);
  await seller.goto(base + '/vendedor/mensagens', { waitUntil: 'networkidle' });
  const sellerItem = seller.locator('.chat-list .chat-row', { hasText: PRODUCT }).first();
  await sellerItem.waitFor({ timeout: 15000 });
  await sellerItem.click();
  await seller.locator('#messages-text').waitFor({ timeout: 15000 });

  await compose.fill(question);
  await client.locator('form:has(#messages-text) button[type=submit]').click();
  await client.locator('.chat-msg', { hasText: question }).waitFor({ timeout: 10000 });
  check('cliente: mensagem enviada aparece', true);
  check('cliente: campo limpo após envio', (await compose.inputValue()) === '');

  const received = await seller.locator('.chat-msg', { hasText: question })
    .waitFor({ timeout: 15000 }).then(() => true, () => false);
  check('artesã recebe em tempo real (sem recarregar)', received);
  check('artesã vê o produto na conversa', (await seller.locator('.chat-pane').innerText()).includes(PRODUCT));

  // Shift+Enter quebra a linha; Enter envia.
  await seller.fill('#messages-text', 'linha 1');
  await seller.press('#messages-text', 'Shift+Enter');
  check('Shift+Enter quebra a linha sem enviar', (await seller.inputValue('#messages-text')).includes('\n'));
  await seller.fill('#messages-text', answer);
  await seller.press('#messages-text', 'Enter');
  const replied = await client.locator('.chat-msg', { hasText: answer })
    .waitFor({ timeout: 15000 }).then(() => true, () => false);
  check('cliente recebe a resposta em tempo real', replied);
  await client.screenshot({ path: out('2_cliente_resposta') });
  await seller.screenshot({ path: out('3_artesa') });

  // Reabrir pelo mesmo produto reaproveita a conversa (não duplica).
  await client.goto(base + '/mensagens?produto=' + new URL(client.url()).searchParams.get('produto'), { waitUntil: 'networkidle' });
  await client.locator('.chat-msg', { hasText: question }).waitFor({ timeout: 15000 });
  check('reabrir pelo produto reaproveita a conversa', true);

  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
