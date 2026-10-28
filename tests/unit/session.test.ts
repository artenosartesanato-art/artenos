import { test } from "node:test";
import assert from "node:assert/strict";
import { idleLimitMs, isProtectedPath, splitChunks, ADMIN_IDLE_LIMIT_MS, IDLE_LIMIT_MS } from "../../lib/session.ts";
import {
  checkThrottle, emailKey, registerFailure, registerSuccess, waitLabel, BASE_LOCK_MS, MAX_LOCK_MS, type ThrottleState,
} from "../../lib/login-throttle.ts";

test("inatividade: admin sempre 15 min; conta comum só sem 'manter conectado'", () => {
  assert.equal(idleLimitMs({ admin: true, remember: true }), ADMIN_IDLE_LIMIT_MS);
  assert.equal(idleLimitMs({ admin: false, remember: false }), IDLE_LIMIT_MS);
  assert.equal(idleLimitMs({ admin: false, remember: true }), null);
});

test("rotas protegidas", () => {
  for (const path of ["/perfil", "/pedidos", "/mensagens", "/vendedor", "/vendedor/perfil", "/administracao", "/pagamento/abc"]) {
    assert.equal(isProtectedPath(path), true, path);
  }
  for (const path of ["/", "/carrinho", "/favoritos", "/categorias", "/loja", "/perfilx", "/acesso"]) {
    assert.equal(isProtectedPath(path), false, path);
  }
});

test("sessão grande é dividida em pedaços e remontada igual", () => {
  const token = "x".repeat(7100);
  const parts = splitChunks(token, 3000);
  assert.deepEqual(parts.map((part) => part.length), [3000, 3000, 1100]);
  assert.equal(parts.join(""), token);
  assert.deepEqual(splitChunks(""), [""]);
});

test("nunca corta no meio de um %XX (bug real: 'URI malformed')", () => {
  const session = JSON.stringify({ user: { full_name: "Joana Ribeiro", story: "Ateliê \"Fio de Barro\" — cerâmica ".repeat(80) } });
  const encoded = encodeURIComponent(session);
  for (const size of [97, 500, 1000, 2999, 3000]) {
    const parts = splitChunks(encoded, size);
    for (const part of parts) {
      assert.ok(part.length <= size);
      // Nenhum pedaço termina com um "%" ou "%X" incompleto.
      assert.ok(!/%[0-9A-Fa-f]?$/.test(part), `corte dentro de %XX com size=${size}`);
    }
    assert.equal(decodeURIComponent(parts.join("")), session);
  }
});

test("limite de tentativas: bloqueia após 5 erros e dobra o tempo", () => {
  let state: ThrottleState = {};
  const t0 = 1_000_000;
  for (let i = 0; i < 4; i += 1) state = registerFailure(state, "Ana@Ex.com", t0 + i);
  assert.equal(checkThrottle(state, "ana@ex.com", t0 + 10).allowed, true);
  state = registerFailure(state, "ana@ex.com", t0 + 10);
  const blocked = checkThrottle(state, "ANA@ex.com ", t0 + 20);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryInMs, BASE_LOCK_MS - 10);
  assert.equal(checkThrottle(state, "outra@ex.com", t0 + 20).allowed, true);
  // Segundo bloqueio: 2 min; teto de 15 min.
  const after = t0 + 10 + BASE_LOCK_MS;
  for (let i = 0; i < 5; i += 1) state = registerFailure(state, "ana@ex.com", after + i);
  assert.equal(checkThrottle(state, "ana@ex.com", after + 4).retryInMs, 2 * BASE_LOCK_MS);
  assert.ok(MAX_LOCK_MS >= 2 * BASE_LOCK_MS);
  assert.equal(checkThrottle(registerSuccess(state, "ana@ex.com"), "ana@ex.com", after).allowed, true);
});

test("erros antigos (fora de 10 min) não contam", () => {
  let state: ThrottleState = {};
  for (let i = 0; i < 4; i += 1) state = registerFailure(state, "a@b.com", i);
  state = registerFailure(state, "a@b.com", 11 * 60_000);
  assert.equal(checkThrottle(state, "a@b.com", 11 * 60_000).allowed, true);
});

test("guarda só um resumo do e-mail e formata a espera", () => {
  assert.equal(emailKey("A@B.com"), emailKey(" a@b.com "));
  assert.ok(!emailKey("a@b.com").includes("@"));
  assert.equal(waitLabel(42_000), "42 s");
  assert.equal(waitLabel(120_000), "2 min");
});
