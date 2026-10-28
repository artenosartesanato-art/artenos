import { test } from "node:test";
import assert from "node:assert/strict";
import { accessHref, safeReturnPath } from "../../lib/navigation.ts";

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
