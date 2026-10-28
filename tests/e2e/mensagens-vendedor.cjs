// Mensagens de quem tem loja: uma só tela (painel) e avisos que chegam mesmo
// sem o tempo real. Uso: BASE_URL=http://localhost:3002 node tests/e2e/mensagens-vendedor.cjs
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const base = process.env.BASE_URL || 'http://localhost:3002';
const DB = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const PASSWORD = 'Artenos@2026';
const CONVERSA = 'cecad601-74d9-4e8c-a926-6779c4dd65ba'; // cliente × Fio de Barro
const ARTESA = '93410f0a-d632-43e8-b704-d60cda4357e8';
const PECA_OUTRA_LOJA = '2c9e29cb-99f1-47a0-bc60-347c84e98461'; // loja "linha"
const sql = (query) => execFileSync('psql', [DB, '-Atc', query], { encoding: 'utf8' }).trim();

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FALHA'}  ${label}`); if (!ok) failures += 1; };
const waitFor = async (fn, timeout) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 500)); }
  return false;
};

async function login(browser, email, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport ?? { width: 1280, height: 860 } });
  if (options.noRealtime) {
    // Simula o Realtime fora do ar: toda conexão WebSocket é recusada.
    await context.routeWebSocket(/realtime/, (ws) => ws.close());
  }
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(email, 'PAGEERROR', e.message));
  await page.goto(base + '/acesso', { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await page.locator('form:has(input[name=password]) button:not([type=button])').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/acesso'), { timeout: 15000 });
  return page;
}

(async () => {
  const browser = await chromium.launch();

  // 1. Artesã: /mensagens leva ao painel, com os mesmos parâmetros.
  const seller = await login(browser, 'barro@sandbox.artenos.test');
  await seller.goto(`${base}/mensagens?conversa=${CONVERSA}`);
  await seller.waitForURL(/\/vendedor\/mensagens/, { timeout: 15000 });
  check(new URL(seller.url()).searchParams.get('conversa') === CONVERSA, '/mensagens?conversa= → /vendedor/mensagens?conversa= (mesma conversa)');
  check(await waitFor(() => seller.locator('.chat-row.is-active').count().then((n) => n === 1), 10000), 'conversa pedida já abre no painel');
  check(await seller.locator('.messages-page').count() === 0, 'a tela de cliente não aparece para a artesã');
  const navHref = await seller.locator('.store-nav-links a', { hasText: 'Mensagens' }).getAttribute('href');
  check(navHref === '/vendedor/mensagens', `link "Mensagens" do cabeçalho vai ao painel (${navHref})`);
  const footHref = await seller.locator('.store-footer a', { hasText: 'Mensagens' }).getAttribute('href');
  check(footHref === '/vendedor/mensagens', `link "Mensagens" do rodapé vai ao painel (${footHref})`);

  // 2. Artesã comprando de outra loja: a conversa abre no próprio painel.
  sql(`delete from conversations where client_id = '${ARTESA}' and product_id = '${PECA_OUTRA_LOJA}'`);
  await seller.goto(`${base}/mensagens?produto=${PECA_OUTRA_LOJA}`);
  await seller.waitForURL(/\/vendedor\/mensagens\?produto=/, { timeout: 15000 });
  check(await waitFor(() => seller.locator('.chat-row.is-active .chat-kind--compra').count().then((n) => n === 1), 15000),
    'pergunta sobre peça de outra loja abre no painel, marcada "Sua compra"');
  check(await seller.locator('.chat-context-link', { hasText: 'Ver loja' }).count() === 1, 'conversa de compra mostra "Ver loja"');

  // 3. Cliente com o Realtime fora do ar: o aviso chega pela consulta de segurança.
  const client = await login(browser, 'cliente@sandbox.artenos.test', { noRealtime: true, viewport: { width: 390, height: 844 } });
  await client.goto(base + '/');
  await client.waitForTimeout(1500);
  sql(`update notifications set read_at = now() where user_id = 'ad2579ba-f220-4d24-bfd9-a60eb2575d44' and read_at is null`);
  await client.goto(base + '/categorias'); // troca de página: lê tudo como lido
  await client.waitForTimeout(1500);
  const before = await client.locator('.store-bell-count').count();
  sql(`insert into messages (conversation_id, sender_id, body) values ('${CONVERSA}', '${ARTESA}', 'Teste sem tempo real ${Date.now()}')`);
  const arrived = await waitFor(() => client.locator('.store-bell-count').count().then((n) => n > before), 40000);
  check(arrived, 'sem Realtime: contador do sininho aparece em até 40 s');
  check(await client.locator('.notif-toast').count() > 0, 'sem Realtime: aviso flutuante aparece');

  // 4. Celular: o sininho usa a cor do texto (não o azul padrão de botão).
  const color = await client.locator('.store-bell').evaluate((el) => getComputedStyle(el).color);
  const text = await client.evaluate(() => getComputedStyle(document.body).color);
  check(color === text, `cor do sininho = cor do texto (${color})`);

  await browser.close();
  console.log(failures ? `${failures} falha(s)` : 'tudo ok');
  process.exit(failures ? 1 : 0);
})();
