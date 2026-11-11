import test from "node:test";
import assert from "node:assert/strict";
import { checkPassword, passwordPolicyError } from "../../lib/password-policy.ts";

test("senha forte exige minúscula, maiúscula, número, símbolo e 8 caracteres", () => {
  assert.equal(passwordPolicyError("Artenos@2026"), null);
  assert.equal(checkPassword("Artenos@2026").valid, true);
  assert.equal(checkPassword("Artenos@2026").bars, 4);
  assert.match(passwordPolicyError("artenos@2026") ?? "", /maiúscula/);
  assert.match(passwordPolicyError("ARTENOS@2026") ?? "", /minúscula/);
  assert.match(passwordPolicyError("Artenos@abc") ?? "", /número/);
  assert.match(passwordPolicyError("Artenos2026") ?? "", /símbolo/);
  assert.match(passwordPolicyError("Ar@1") ?? "", /8 caracteres/);
  assert.equal(passwordPolicyError(""), "Crie uma senha.");
});

test("barras acompanham os critérios e só enchem com a senha aceita", () => {
  assert.equal(checkPassword("").bars, 0);
  assert.equal(checkPassword("abc").bars, 1);
  assert.equal(checkPassword("abC").bars, 2);
  assert.equal(checkPassword("abC1").bars, 3);
  assert.equal(checkPassword("aC1!").bars, 3); // curta: não completa a 4ª barra
  assert.equal(checkPassword("aC1!").level, "good");
  assert.equal(checkPassword("Ção@1234").valid, true); // acentos contam como letras
});
