import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDashboard } from "../../lib/admin-dashboard.ts";

test("visão geral não quebra com dados incompletos", () => {
  assert.equal(normalizeDashboard(null), null);
  assert.equal(normalizeDashboard([]), null);
  const partial = normalizeDashboard({ sales: { orders: "3", gmv: 120 }, to_ship: 2 });
  assert.ok(partial);
  assert.equal(partial.sales.orders, 3);
  assert.equal(partial.sales.platform_fee, 0);
  assert.equal(partial.sales_previous.orders, 0);
  assert.deepEqual(partial.top_sellers, []);
  assert.equal(partial.payouts.failed_count, 0);
  assert.equal(partial.to_ship, 2);
  // Em lista (algumas versões do PostgREST)
  assert.equal(normalizeDashboard([{ sales: { orders: 1 } }])?.sales.orders, 1);
});
