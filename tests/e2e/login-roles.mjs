// Login de cada papel, de ponta a ponta (navegador de verdade, via Playwright).
//
//   E2E_BASE_URL=http://localhost:3000 \
//   E2E_ADMIN=admin@ex.com:senha E2E_SELLER=loja@ex.com:senha E2E_CLIENT=cliente@ex.com:senha \
//   NODE_PATH=$(npm root -g) node tests/e2e/login-roles.mjs
//
// Para cada conta, entra duas vezes: com a última atividade recente e com a de
// ontem (cenário do loop: a sessão nova era encerrada "por inatividade").
// Espera cair direto no destino do papel, sem voltar para /acesso.
// Playwright não é dependência do projeto: use o instalado na máquina
// (NODE_PATH=$(npm root -g)) ou `npm i -D playwright`.
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const roles = [
  ["admin", process.env.E2E_ADMIN, /^\/administracao/],
  ["loja", process.env.E2E_SELLER, /^\/vendedor/],
  ["comprador", process.env.E2E_CLIENT, /^\/$/],
].filter(([, account]) => account);

if (!roles.length) {
  console.error("Informe ao menos uma conta: E2E_ADMIN, E2E_SELLER ou E2E_CLIENT (email:senha).");
  process.exit(2);
}

const browser = await chromium.launch();
let failures = 0;
for (const [role, account, expected] of roles) {
  const [email, ...rest] = account.split(":");
  for (const stale of [false, true]) {
    const page = await browser.newPage();
    await page.addInitScript((old) => {
      localStorage.setItem("artenos:cookies", JSON.stringify({ choice: "essential", version: 1, at: "" }));
      if (old && !sessionStorage.getItem("e2e")) {
        localStorage.setItem("artenos:ultima-atividade", String(Date.now() - 24 * 3600e3));
        sessionStorage.setItem("e2e", "1");
      }
    }, stale);
    const started = Date.now();
    await page.goto(`${base}/acesso`, { waitUntil: "load" });
    await page.fill("input[name=email]", email);
    await page.fill("input[name=password]", rest.join(":"));
    await page.click(".login-form .primary-button");
    let path = "";
    try {
      await page.waitForURL((url) => expected.test(url.pathname), { timeout: 15_000 });
      // Fica no destino (não é mandada de volta ao login logo depois).
      await page.waitForTimeout(2_000);
      path = new URL(page.url()).pathname;
    } catch {
      path = new URL(page.url()).pathname + new URL(page.url()).search;
    }
    const ok = expected.test(path) && !path.startsWith("/acesso");
    if (!ok) failures += 1;
    console.log(`${ok ? "ok  " : "FALHA"} ${role} (${stale ? "atividade antiga" : "atividade recente"}) → ${path} em ${Date.now() - started} ms`);
    await page.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
