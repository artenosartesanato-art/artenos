import { test } from "node:test";
import assert from "node:assert/strict";
import { accountLinks, adminRedirectFor } from "../../lib/navigation.ts";

test("menu da conta do admin leva ao painel e ao perfil da administração", () => {
  assert.deepEqual(accountLinks("admin").map((link) => link.href), ["/administracao", "/administracao/perfil"]);
});

test("loja e comprador mantêm as opções deles", () => {
  assert.equal(accountLinks("seller")[0].href, "/vendedor");
  assert.equal(accountLinks("client")[0].href, "/perfil");
});

test("páginas de comprador mandam o admin para o painel; vitrine não", () => {
  assert.equal(adminRedirectFor("/perfil"), "/administracao");
  assert.equal(adminRedirectFor("/pedidos/123"), "/administracao");
  assert.equal(adminRedirectFor("/administracao/perfil"), null);
  assert.equal(adminRedirectFor("/"), null);
  assert.equal(adminRedirectFor("/categorias"), null);
  assert.equal(adminRedirectFor("/perfilx"), null);
});
