// Jornada: login cliente -> home mobile -> menu -> produto -> adicionar -> gaveta -> Escape -> foco
const { chromium } = require('playwright');
const out = (n) => `${process.env.OUT_DIR || '.'}/j_${n}.png`;
(async () => {
  const base = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
  const width = +(process.argv[3] || 390);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width, height: 844 }, hasTouch: width < 800 });
  const p = await ctx.newPage();
  const log = [];
  p.on('pageerror', e => log.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') log.push('console ' + m.text().slice(0, 150)); });
  await p.goto(base + '/acesso', { waitUntil: 'networkidle' });
  await p.fill('input[name=email]', 'cliente@sandbox.artenos.test');
  await p.fill('input[name=password]', 'Artenos@2026');
  await p.locator('form:has(input[name=password]) button:not([type=button])').first().click();
  await p.waitForURL((u) => !u.pathname.startsWith('/acesso'), { timeout: 10000 }).catch(() => log.push('login no redirect'));
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.screenshot({ path: out('1_home') });
  if (width < 800) {
    await p.click('.store-menu-button'); await p.waitForTimeout(450);
    await p.screenshot({ path: out('2_menu') });
    log.push('menu focus: ' + await p.evaluate(() => document.activeElement?.className));
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    log.push('after menu esc focus: ' + await p.evaluate(() => document.activeElement?.className));
  }
  const before = await p.locator('.store-cart-count').first().textContent().catch(() => '0');
  const card = p.locator('#explorar-produtos .store-product').first();
  await card.scrollIntoViewIfNeeded();
  await card.locator('.store-product-title').click(); await p.waitForTimeout(600);
  await p.screenshot({ path: out('3_produto') });
  log.push('dialog role: ' + await p.locator('[role=dialog]').count());
  await p.locator('.an-stepper button[aria-label="Aumentar quantidade"]').click();
  await p.locator('.product-details-add').click();
  await p.waitForSelector('.cart-drawer', { timeout: 8000 }); await p.waitForTimeout(700);
  await p.screenshot({ path: out('4_gaveta') });
  log.push('drawer focus: ' + await p.evaluate(() => document.activeElement?.textContent?.trim()));
  log.push('badge before/after: ' + before + ' -> ' + await p.locator('.store-cart-count').first().textContent());
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  log.push('dialogs after esc: ' + await p.locator('[role=dialog]').count());
  log.push('focus after esc: ' + await p.evaluate(() => (document.activeElement?.className || document.activeElement?.tagName) + ' / ' + document.activeElement?.getAttribute('aria-label')));
  log.push('inert left: ' + await p.evaluate(() => document.querySelectorAll('[inert]').length));
  // card add button direto
  await card.locator('.store-product-add').click();
  await p.waitForSelector('.cart-drawer'); await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Continuar comprando' }).click(); await p.waitForTimeout(400);
  log.push('focus after continuar: ' + await p.evaluate(() => document.activeElement?.getAttribute('aria-label')));
  await p.goto(base + '/carrinho', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  await p.screenshot({ path: out('5_carrinho'), fullPage: true });
  console.log(log.join('\n'));
  await b.close();
})();
