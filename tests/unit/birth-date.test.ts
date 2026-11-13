import { test } from "node:test";
import assert from "node:assert/strict";
import { ageOn, birthDateError, checkBirthDate, formatBirthDate, maskBirthDate, parseBirthDate } from "../../lib/birth-date.ts";

const TODAY = "2026-11-13";

test("máscara e leitura da data (dd/mm/aaaa)", () => {
  assert.equal(maskBirthDate("25031990"), "25/03/1990");
  assert.equal(maskBirthDate("2503"), "25/03");
  assert.equal(maskBirthDate("25/03/1990999"), "25/03/1990");
  assert.equal(parseBirthDate("25/03/1990"), "1990-03-25");
  assert.equal(parseBirthDate("1990-03-25"), "1990-03-25");
  assert.equal(parseBirthDate("31/02/1990"), null);
  assert.equal(parseBirthDate("29/02/2001"), null);
  assert.equal(parseBirthDate("29/02/2000"), "2000-02-29");
  assert.equal(parseBirthDate("10/13/1990"), null);
  assert.equal(parseBirthDate("25/03/90"), null);
  assert.equal(formatBirthDate("1990-03-25"), "25/03/1990");
});

test("idade em anos completos: muda só no dia do aniversário", () => {
  assert.equal(ageOn("2008-11-13", TODAY), 18);
  assert.equal(ageOn("2008-11-14", TODAY), 17);
  assert.equal(ageOn("2008-12-01", TODAY), 17);
  assert.equal(ageOn("1990-03-25", TODAY), 36);
});

test("só maiores de 18, com data possível", () => {
  assert.deepEqual(checkBirthDate("13/11/2008", TODAY), { ok: true, iso: "2008-11-13", age: 18 });
  const minor = checkBirthDate("14/11/2008", TODAY);
  assert.equal(minor.ok, false);
  assert.equal(!minor.ok && minor.reason, "underage");
  assert.equal(!minor.ok && minor.age, 17);
  assert.equal(birthDateError("", TODAY), "Informe sua data de nascimento.");
  assert.match(birthDateError("31/02/1990", TODAY) ?? "", /data válida/);
  assert.match(birthDateError("01/01/2030", TODAY) ?? "", /Confira o ano/);
  assert.match(birthDateError("01/01/1850", TODAY) ?? "", /Confira o ano/);
  assert.match(birthDateError("01/01/2015", TODAY) ?? "", /18 anos/);
  assert.equal(birthDateError("25/03/1990", TODAY), null);
});
