// Controle de sessão ponta a ponta (sandbox local).
// Uso: BASE_URL=http://localhost:3000 node tests/e2e/sessao.cjs
const { chromium } = require('playwright');

const base = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = 'cliente@sandbox.artenos.test';
const PASSWORD = 'Artenos@2026';

function check(label, ok, detail = '') {
  console.log((ok ? 'ok   ' : 'FALHA') + ' ' + label + (detail ? ` (${detail})` : ''));
  if (!ok) process.exitCode = 1;
}

async function login(page, { remember, password = PASSWORD, expectSuccess = true } = {}) {
  await page.goto(base + '/acesso', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name=remember]').waitFor({ timeout: 15000 });
  await page.fill('input[name=email]', EMAIL);
  await page.fill('input[name=password]', password);
  const box = page.locator('input[name=remember]');
  if ((await box.isChecked()) !== Boolean(remember)) await box.click();
  await page.locator('form:has(input[name=password]) button:not([type=button])').first().click();
  if (expectSuccess) await page.waitForURL((u) => !u.pathname.startsWith('/acesso'), { timeout: 15000 });
}

const signedIn = (page) => page.locator('.store-account').getAttribute('aria-label').then((l) => /Minha conta/.test(l || ''));
const tokenPlaces = (page) => page.evaluate(() => ({
  local: Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)),
  cookie: document.cookie.split('; ').some((c) => /^sb-.*-auth-token\.0=/.test(c)),
}));

(async () => {
  const b = await chromium.launch();

  // 1) Sem "manter conectado": sessão em cookies de sessão (somem ao fechar o navegador).
  let ctx = await b.newContext();
  let page = await ctx.newPage();
  await login(page, { remember: false });
  let places = await tokenPlaces(page);
  check('sem "manter conectado": sessão em cookie, não no localStorage', places.cookie && !places.local, JSON.stringify(places));
  const tab2 = await ctx.newPage();
  await tab2.goto(base + '/perfil', { waitUntil: 'networkidle' });
  check('outra aba do mesmo navegador continua conectada', await signedIn(tab2));
  // "Fechar o navegador": nova janela só com os cookies persistentes (sem os de sessão).
  const state = await ctx.storageState();
  const reopened = await b.newContext({ storageState: { ...state, cookies: state.cookies.filter((c) => c.expires !== -1) } });
  const rp = await reopened.newPage();
  await rp.goto(base + '/perfil', { waitUntil: 'networkidle' });
  await rp.waitForTimeout(1200);
  check('fechar o navegador encerra a sessão', /\/acesso/.test(rp.url()) || !(await signedIn(rp)), rp.url());
  await reopened.close();

  // 2) Inatividade (30 min sem "manter conectado"): aviso 1 min antes e saída.
  await page.goto(base + '/perfil', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('artenos:ultima-atividade', String(Date.now() - 29.5 * 60_000)));
  const warned = await page.getByRole('dialog', { name: 'Você ainda está aí?' }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  check('aviso de inatividade 1 min antes', warned);
  await page.getByRole('button', { name: 'Continuar conectado' }).click();
  await page.waitForTimeout(1500);
  check('"Continuar conectado" mantém a sessão', await page.getByRole('dialog', { name: 'Você ainda está aí?' }).count() === 0 && /\/perfil/.test(page.url()));
  await page.evaluate(() => localStorage.setItem('artenos:ultima-atividade', String(Date.now() - 31 * 60_000)));
  await page.waitForURL(/\/acesso\?motivo=inatividade/, { timeout: 8000 }).catch(() => undefined);
  check('30 min sem uso: sai e explica no login', /motivo=inatividade/.test(page.url()), page.url());
  check('mensagem do motivo no login', await page.locator('.session-reason').isVisible().catch(() => false));
  places = await tokenPlaces(page);
  check('sessão apagada do navegador', !places.cookie && !places.local, JSON.stringify(places));
  await ctx.close();

  // 3) Com "manter conectado": localStorage, sem limite de inatividade da conta comum.
  ctx = await b.newContext();
  page = await ctx.newPage();
  await login(page, { remember: true });
  places = await tokenPlaces(page);
  check('com "manter conectado": sessão no localStorage', places.local && !places.cookie, JSON.stringify(places));
  await page.goto(base + '/perfil', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('artenos:ultima-atividade', String(Date.now() - 2 * 3600_000)));
  await page.waitForTimeout(2500);
  check('aparelho lembrado: sem saída por inatividade', /\/perfil/.test(page.url()) && await signedIn(page));
  check('perfil mostra a seção de segurança', await page.locator('.profile-security').isVisible());

  // 4) Saída em uma aba encerra a outra (rota protegida → login com motivo).
  const other = await ctx.newPage();
  await other.goto(base + '/pedidos', { waitUntil: 'networkidle' });
  await page.locator('.profile-signout').click();
  await other.waitForURL(/\/acesso\?motivo=expirada/, { timeout: 10000 }).catch(() => undefined);
  check('sair em uma aba leva a outra ao login', /motivo=expirada/.test(other.url()), other.url());
  await ctx.close();

  // 5) "Sair de todos os aparelhos": o outro aparelho perde o acesso ao voltar.
  const deviceA = await b.newContext(); const a = await deviceA.newPage();
  const deviceB = await b.newContext(); const bp = await deviceB.newPage();
  await login(a, { remember: true });
  await login(bp, { remember: true });
  await bp.goto(base + '/pedidos', { waitUntil: 'networkidle' });
  await a.goto(base + '/perfil', { waitUntil: 'networkidle' });
  await a.getByRole('button', { name: 'Sair de todos os aparelhos' }).click();
  await a.getByRole('button', { name: 'Sair de todos', exact: true }).click();
  await a.waitForURL(/motivo=todos/, { timeout: 10000 }).catch(() => undefined);
  check('este aparelho sai com o aviso "todos"', /motivo=todos/.test(a.url()), a.url());
  await bp.evaluate(() => window.dispatchEvent(new Event('focus')));
  await bp.waitForURL(/\/acesso\?motivo=expirada/, { timeout: 10000 }).catch(() => undefined);
  check('outro aparelho perde o acesso ao voltar para a aba', /motivo=expirada/.test(bp.url()), bp.url());
  await deviceA.close(); await deviceB.close();

  // 6) Limite de tentativas: 5 senhas erradas bloqueiam por 1 min (sem chamar o servidor).
  ctx = await b.newContext();
  page = await ctx.newPage();
  for (let i = 0; i < 5; i += 1) {
    await login(page, { password: 'errada-' + i, expectSuccess: false });
    await page.getByText('E-mail ou senha incorretos.').first().waitFor({ timeout: 10000 });
  }
  let calls = 0;
  page.on('request', (r) => { if (/auth\/v1\/token/.test(r.url())) calls += 1; });
  await login(page, { expectSuccess: false });
  await page.waitForTimeout(800);
  const text = await page.locator('.login-form').innerText();
  check('6ª tentativa bloqueada com espera', /aguarde/i.test(text) && calls === 0, `chamadas=${calls}`);
  await ctx.close();

  // 7) Cabeçalhos de segurança.
  const res = await fetch(base + '/');
  check('cabeçalhos de segurança', res.headers.get('x-frame-options') === 'DENY'
    && /frame-ancestors 'none'/.test(res.headers.get('content-security-policy') || '')
    && res.headers.get('x-content-type-options') === 'nosniff', [...res.headers.keys()].filter((k) => /frame|content-security|nosniff|referrer|permissions|strict/.test(k)).join(','));

  await b.close();
})().catch((error) => { console.error(error); process.exit(1); });
