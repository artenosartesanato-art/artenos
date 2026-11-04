import { test } from "node:test";
import assert from "node:assert/strict";
import { destinationFor } from "../../lib/google-destination.ts";

const base = { is_admin: false, has_profile: true, account_type: "client" as const, approval_status: "active" as const };

test("destino após o Google: cada perfil vai para a sua área", () => {
  assert.equal(destinationFor({ ...base, is_admin: true, has_profile: false }, "/pedidos"), "/administracao");
  assert.equal(destinationFor(base, null), "/");
  assert.equal(destinationFor(base, "/pedidos"), "/pedidos");
  assert.equal(destinationFor({ ...base, account_type: "artisan" }, null), "/vendedor");
  assert.equal(destinationFor({ ...base, account_type: "artisan", approval_status: "pending_review" }, "/pedidos"), "/cadastro-em-analise");
});

test("cadastro incompleto sempre vai para a conclusão, mantendo o perfil escolhido", () => {
  const missing = { ...base, has_profile: false, account_type: null, approval_status: null };
  assert.equal(destinationFor(missing, "/pedidos"), "/concluir-cadastro");
  assert.equal(destinationFor(missing, null, "artisan"), "/concluir-cadastro?perfil=artisan");
});

test("retorno só para caminhos internos", () => {
  assert.equal(destinationFor(base, "https://golpe.com"), "/");
  assert.equal(destinationFor(base, "//golpe.com"), "/");
});
