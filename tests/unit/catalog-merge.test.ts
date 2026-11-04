import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCatalog, type CustomService } from "../../lib/custom-services.ts";

const service = (id: string, starting_price: number | null) => ({ id, artisan_id: "a", title: id, description: null, image_url: null, starting_price, min_production_days: 1, max_production_days: 2 }) as CustomService;
const products = [{ id: "p10", price: 10 }, { id: "p40", price: "40" }, { id: "p90", price: 90 }];
const ids = (entries: { item: { id: string } }[]) => entries.map((entry) => entry.item.id);

test("menor preço ordena peças e encomendas juntas", () => {
  const merged = mergeCatalog(products, [service("e50", 50), service("e5", 5), service("sem", null)], "price_asc", false);
  assert.deepEqual(ids(merged), ["e5", "p10", "p40", "e50", "p90", "sem"]);
});

test("maior preço também", () => {
  assert.deepEqual(ids(mergeCatalog(products, [service("e50", 50), service("e200", 200)], "price_desc", false)), ["e200", "p90", "e50", "p40", "p10"]);
});

test("com mais peças para carregar, a encomenda mais cara espera a sua vez", () => {
  const merged = mergeCatalog(products, [service("e50", 50), service("e500", 500)], "price_asc", true);
  assert.deepEqual(ids(merged), ["p10", "p40", "e50", "p90"]);
});

test("mais recentes mantém as encomendas primeiro", () => {
  assert.deepEqual(ids(mergeCatalog(products, [service("e1", 1)], "newest", true)), ["e1", "p10", "p40", "p90"]);
});
