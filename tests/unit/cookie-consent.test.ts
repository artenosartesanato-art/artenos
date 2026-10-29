import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConsent, serializeConsent } from "../../lib/cookie-consent.ts";

test("guarda e lê a escolha de cookies", () => {
  assert.equal(parseConsent(serializeConsent("all")), "all");
  assert.equal(parseConsent(serializeConsent("essential")), "essential");
});

test("escolha ausente, inválida ou de versão antiga pede de novo", () => {
  assert.equal(parseConsent(null), null);
  assert.equal(parseConsent("lixo"), null);
  assert.equal(parseConsent(JSON.stringify({ choice: "all", version: 0, at: "" })), null);
});
