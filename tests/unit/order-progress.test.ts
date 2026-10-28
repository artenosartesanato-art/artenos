import { test } from "node:test";
import assert from "node:assert/strict";
import { orderProgress } from "../../lib/order-progress.ts";

test("mapeia o status do pedido para a etapa visual", () => {
  assert.equal(orderProgress("payment_confirmed").current, 0);
  assert.equal(orderProgress("preparing").current, 1);
  assert.equal(orderProgress("shipped").current, 2);
  assert.equal(orderProgress("out_for_delivery").current, 2);
  assert.equal(orderProgress("delivery_failed").current, 2);
});

test("pedido entregue conclui todas as etapas", () => {
  const progress = orderProgress("delivered");
  assert.equal(progress.current, progress.steps.length);
});

test("cancelado e reembolsado não exibem barra de progresso", () => {
  assert.equal(orderProgress("cancelled").steps.length, 0);
  assert.equal(orderProgress("refunded").steps.length, 0);
});
