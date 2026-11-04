// Aviso de cookies já respondido ("só essenciais") em todo contexto do teste:
// o aviso fixo no rodapé cobriria botões que os testes clicam. A auditoria
// (audit.cjs) não usa isto, para continuar avaliando o aviso.
const CONSENT = JSON.stringify({ choice: 'essential', version: 1, at: '2026-01-01T00:00:00.000Z' });

function acceptCookies(browser) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await newContext(...args);
    await context.addInitScript((value) => {
      try { if (!localStorage.getItem('artenos:cookies')) localStorage.setItem('artenos:cookies', value); } catch { /* sem armazenamento */ }
    }, CONSENT);
    return context;
  };
  browser.newPage = async (options) => (await browser.newContext(options)).newPage();
  return browser;
}

module.exports = { acceptCookies };
