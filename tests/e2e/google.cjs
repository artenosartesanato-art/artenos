// Login com Google, conclusão do cadastro e recuperação de senha (Supabase local).
// Uso: BASE_URL=http://localhost:3002 SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… node tests/e2e/google.cjs
//
// Requisitos no Supabase local (supabase/config.toml):
//   [auth.external.google] enabled = true (client_id de teste), skip_nonce_check = true
//   additional_redirect_urls com http://localhost:3002/**, [local_smtp] (Mailpit) ligado.
// O Google de verdade não é chamado: a página do Google é substituída por um
// esboço só para conferir os parâmetros. A volta do Google é reproduzida com
// uma conta "google" criada pela API administrativa local e um link de acesso,
// que deixa o navegador exatamente como após o OAuth (sessão em /acesso/google).
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const base = process.env.BASE_URL || 'http://localhost:3002';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const MAIL = process.env.MAILPIT_URL || 'http://127.0.0.1:54324';
const DB = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
// Chaves do Supabase LOCAL (veja `supabase status`): nunca as de produção.
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!SERVICE || !PUBLISHABLE) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY do Supabase local.');
  process.exit(2);
}
const sql = (query) => execFileSync('psql', [DB, '-Atc', query], { encoding: 'utf8' }).trim();
const admin = (path, body) => fetch(`${API}/auth/v1/admin/${path}`, {
  method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(async (response) => ({ status: response.status, json: await response.json() }));

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FALHA'}  ${label}`); if (!ok) failures += 1; };
const waitFor = async (fn, timeout = 15000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn().catch(() => false)) return true; await new Promise((r) => setTimeout(r, 300)); }
  return false;
};

/** Conta como o Google cria (sem account_type → sem profile). */
async function googleAccount(email, name) {
  sql(`delete from auth.users where email = '${email}'`);
  const created = await admin('users', {
    email, email_confirm: true,
    user_metadata: { full_name: name, name, avatar_url: 'https://lh3.googleusercontent.com/a/artenos-teste', email_verified: true, iss: 'https://accounts.google.com' },
    app_metadata: { provider: 'google', providers: ['google'] },
  });
  if (created.status >= 300) throw new Error('não criou a conta de teste: ' + JSON.stringify(created.json));
  return created.json.id;
}
/** Reproduz a volta do Google: sessão válida chegando em /acesso/google. */
async function returnFromGoogle(page, email) {
  const link = await admin('generate_link', { type: 'magiclink', email, redirect_to: `${base}/acesso/google` });
  await page.goto(link.json.action_link ?? link.json.properties?.action_link);
}
const genericCpf = () => {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const len of [9, 10]) {
    let sum = 0; for (let i = 0; i < len; i++) sum += n[i] * (len + 1 - i);
    n.push((sum * 10) % 11 % 10);
  }
  return n.join('');
};
async function fillProfile(page, { cpf, artisan = false }) {
  await page.fill('#campo-document', cpf);
  await page.fill('#campo-phone', '11912345678');
  await page.fill('#campo-cep', '01310100');
  await page.fill('#campo-state', 'SP');
  await page.fill('#campo-address', 'Avenida Paulista');
  await page.fill('#campo-number', '1000');
  await page.fill('#campo-city', 'São Paulo');
  if (artisan) {
    await page.fill('#campo-storeName', 'Ateliê Teste Google');
    await page.selectOption('#campo-specialty', { index: 1 });
    await page.fill('#campo-story', 'Comecei a bordar com minha avó e cada peça leva uma semana de trabalho cuidadoso.');
  }
  await page.check('#campo-terms');
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // O Google real não é aberto: o pedido ao Supabase é feito sem seguir o
  // redirecionamento e só guardamos para onde ele mandaria.
  const googleUrls = [];
  await context.route('**/auth/v1/authorize**', async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const location = response.headers()['location'];
    if (location) googleUrls.push(location);
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Google (simulado)</h1>' });
  });
  const authorizeUrls = [];
  context.on('request', (request) => { if (request.url().includes('/auth/v1/authorize')) authorizeUrls.push(request.url()); });
  const page = await context.newPage();
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); failures += 1; });

  // 1. Botão nas três abas, com logo e texto.
  for (const aba of ['entrar', 'cliente', 'artesa']) {
    await page.goto(`${base}/acesso?aba=${aba}`, { waitUntil: 'networkidle' });
    const button = page.locator('.google-button');
    check(await button.count() === 1 && (await button.textContent()).includes('Continuar com o Google')
      && await button.locator('svg path').count() === 4, `aba ${aba}: botão "Continuar com o Google" com a logo`);
  }

  // 2. Clique leva ao Google com escolha de conta e volta para /acesso/google; perfil guardado.
  for (const [aba, perfil] of [['artesa', 'artisan'], ['entrar', null]]) {
    googleUrls.length = 0;
    await page.goto(`${base}/acesso?aba=${aba}&voltar=%2Fpedidos`, { waitUntil: 'networkidle' });
    await page.locator('.google-button').click();
    await waitFor(async () => googleUrls.length > 0);
    const google = new URL(googleUrls[0] ?? 'http://x');
    check(google.searchParams.get('client_id') === 'artenos-local-test.apps.googleusercontent.com'
      && google.searchParams.get('prompt') === 'select_account'
      && google.searchParams.get('redirect_uri') === `${API}/auth/v1/callback`,
      `aba ${aba}: Google aberto com o app configurado, escolha de conta e retorno ao Supabase`);
    const authorize = new URL(authorizeUrls[authorizeUrls.length - 1] ?? 'http://x');
    check(authorize.searchParams.get('provider') === 'google' && authorize.searchParams.get('redirect_to') === `${base}/acesso/google`,
      `aba ${aba}: volta do Supabase configurada para ${base}/acesso/google`);
    await page.goto(`${base}/termos`);
    const intent = await page.evaluate(() => JSON.parse(sessionStorage.getItem('artenos:google-intent') || '{}'));
    check(intent.perfil === perfil && intent.voltar === '/pedidos', `aba ${aba}: perfil (${perfil}) e destino guardados para a volta`);
  }

  // 3. Cadastro com Google como cliente: dados que o Google não dá são pedidos.
  const clientEmail = 'google.cliente@sandbox.artenos.test';
  const clientId = await googleAccount(clientEmail, 'Bruna Google Teste');
  await page.goto(`${base}/acesso?aba=cliente`, { waitUntil: 'networkidle' });
  await page.evaluate(() => sessionStorage.setItem('artenos:google-intent', JSON.stringify({ perfil: 'client', voltar: null, at: Date.now() })));
  await returnFromGoogle(page, clientEmail);
  await page.waitForURL(/\/concluir-cadastro/, { timeout: 20000 });
  check(new URL(page.url()).searchParams.get('perfil') === 'client', 'volta do Google sem cadastro → /concluir-cadastro?perfil=client');
  await page.waitForSelector('#campo-fullName');
  check(await page.inputValue('#campo-fullName') === 'Bruna Google Teste', 'nome do Google já preenchido');
  check((await page.locator('.complete-account').textContent()).includes(clientEmail), 'e-mail do Google exibido (não é pedido de novo)');
  check(await page.locator('#campo-email, input[name=password]').count() === 0, 'sem campos de e-mail e senha');
  check(await page.locator('input[value=client]').isChecked(), 'perfil "Quero comprar" mantido');

  // 4. Bloqueio: páginas internas levam de volta; o banco recusa carrinho.
  for (const path of ['/pedidos', '/', '/carrinho']) {
    await page.goto(base + path);
    check(await waitFor(async () => page.url().includes('/concluir-cadastro')), `cadastro incompleto: ${path} → /concluir-cadastro`);
  }
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
    return key ? JSON.parse(localStorage.getItem(key)).access_token : null;
  });
  const anyProduct = sql(`select id from products where active limit 1`);
  const cart = await fetch(`${API}/rest/v1/rpc/add_to_cart`, {
    method: 'POST', headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_product_id: anyProduct, p_quantity: 1 }),
  });
  check(cart.status >= 400 && sql(`select count(*) from cart_items where client_id='${clientId}'`) === '0', `banco recusa carrinho sem cadastro concluído (HTTP ${cart.status})`);

  // 5. Validação no banco (não só na tela): CPF inválido é recusado pela função.
  const bad = await fetch(`${API}/rest/v1/rpc/complete_oauth_signup`, {
    method: 'POST', headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_account_type: 'client', p_registration_mode: 'standard', p_full_name: 'Bruna Teste', p_document: '11111111111',
      p_phone: '11912345678', p_cep: '01310100', p_address: 'Av', p_address_number: '1', p_city: 'São Paulo', p_state: 'SP',
      p_store_name: null, p_specialty: null, p_story: null, p_terms_accepted: true }),
  }).then((r) => r.json());
  check(/Documento inválido/.test(bad.message || ''), `banco recusa CPF inválido ("${bad.message}")`);

  // 6. Tela: erros de validação; sair e voltar depois retoma o cadastro.
  await page.fill('#campo-document', '123');
  await page.locator('.complete-card button.primary-button').click();
  check(await page.locator('.field-error').count() >= 3, 'campos obrigatórios e CPF inválido apontados na tela');
  await page.locator('.complete-card .form-switch button').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/concluir-cadastro'), { timeout: 15000 });
  await returnFromGoogle(page, clientEmail);
  check(await waitFor(async () => page.url().includes('/concluir-cadastro')), 'saiu antes de concluir e voltou: cadastro retomado');
  await page.waitForSelector('#campo-document');

  // 7. Conclui como cliente → área do cliente; perfil salvo no usuário certo.
  await fillProfile(page, { cpf: genericCpf() });
  await page.locator('.complete-card button.primary-button').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/concluir-cadastro'), { timeout: 20000 });
  check(new URL(page.url()).pathname === '/', `cliente concluído vai para a vitrine (${new URL(page.url()).pathname})`);
  check(sql(`select account_type||'|'||approval_status||'|'||email from profiles where id='${clientId}'`) === `client|active|${clientEmail}`,
    'profile do cliente criado na mesma conta, e-mail vindo do Google');
  await page.goto(base + '/pedidos');
  await page.waitForTimeout(1500);
  check(new URL(page.url()).pathname === '/pedidos', 'cadastro concluído: /pedidos liberado');

  // 8. Entrar de novo com o Google: não cria outra conta e vai direto.
  await page.locator('header .store-account').count();
  await context.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await returnFromGoogle(page, clientEmail);
  await page.waitForURL((u) => !u.pathname.startsWith('/acesso'), { timeout: 20000 });
  check(new URL(page.url()).pathname === '/', 'segundo acesso com Google vai direto para a vitrine');
  check(sql(`select count(*) from auth.users where email='${clientEmail}'`) === '1' && sql(`select count(*) from profiles where email='${clientEmail}'`) === '1',
    'mesma conta Google: um usuário e um profile');

  // 9. Cadastro com Google como artesã → análise.
  await context.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  const artisanEmail = 'google.artesa@sandbox.artenos.test';
  const artisanId = await googleAccount(artisanEmail, 'Cida Google Artesã');
  await page.goto(`${base}/acesso?aba=artesa`, { waitUntil: 'networkidle' });
  await page.evaluate(() => sessionStorage.setItem('artenos:google-intent', JSON.stringify({ perfil: 'artisan', voltar: null, at: Date.now() })));
  await returnFromGoogle(page, artisanEmail);
  await page.waitForURL(/\/concluir-cadastro\?perfil=artisan/, { timeout: 20000 });
  await page.waitForSelector('#campo-storeName');
  check(await page.locator('input[value=artisan]').isChecked(), 'artesã: perfil "Quero vender" mantido, campos da loja pedidos');
  await fillProfile(page, { cpf: genericCpf(), artisan: true });
  await page.locator('.complete-card button.primary-button').click();
  await page.waitForURL(/cadastro-em-analise/, { timeout: 20000 });
  check(sql(`select p.account_type||'|'||p.approval_status||'|'||a.status from profiles p join artisan_applications a on a.artisan_id=p.id where p.id='${artisanId}'`) === 'artisan|pending_review|pending_review',
    'artesã concluída: loja em análise e solicitação criada');

  // 10. Recuperação de senha (e-mail real no Mailpit).
  await context.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' });
  await page.goto(`${base}/acesso?aba=entrar`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Esqueceu sua senha?' }).click();
  check(await page.getByText('Criou a conta com o Google?').count() === 1, 'recuperação explica o acesso de contas Google');
  await page.fill('.recovery-form input[name=email]', 'email-invalido');
  await page.locator('.recovery-form button.primary-button').click();
  check(await page.locator('.recovery-form .field-error').count() === 1, 'formato de e-mail validado');
  await page.fill('.recovery-form input[name=email]', 'nao.existe@sandbox.artenos.test');
  await page.locator('.recovery-form button.primary-button').click();
  await page.waitForSelector('.success-state');
  const unknownText = await page.locator('.success-state').textContent();
  await page.getByRole('button', { name: 'Voltar para o login' }).click();
  await page.getByRole('button', { name: 'Esqueceu sua senha?' }).click();
  await page.fill('.recovery-form input[name=email]', 'cliente@sandbox.artenos.test');
  await page.locator('.recovery-form button.primary-button').click();
  await page.waitForSelector('.success-state');
  const knownText = (await page.locator('.success-state').textContent()).replace('cliente@sandbox.artenos.test', 'nao.existe@sandbox.artenos.test');
  check(knownText === unknownText, 'mesma resposta para e-mail cadastrado e não cadastrado');
  let mail = null;
  await waitFor(async () => {
    const list = await fetch(`${MAIL}/api/v1/messages`).then((r) => r.json());
    mail = list.messages?.find((m) => m.To?.some((to) => to.Address === 'cliente@sandbox.artenos.test'));
    return Boolean(mail);
  }, 20000);
  const list = await fetch(`${MAIL}/api/v1/messages`).then((r) => r.json());
  check(Boolean(mail) && !list.messages.some((m) => m.To?.some((to) => to.Address === 'nao.existe@sandbox.artenos.test')),
    'e-mail de recuperação enviado só para a conta existente');
  const body = mail ? await fetch(`${MAIL}/api/v1/message/${mail.ID}`).then((r) => r.json()) : { HTML: '' };
  const resetLink = (body.HTML.match(/href="([^"]+)"/) || [])[1]?.replace(/&amp;/g, '&');
  await page.goto(resetLink);
  await page.waitForSelector('form.reset-card', { timeout: 15000 });
  const input = page.locator('#campo-password');
  await page.locator('form.reset-card .icon-button').first().click();
  check(await input.getAttribute('type') === 'text', 'mostrar/ocultar senha funciona');
  await page.fill('#campo-password', 'curta');
  await page.fill('#campo-confirmPassword', 'outra');
  await page.locator('form.reset-card button.primary-button').click();
  check(await page.locator('form.reset-card .field-error').count() === 2, 'senha curta e confirmação diferente recusadas');
  await page.fill('#campo-password', 'Artenos@2027');
  await page.fill('#campo-confirmPassword', 'Artenos@2027');
  await page.locator('form.reset-card button.primary-button').click();
  await page.getByRole('heading', { name: 'Senha atualizada' }).waitFor({ timeout: 15000 });
  check(true, 'nova senha salva pelo link do e-mail');
  await context.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(`${base}/acesso?aba=entrar`, { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', 'cliente@sandbox.artenos.test');
  await page.fill('input[name=password]', 'Artenos@2027');
  await page.locator('form.login-form button.primary-button').click();
  check(await waitFor(async () => !new URL(page.url()).pathname.startsWith('/acesso')), 'login com a nova senha');
  // Volta a senha padrão das contas de teste.
  sql(`update auth.users set encrypted_password = extensions.crypt('Artenos@2026', extensions.gen_salt('bf')) where email = 'cliente@sandbox.artenos.test'`);

  // 11. Links expirados ou inválidos.
  await page.goto(`${base}/redefinir-senha#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  check(await page.getByRole('heading', { name: 'Este link expirou' }).waitFor({ timeout: 8000 }).then(() => true, () => false), 'link expirado: mensagem clara');
  await page.goto(resetLink);
  check(await waitFor(async () => (await page.locator('h1').first().textContent()).match(/expirou|não é válido/)), 'link já usado não abre de novo');
  await page.goto(`${base}/redefinir-senha`);
  check(await page.getByRole('heading', { name: 'Este link não é válido' }).waitFor({ timeout: 8000 }).then(() => true, () => false),
    'conectado sem link de recuperação não troca a senha por ali');

  // 12. Responsividade das telas novas.
  await context.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  const lateEmail = 'google.celular@sandbox.artenos.test';
  await googleAccount(lateEmail, 'Teste Celular');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/acesso?aba=entrar', '/acesso?aba=cliente']) {
      await page.goto(base + path, { waitUntil: 'networkidle' });
      check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${width}px sem rolagem lateral: ${path}`);
    }
  }
  await returnFromGoogle(page, lateEmail);
  await page.waitForURL(/concluir-cadastro/, { timeout: 20000 });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${width}px sem rolagem lateral: /concluir-cadastro`);
    if (process.env.OUT_DIR) await page.screenshot({ path: `${process.env.OUT_DIR}/concluir-${width}.png`, fullPage: true });
  }

  // Limpa as contas de teste criadas aqui.
  sql(`delete from auth.users where email like 'google.%@sandbox.artenos.test'`);
  await browser.close();
  console.log(failures ? `${failures} falha(s)` : 'tudo ok');
  process.exit(failures ? 1 : 0);
})();
