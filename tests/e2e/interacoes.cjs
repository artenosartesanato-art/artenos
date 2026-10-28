// Casos de borda: erro de estoque, clique duplo, teclado, movimento reduzido e som.
// Uso: BASE_URL=http://localhost:3002 node tests/e2e/interacoes.cjs  (carrinho do cliente vazio)
const { chromium } = require('playwright');
const base = process.env.BASE_URL || 'http://localhost:3000';
async function login(page) {
  await page.goto(base + '/acesso', { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', 'cliente@sandbox.artenos.test');
  await page.fill('input[name=password]', 'Artenos@2026');
  await page.locator('form:has(input[name=password]) button:not([type=button])').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/acesso'));
}
(async () => {
  const browser = await chromium.launch();
  const log = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await login(page);
  await page.goto(base + '/categorias?busca=vaso%20musgo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  // 1. clique duplo: só uma unidade (estoque 1)
  const add = page.locator('.store-product-add').first();
  await add.dblclick();
  await page.waitForSelector('.cart-drawer');
  await page.waitForTimeout(500);
  log.push('após clique duplo, badge: ' + await page.locator('.store-cart-count').first().textContent());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // 2. erro de estoque: segunda adição deve falhar sem gaveta
  await add.click();
  await page.waitForTimeout(1500);
  log.push('gaveta após erro: ' + await page.locator('.cart-drawer').count());
  log.push('aviso de erro: ' + (await page.locator('[data-sonner-toast][data-type="error"]').allInnerTexts()).join(' | '));
  // 3. movimento reduzido: nenhum elemento escondido por reveal
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  log.push('elementos .an-reveal com movimento reduzido: ' + await page.locator('.an-reveal').count());
  log.push('duração de transição do diálogo: ' + await page.evaluate(() => {
    const el = document.createElement('div'); el.className = 'an-overlay'; document.body.append(el);
    const d = getComputedStyle(el).transitionDuration; el.remove(); return d;
  }));
  // 4. teclado: Tab até o primeiro "Adicionar" e Enter
  await page.goto(base + '/categorias?busca=colar', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.locator('.store-product-add').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.cart-drawer');
  log.push('teclado: foco na gaveta = ' + await page.evaluate(() => document.activeElement.textContent.trim()));
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  log.push('foco continua dentro da gaveta após 4 Tabs: ' + await page.evaluate(() => !!document.activeElement.closest('.cart-drawer')));
  // 5. som: desligado por padrão e persistente
  log.push('som inicial: ' + await page.locator('.cart-drawer [role=switch]').getAttribute('aria-checked'));
  await page.locator('.cart-drawer [role=switch]').click();
  await page.reload({ waitUntil: 'networkidle' });
  log.push('som após recarregar: ' + await page.evaluate(() => localStorage.getItem('artenos:sons-interface')));
  console.log(log.join('\n'));
  await browser.close();
})();
