const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  const b = await chromium.launch(); const log = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  // ViaCEP é externo e pode estar bloqueado no ambiente de teste: respondemos só a consulta de CEP.
  // O cadastro em si vai para o Supabase local de verdade.
  if (process.env.MOCK_VIACEP !== '0') await ctx.route('https://viacep.com.br/**', (route) =>
    route.fulfill({ json: { logradouro: 'Avenida Paulista', localidade: 'São Paulo', uf: 'SP' } }));
  p.on('pageerror', e => log.push('PAGEERROR ' + e.message));
  // 1. layout mobile do login
  await p.goto(base + '/acesso?voltar=/favoritos', { waitUntil: 'networkidle' });
  await p.screenshot({ path: (process.env.OUT_DIR || '.') + '/a_1_login_mobile.png' });
  log.push('login button y: ' + JSON.stringify(await p.locator('.login-form .primary-button').boundingBox()));
  // 2. envio vazio
  await p.locator('.login-form .primary-button').click(); await p.waitForTimeout(300);
  log.push('empty errors: ' + await p.locator('.field-error').allInnerTexts());
  log.push('focus: ' + await p.evaluate(() => document.activeElement.className));
  // 3. senha errada
  await p.fill('#campo-email', 'cliente@sandbox.artenos.test'); await p.fill('#campo-password', 'errada123');
  await p.locator('.login-form .primary-button').click(); await p.waitForTimeout(2500);
  log.push('wrong pw: ' + await p.locator('.form-error-summary').innerText());
  log.push('email preserved: ' + await p.inputValue('#campo-email'));
  await p.screenshot({ path: (process.env.OUT_DIR || '.') + '/a_2_login_erro.png' });
  // 4. teclado nas abas
  await p.locator('[role=tab][aria-selected=true]').focus(); await p.keyboard.press('ArrowRight');
  log.push('tab after arrow: ' + await p.locator('[role=tab][aria-selected=true]').innerText() + ' url ' + p.url());
  // 5. cadastro com erros
  await p.locator('.register-form .primary-button').click(); await p.waitForTimeout(300);
  log.push('register errors: ' + (await p.locator('.form-error-summary li').count()));
  await p.screenshot({ path: (process.env.OUT_DIR || '.') + '/a_3_cadastro_erros.png' });
  // 6. cadastro válido
  const email = `novo${Date.now()}@sandbox.artenos.test`;
  await p.fill('#campo-fullName', 'Teste Novo Cliente'); await p.fill('#campo-document', '52998224725');
  await p.fill('#campo-phone', '11987654321'); await p.fill('#campo-cep', '01310100'); await p.waitForTimeout(1500);
  await p.fill('#campo-address', 'Avenida Paulista'); await p.fill('#campo-number', '10'); await p.fill('#campo-city', 'São Paulo'); await p.fill('#campo-state', 'SP');
  await p.fill('#campo-email', email); await p.fill('#campo-password', 'Senha@1234'); await p.fill('#campo-confirmPassword', 'Senha@1234');
  await p.check('#campo-terms');
  await p.locator('.register-form .primary-button').click(); await p.waitForTimeout(4000);
  log.push('register result: ' + (await p.locator('.success-state, .form-error-summary').first().innerText()).slice(0, 200));
  // 7. login com retorno
  await p.goto(base + '/acesso?voltar=/favoritos', { waitUntil: 'networkidle' });
  await p.fill('#campo-email', 'cliente@sandbox.artenos.test'); await p.fill('#campo-password', 'Artenos@2026');
  await p.locator('.login-form .primary-button').click(); await p.waitForTimeout(3500);
  log.push('after login url: ' + p.url());
  // 8. open redirect blocked
  await p.goto(base + '/acesso?voltar=//evil.com', { waitUntil: 'networkidle' });
  // 9. recuperação (deslogado)
  const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } }); const q = await c2.newPage();
  await q.goto(base + '/acesso', { waitUntil: 'networkidle' }); await q.screenshot({ path: (process.env.OUT_DIR || '.') + '/a_4_login_desktop.png' });
  await q.getByRole('button', { name: 'Esqueceu sua senha?' }).click();
  await q.fill('#campo-email', 'cliente@sandbox.artenos.test'); await q.locator('.recovery-form .primary-button').click(); await q.waitForTimeout(3000);
  log.push('recovery: ' + (await q.locator('.success-state, .form-error-summary').first().innerText()).slice(0, 160));
  console.log(log.join('\n')); await b.close();
})();
