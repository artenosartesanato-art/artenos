import { test } from "node:test";
import assert from "node:assert/strict";
import { accessHref, isNavActive, safeReturnPath } from "../../lib/navigation.ts";

test("aceita apenas caminhos internos para o retorno após login", () => {
  assert.equal(safeReturnPath("/favoritos"), "/favoritos");
  assert.equal(safeReturnPath("/categorias?busca=vaso"), "/categorias?busca=vaso");
  assert.equal(safeReturnPath("//evil.com"), null);
  assert.equal(safeReturnPath("https://evil.com"), null);
  assert.equal(safeReturnPath("/\\evil.com"), null);
  assert.equal(safeReturnPath("javascript:alert(1)"), null);
  assert.equal(safeReturnPath(""), null);
  assert.equal(safeReturnPath(null), null);
});

test("não volta para a própria tela de acesso", () => {
  assert.equal(safeReturnPath("/acesso"), null);
  assert.equal(safeReturnPath("/acesso?aba=entrar"), null);
  assert.equal(safeReturnPath("/acessorios"), "/acessorios");
});

test("monta o link de acesso com o destino codificado", () => {
  assert.equal(accessHref("/carrinho"), "/acesso?voltar=%2Fcarrinho");
  assert.equal(accessHref("/"), "/acesso");
  assert.equal(accessHref("//evil.com"), "/acesso");
});

test("item do menu fica ativo nas sub-rotas, inclusive a página de uma loja", () => {
  assert.equal(isNavActive("/lojas", "/lojas"), true);
  assert.equal(isNavActive("/lojas", "/loja"), true);
  assert.equal(isNavActive("/lojas", "/lojas/kaike-do-grau"), true);
  assert.equal(isNavActive("/lojas", "/lojasx"), false);
  assert.equal(isNavActive("/categorias", "/categorias"), true);
  assert.equal(isNavActive("/pedidos", "/pagamento/abc"), true);
  assert.equal(isNavActive("/mensagens", "/mensagens"), true);
  assert.equal(isNavActive("/favoritos", "/pedidos"), false);
  assert.equal(isNavActive("/mensagens", "/vendedor/mensagens"), false);
  assert.equal(isNavActive("/vendedor/mensagens", "/vendedor/mensagens"), true);
});
