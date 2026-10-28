// Enquadramento da foto de perfil (cliente e loja), no sandbox.
// A imagem de teste é vermelha à esquerda e azul à direita: o pixel central
// da foto salva prova que o arrasto/zoom/teclado foi aplicado de verdade.
// Uso: BASE_URL=http://localhost:3000 node tests/e2e/foto-perfil.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const base = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
const out = (n) => `${process.env.OUT_DIR || '.'}/f_${n}.png`;
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8')
  .split('\n').filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

function check(label, ok, detail = '') {
  console.log((ok ? 'ok   ' : 'FALHA') + ' ' + label + (detail ? ` (${detail})` : ''));
  if (!ok) process.exitCode = 1;
}

async function testImage(page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#d02020'; ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = '#2040d0'; ctx.fillRect(600, 0, 600, 800);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Cor do pixel central da foto exibida no perfil. */
async function centerColor(page) {
  return page.evaluate(async () => {
    const img = document.querySelector('.profile-avatar img');
    if (!img) return null;
    await img.decode().catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const [r, , b] = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
    return { r, b, size: `${img.naturalWidth}x${img.naturalHeight}`, color: r > b ? 'vermelho' : 'azul' };
  });
}

async function run(b, email, profilePath, width) {
  console.log(`-- ${email} em ${profilePath} (${width}px)`);
  const page = await (await b.newContext({ viewport: { width, height: 900 }, hasTouch: width < 800 })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(base + '/acesso', { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', email); await page.fill('input[name=password]', 'Artenos@2026');
  await page.locator('form:has(input[name=password]) button:not([type=button])').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/acesso'), { timeout: 15000 });
  await page.goto(base + profilePath, { waitUntil: 'networkidle' });
  await page.locator('.profile-photo-button input[type=file]').waitFor({ state: 'attached', timeout: 15000 });

  // 1) Escolher arquivo abre o editor.
  await page.locator('.profile-photo-button input[type=file]').setInputFiles({ name: 'teste.png', mimeType: 'image/png', buffer: await testImage(page) });
  const stage = page.locator('.crop-stage');
  await page.locator('.crop-stage .crop-image').waitFor({ timeout: 8000 });
  check('editor abre com a foto escolhida', await page.locator('[role=dialog]', { hasText: 'Ajustar foto de perfil' }).isVisible());

  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('[role=dialog]'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => v.id));
  check('editor sem problemas de acessibilidade (axe)', violations.length === 0, violations.join(','));

  // 2) Cancelar não muda nada.
  const before = await centerColor(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape cancela sem alterar a foto', JSON.stringify(await centerColor(page)) === JSON.stringify(before));

  // 3) Arrastar para a direita + zoom → centro fica no lado vermelho.
  await page.locator('.profile-photo-button input[type=file]').setInputFiles({ name: 'teste.png', mimeType: 'image/png', buffer: await testImage(page) });
  await page.locator('.crop-stage .crop-image').waitFor({ timeout: 8000 });
  const box = await stage.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.locator('.crop-zoom input').fill('1.5');
  await page.screenshot({ path: out(`1_editor_${width}`) });
  await page.getByRole('button', { name: 'Salvar foto' }).click();
  await page.locator('[role=dialog]', { hasText: 'Ajustar foto de perfil' }).waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(500);
  const first = await centerColor(page);
  check('arrastar/zoom aplicados: centro vermelho', first?.color === 'vermelho', JSON.stringify(first));
  check('foto salva quadrada 512×512', first?.size === '512x512', first?.size);

  // 4) Reenquadrar abre o ORIGINAL (1200×800), não a foto recortada.
  await page.getByRole('button', { name: 'Ajustar enquadramento' }).click();
  await page.locator('.crop-stage .crop-image').waitFor({ timeout: 8000 });
  const natural = await page.locator('.crop-stage .crop-image').evaluate((img) => `${img.naturalWidth}x${img.naturalHeight}`);
  check('ajustar enquadramento usa o original guardado', natural === '1200x800', natural);

  // 5) Teclado: setas levam o enquadramento para o lado azul.
  await stage.focus();
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('Shift+ArrowLeft');
  await page.getByRole('button', { name: 'Salvar foto' }).click();
  await page.locator('[role=dialog]', { hasText: 'Ajustar foto de perfil' }).waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(500);
  const second = await centerColor(page);
  check('teclado aplicado: centro azul', second?.color === 'azul', JSON.stringify(second));

  // 6) Cabeçalho mostra a nova foto.
  const header = await page.locator('.store-account-avatar').getAttribute('src').catch(() => null);
  check('foto aparece no cabeçalho', Boolean(header));
  await page.screenshot({ path: out(`2_perfil_${width}`) });

  // 7) Armazenamento: só a foto atual e o original (as antigas foram apagadas).
  const api = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: session } = await api.auth.signInWithPassword({ email, password: 'Artenos@2026' });
  const { data: files } = await api.storage.from('artenos-profile-avatars').list(session.user.id);
  const names = (files || []).map((file) => file.name).sort();
  check('Storage guarda só foto atual + original', names.length === 2 && names.some((n) => n.endsWith('-original.webp')), names.join(', '));
  await page.context().close();
}

(async () => {
  const b = await chromium.launch();
  await run(b, 'cliente@sandbox.artenos.test', '/perfil', 1280);
  await run(b, 'barro@sandbox.artenos.test', '/vendedor/perfil', 390);
  await b.close();
})().catch((error) => { console.error(error); process.exit(1); });
