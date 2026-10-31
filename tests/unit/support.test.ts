import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSupport } from "../../lib/support.ts";
import { sameOrigin } from "../../lib/request-guard.ts";

const base = { name: "Ana", email: "ana@exemplo.com", topic: "compra", message: "Meu pedido não chegou ainda.", startedAt: 0 };

test("aceita um chamado completo", () => {
  const result = validateSupport(base, 10_000);
  assert.equal(result.ok, true);
});

test("recusa robôs (campo escondido ou envio rápido)", () => {
  assert.equal(validateSupport({ ...base, website: "http://spam" }, 10_000).ok, false);
  assert.equal(validateSupport({ ...base, startedAt: 9_000 }, 10_000).ok, false);
});

test("valida campos", () => {
  assert.equal(validateSupport({ ...base, email: "ana@" }, 10_000).ok, false);
  assert.equal(validateSupport({ ...base, topic: "xyz" }, 10_000).ok, false);
  assert.equal(validateSupport({ ...base, message: "oi" }, 10_000).ok, false);
});

test("só aceita POST do próprio site", () => {
  const request = (origin: string | null) => new Request("https://artenos.com.br/api/ajuda", {
    method: "POST", headers: origin ? { origin, host: "artenos.com.br" } : { host: "artenos.com.br" },
  });
  assert.equal(sameOrigin(request("https://artenos.com.br")), true);
  assert.equal(sameOrigin(request("https://site-malicioso.com")), false);
  assert.equal(sameOrigin(request(null)), false);
});

test("contato: e-mail confirmado e número do pedido só com números", async () => {
  const { validateSupport } = await import("../../lib/support.ts");
  const base = { name: "Ana", email: "ana@ex.com", topic: "compra", message: "Meu pedido não chegou ainda.", startedAt: 0 };
  assert.deepEqual(validateSupport({ ...base, emailConfirm: "ANA@ex.com", orderCode: "1042" }, 60_000), {
    ok: true, value: { name: "Ana", email: "ana@ex.com", topic: "compra", orderCode: "AN-1042", message: "Meu pedido não chegou ainda." },
  });
  assert.equal(validateSupport({ ...base, emailConfirm: "outra@ex.com" }, 60_000).ok, false);
  assert.equal(validateSupport({ ...base, orderCode: "12a4" }, 60_000).ok, false);
  assert.equal((validateSupport({ ...base, orderCode: "AN-77" }, 60_000) as { value: { orderCode: string } }).value.orderCode, "AN-77");
});
