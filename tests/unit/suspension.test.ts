import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSuspensionEnd, isSuspended, isSuspensionError, suspensionMessage } from "../../lib/suspension.ts";

test("isSuspended confere a data", () => {
  assert.equal(isSuspended(null), false);
  assert.equal(isSuspended("2026-11-07T15:00:00Z", Date.parse("2026-11-01T00:00:00Z")), true);
  assert.equal(isSuspended("2026-11-07T15:00:00Z", Date.parse("2026-11-08T00:00:00Z")), false);
});

test("mensagem e reconhecimento do erro do banco", () => {
  assert.equal(formatSuspensionEnd("2026-11-07T15:30:00Z"), "07/11/2026 às 12:30");
  assert.match(suspensionMessage("2026-11-07T15:30:00Z"), /suspensa até 07\/11\/2026 às 12:30/);
  assert.equal(isSuspensionError({ message: "Sua conta está suspensa até 07/11/2026 às 12:30. Enquanto isso..." }), true);
  assert.equal(isSuspensionError(new Error("Outro erro")), false);
});
