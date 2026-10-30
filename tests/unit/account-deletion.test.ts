import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deletionDateFrom, deletionRequestedEmail, emailTakenMessage, formatDeletionDate, reactivationMailto,
} from "../../lib/account-deletion.ts";

test("exclusão definitiva 30 dias depois do pedido, em data de Brasília", () => {
  const scheduled = deletionDateFrom(new Date("2026-10-29T15:00:00Z"));
  assert.equal(formatDeletionDate(scheduled), "28/11/2026");
  // 01h UTC ainda é o dia anterior em Brasília.
  assert.equal(formatDeletionDate("2026-11-28T01:00:00Z"), "27/11/2026");
});

test("e-mail de reativação vem com assunto e o e-mail da conta", () => {
  const link = reactivationMailto("suporte@artenos.com", "ana@ex.com");
  assert.ok(link.startsWith("mailto:suporte@artenos.com?subject=Reativa%C3%A7%C3%A3o%20de%20conta"));
  assert.ok(decodeURIComponent(link).includes("E-mail da conta: ana@ex.com"));
});

test("textos citam a data e o e-mail de suporte", () => {
  const mail = deletionRequestedEmail("Ana", "2026-11-28T15:00:00Z", "suporte@artenos.com");
  assert.match(mail.text, /28\/11\/2026/);
  assert.match(mail.text, /suporte@artenos\.com/);
  assert.match(emailTakenMessage("suporte@artenos.com"), /reativá-la/);
});
