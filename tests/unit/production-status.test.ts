import { test } from "node:test";
import assert from "node:assert/strict";
import { customOrderStage, nextProductionStep, STAGE_LABEL } from "../../lib/production-status.ts";

test("etapas do item até ficar pronto", () => {
  assert.equal(customOrderStage(null, "payment_confirmed"), "awaiting_confirmation");
  assert.equal(customOrderStage("in_production", "preparing"), "in_production");
  assert.equal(customOrderStage("ready_to_ship", "preparing"), "ready_to_ship");
});

test("envio, entrega e cancelamento vêm do pedido", () => {
  assert.equal(customOrderStage("ready_to_ship", "shipped"), "shipped");
  assert.equal(customOrderStage("in_production", "delivered"), "delivered");
  assert.equal(customOrderStage("in_production", "refunded"), "cancelled");
  assert.equal(STAGE_LABEL.awaiting_confirmation, "Aguardando confirmação da loja");
});

test("a loja avança uma etapa por vez", () => {
  assert.equal(nextProductionStep(null), "in_production");
  assert.equal(nextProductionStep("in_production"), "ready_to_ship");
  assert.equal(nextProductionStep("ready_to_ship"), null);
});
