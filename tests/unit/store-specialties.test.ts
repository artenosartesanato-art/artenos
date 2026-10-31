import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSpecialty, specialtyError, specialtyValueError, splitSpecialty } from "../../lib/store-specialties.ts";

test("\"Outro\" vira o texto digitado; opção da lista fica como está", () => {
  assert.equal(resolveSpecialty("Outro", "  Marchetaria   em madeira "), "Marchetaria em madeira");
  assert.equal(resolveSpecialty("Cerâmica", "ignorado"), "Cerâmica");
});

test("valor salvo volta para a lista ou para \"Outro\" + texto", () => {
  assert.deepEqual(splitSpecialty("Cerâmica"), { choice: "Cerâmica", other: "" });
  assert.deepEqual(splitSpecialty("Vitral"), { choice: "Outro", other: "Vitral" });
  assert.deepEqual(splitSpecialty(""), { choice: "", other: "" });
});

test("valida a especialidade digitada", () => {
  assert.equal(specialtyError("", ""), "Escolha a especialidade principal.");
  assert.match(String(specialtyError("Outro", "")), /Escreva a sua especialidade/);
  assert.match(String(specialtyError("Outro", "123")), /com letras/);
  assert.equal(specialtyError("Outro", "Vitral"), null);
  assert.equal(specialtyError("Papelaria", ""), null);
});

test("specialtyValueError confere o valor final", () => {
  assert.match(String(specialtyValueError("")), /Escolha a especialidade/);
  assert.match(String(specialtyValueError("x".repeat(61))), /no máximo 60/);
  assert.match(String(specialtyValueError("12")), /com letras/);
  assert.equal(specialtyValueError("Marchetaria"), null);
});
