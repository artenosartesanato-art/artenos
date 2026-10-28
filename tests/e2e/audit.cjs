// Auditoria de navegador: node audit.js <baseUrl> <outDir> [routesFilter]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const [,, base, out, filter] = process.argv;
fs.mkdirSync(out, { recursive: true });
const PASSWORD = 'Artenos@2026';
const ROLES = {
  anon: null,
  cliente: 'cliente@sandbox.artenos.test',
  artesa: 'barro@sandbox.artenos.test',
  pendente: 'pendente@sandbox.artenos.test',
  admin: 'admin@sandbox.artenos.test',
};
const ROUTES = [
  ['anon', '/'], ['anon', '/categorias'], ['anon', '/categorias?busca=vaso'], ['anon', '/categorias?busca=xyzqwe'],
  ['anon', '/lojas'], ['anon', '/loja?id=93410f0a-d632-43e8-b704-d60cda4357e8'], ['anon', '/loja?id=00000000-0000-0000-0000-000000000000'],
  ['anon', '/sob-encomenda'], ['anon', '/acesso'], ['anon', '/termos'], ['anon', '/privacidade'], ['anon', '/rota-inexistente'],
  ['anon', '/carrinho'], ['anon', '/favoritos'], ['anon', '/pedidos'], ['anon', '/mensagens'], ['anon', '/perfil'],
  ['cliente', '/'], ['cliente', '/carrinho'], ['cliente', '/favoritos'], ['cliente', '/pedidos'], ['cliente', '/mensagens'],
  ['cliente', '/perfil'], ['cliente', '/sob-encomenda'], ['cliente', '/repasses'],
  ['artesa', '/vendedor'], ['artesa', '/vendedor/minha-loja'], ['artesa', '/vendedor/catalogo'], ['artesa', '/vendedor/encomendas'],
  ['artesa', '/vendedor/vendas'], ['artesa', '/vendedor/repasses'], ['artesa', '/vendedor/precificacao'], ['artesa', '/vendedor/mensagens'],
  ['artesa', '/vendedor/perfil'],
  ['pendente', '/cadastro-em-analise'], ['admin', '/administracao'], ['anon', '/redefinir-senha'],
];
const VIEWPORTS = (process.env.VIEWPORTS || '390,1440').split(',').map(Number);
const slug = (r) => r.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';
(async () => {
  const browser = await chromium.launch();
  const report = [];
  const storage = {};
  for (const [role, email] of Object.entries(ROLES)) {
    if (!email) continue;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(base + '/acesso', { waitUntil: 'networkidle' });
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', PASSWORD);
    await page.locator('form:has(input[name=password]) button:not([type=button])').first().click();
    await page.waitForTimeout(3500);
    storage[role] = await ctx.storageState();
    await ctx.close();
  }
  for (const [role, route] of ROUTES) {
    if (filter && !route.includes(filter) && role !== filter) continue;
    for (const width of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 },
        storageState: storage[role], deviceScaleFactor: 1, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
      const page = await ctx.newPage();
      const consoleErrors = [], failed = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
      page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message.slice(0, 200)));
      page.on('requestfailed', (r) => { if (!/_rsc|favicon/.test(r.url())) failed.push(r.url().slice(0, 120) + ' ' + (r.failure()?.errorText || '')); });
      page.on('response', (r) => { if (r.status() >= 400 && !/_rsc/.test(r.url())) failed.push(r.status() + ' ' + r.url().slice(0, 140)); });
      let finalUrl = '';
      try {
        await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1500);
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
        await page.waitForTimeout(700);
        finalUrl = page.url().replace(base, '');
      } catch (e) { consoleErrors.push('nav: ' + e.message.slice(0, 120)); }
      const overflow = await page.evaluate(() => {
        const w = document.documentElement.clientWidth; const offenders = [];
        document.querySelectorAll('body *').forEach((el) => { const r = el.getBoundingClientRect();
          if (r.width && r.right > w + 1 && getComputedStyle(el).position !== 'fixed') offenders.push((el.className && String(el.className).slice(0, 40)) || el.tagName); });
        return { scroll: document.documentElement.scrollWidth > w + 1, offenders: [...new Set(offenders)].slice(0, 6) };
      });
      await page.addScriptTag({ content: axeSource });
      const axe = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message || '').slice(0, 90)) }));
      });
      const smallTargets = await page.evaluate(() => [...document.querySelectorAll('a, button, input, select, [role=button]')].filter((el) => {
        const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && (r.width < 24 || r.height < 24);
      }).length);
      const file = `${role}-${slug(route)}-${width}.png`;
      await page.screenshot({ path: path.join(out, file), fullPage: true });
      report.push({ role, route, width, finalUrl, consoleErrors: [...new Set(consoleErrors)].slice(0, 5), failed: [...new Set(failed)].slice(0, 5), overflow, axe, smallTargets, file });
      await ctx.close();
      process.stdout.write('.');
    }
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  await browser.close();
  console.log('\nok', report.length);
})();
