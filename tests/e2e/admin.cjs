// Painel administrativo: acesso, números reais e ações.
// Uso: BASE_URL=http://localhost:3002 node tests/e2e/admin.cjs
// Precisa de supabase/painel_admin_completo.sql no banco local (conta admin de teste do sandbox).
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const base = process.env.BASE_URL || 'http://localhost:3002';
const DB = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@sandbox.artenos.test', password: process.env.ADMIN_PASSWORD || 'Artenos@2026' };
const sql = (query) => execFileSync('psql', [DB, '-Atc', query], { encoding: 'utf8' }).trim();

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FALHA'}  ${label}`); if (!ok) failures += 1; };

async function login(browser, email, password) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); failures += 1; });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(base + '/acesso', { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.locator('form:has(input[name=password]) button:not([type=button])').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/acesso'), { timeout: 15000 });
  return page;
}

(async () => {
  const browser = await chromium.launch();

  // 1. Cliente não entra.
  const client = await login(browser, 'cliente@sandbox.artenos.test', 'Artenos@2026');
  await client.goto(base + '/administracao/vendedores', { waitUntil: 'networkidle' });
  check(await client.getByRole('heading', { name: 'Acesso não autorizado' }).count() === 1, 'cliente vê "Acesso não autorizado"');
  check(await client.locator('.adm-table').count() === 0, 'cliente não vê dados de vendedores');
  await client.context().close();

  const admin = await login(browser, ADMIN.email, ADMIN.password);

  // 2. Visão geral: números iguais aos do banco.
  await admin.goto(base + '/administracao', { waitUntil: 'networkidle' });
  await admin.waitForSelector('.adm-stat');
  const orders30 = sql(`select count(*) from orders where created_at >= date_trunc('day', now()) - interval '29 days' and status not in ('cancelled','refunded')`);
  const shown = await admin.locator('.adm-stat', { hasText: 'Pedidos' }).first().locator('.adm-stat-value').textContent();
  check(shown.trim() === orders30, `pedidos dos 30 dias = banco (${shown.trim()} × ${orders30})`);
  const activeShops = sql(`select count(*) from profiles where account_type = 'artisan' and approval_status = 'active'`);
  const shownShops = await admin.locator('.adm-stat', { hasText: 'Lojas ativas' }).locator('.adm-stat-value').textContent();
  check(shownShops.trim() === activeShops, `lojas ativas = banco (${shownShops.trim()} × ${activeShops})`);
  check(await admin.locator('.adm-chart-col').count() === 30, 'gráfico com 30 dias');
  await admin.locator('.adm-chips button', { hasText: '7 dias' }).click();
  await admin.waitForFunction(() => document.querySelectorAll('.adm-chart-col').length === 7);
  check(true, 'trocar o período recalcula (7 colunas)');

  // 3. Menu lateral leva a todas as telas.
  for (const [label, heading] of [['Aprovações', 'Aprovação de lojas'], ['Vendedores', 'Vendedores'], ['Pedidos', 'Pedidos'],
    ['Clientes', 'Clientes'], ['Categorias', 'Categorias'], ['Tarifa', 'Tarifa da plataforma'], ['Equipe', 'Equipe administrativa'],
    ['Atividade', 'Atividade'], ['Meu perfil', 'Meu perfil']]) {
    await admin.locator('.seller-sidebar:not(.is-drawer) .seller-nav-link', { hasText: label }).first().click();
    await admin.waitForSelector(`main h1:text-is("${heading}")`, { timeout: 10000 }).catch(() => null);
    check(await admin.locator(`main h1:text-is("${heading}")`).count() === 1, `menu → ${label}`);
  }

  // 4. Vendedores: suspender e reativar (fica no histórico).
  const shop = sql(`select id from profiles where account_type='artisan' and approval_status='active' and store_name = 'Sementes do Norte'`);
  await admin.goto(`${base}/administracao/vendedores?loja=${shop}`, { waitUntil: 'networkidle' });
  await admin.waitForSelector('.adm-drawer-head');
  await admin.locator('.adm-decision textarea').first().fill('Teste automático de suspensão.');
  await admin.locator('.adm-decision button', { hasText: 'Suspender loja' }).click();
  await admin.waitForSelector('.adm-decision button:has-text("Reativar loja")', { timeout: 10000 });
  check(sql(`select approval_status from profiles where id='${shop}'`) !== 'active', 'suspensão tira a loja do ar (perfil não ativo)');
  await admin.locator('.adm-decision button', { hasText: 'Reativar loja' }).click();
  await admin.waitForSelector('.adm-decision button:has-text("Suspender loja")', { timeout: 10000 });
  check(sql(`select approval_status from profiles where id='${shop}'`) === 'active', 'reativação devolve a loja');
  await admin.goto(base + '/administracao/atividade', { waitUntil: 'networkidle' });
  check(await admin.locator('.adm-timeline li', { hasText: 'Loja suspensa · Sementes do Norte' }).count() >= 1, 'atividade registra a suspensão');

  // 5. Pedidos: filtro por situação vem do banco.
  await admin.goto(base + '/administracao/pedidos?status=delivered', { waitUntil: 'networkidle' });
  await admin.waitForSelector('.adm-table, .adm-state');
  const delivered = sql(`select count(*) from orders where status='delivered'`);
  check(String(await admin.locator('.adm-table tbody tr').count()) === delivered, `filtro "Entregues" = banco (${delivered})`);

  // 6. Categorias: foto enviada e salva.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-'));
  const png = path.join(tmp, 'foto.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const category = sql(`select id, image_url from storefront_categories where slug = 'macrame'`).split('|');
  await admin.goto(base + '/administracao/categorias', { waitUntil: 'networkidle' });
  await admin.locator('button[aria-label="Editar Macramê"]').click();
  await admin.setInputFiles('.adm-photo input[type=file]', png);
  await admin.locator('.adm-form button[type=submit]').click();
  await admin.waitForSelector('.adm-dialog', { state: 'detached', timeout: 15000 });
  const saved = sql(`select image_url from storefront_categories where slug = 'macrame'`);
  check(/artenos-store-assets\/.+\/categorias\//.test(saved), 'foto da categoria enviada ao Storage e salva');
  sql(`update storefront_categories set image_url = ${category[1] ? `'${category[1]}'` : 'null'} where id = '${category[0]}'`);

  // 7. Equipe: dar e retirar acesso.
  await admin.goto(base + '/administracao/equipe', { waitUntil: 'networkidle' });
  await admin.fill('input[type=email]', 'linha@sandbox.artenos.test');
  await admin.locator('form button[type=submit]', { hasText: 'Dar acesso' }).click();
  await admin.waitForSelector('tr:has-text("linha@sandbox.artenos.test")', { timeout: 10000 });
  check(sql(`select active from admin_users a join auth.users u on u.id=a.user_id where u.email='linha@sandbox.artenos.test'`) === 't', 'acesso de revisora concedido');
  await admin.locator('tr:has-text("linha@sandbox.artenos.test") button', { hasText: 'Retirar acesso' }).click();
  await admin.waitForSelector('tr:has-text("linha@sandbox.artenos.test") button:has-text("Devolver acesso")', { timeout: 10000 });
  check(sql(`select active from admin_users a join auth.users u on u.id=a.user_id where u.email='linha@sandbox.artenos.test'`) === 'f', 'acesso retirado');
  sql(`delete from admin_users where user_id = (select id from auth.users where email='linha@sandbox.artenos.test')`);

  // 8. Celular: menu em gaveta, sem rolagem lateral.
  await admin.setViewportSize({ width: 390, height: 844 });
  for (const route of ['', '/vendedores', '/pedidos', '/equipe', '/categorias']) {
    await admin.goto(base + '/administracao' + route);
    await admin.waitForSelector('main h1');
    await admin.waitForSelector('.adm-state[role=status]', { state: 'detached' }).catch(() => null);
    await admin.waitForTimeout(600);
    check(!(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `390 px sem rolagem lateral: /administracao${route}`);
  }
  await admin.locator('.seller-menu-button').click();
  const drawerLink = admin.locator('.seller-menu-drawer .seller-nav-link', { hasText: 'Vendedores' });
  check(await drawerLink.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false), 'menu do celular abre com as telas');

  await browser.close();
  console.log(failures ? `${failures} falha(s)` : 'tudo ok');
  process.exit(failures ? 1 : 0);
})();
