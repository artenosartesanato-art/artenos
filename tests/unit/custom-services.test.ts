import { test } from "node:test";
import assert from "node:assert/strict";
import { filterServices, productionLabel, type CustomService } from "../../lib/custom-services.ts";

const services: CustomService[] = [
  { id: "s1", artisan_id: "a", store_name: "kaike do grau", title: "Bolsa sob medida", description: "Crochê na cor que você quiser", image_url: null,
    starting_price: 50, min_production_days: 10, max_production_days: 15, category_id: "croche", category_name: "Crochê e Tricô" },
  { id: "s2", artisan_id: "b", store_name: "Barro Vivo", title: "Jogo de canecas", description: null, image_url: null,
    starting_price: null, min_production_days: 7, max_production_days: 7, category_id: "ceramica", category_name: "Cerâmica e Barro" },
];
const none = { query: "", categoryId: null, min: null, max: null, readyOnly: false, madeToOrderOnly: false };

test("sem filtro: todas as opções aparecem junto com as peças", () => {
  assert.equal(filterServices(services, none).length, 2);
});

test("pronta entrega esconde as opções; sob encomenda mantém", () => {
  assert.equal(filterServices(services, { ...none, readyOnly: true }).length, 0);
  assert.equal(filterServices(services, { ...none, madeToOrderOnly: true }).length, 2);
});

test("categoria, preço e busca (sem acento) valem para as opções", () => {
  assert.deepEqual(filterServices(services, { ...none, categoryId: "ceramica" }).map((s) => s.id), ["s2"]);
  assert.deepEqual(filterServices(services, { ...none, min: 40, max: 60 }).map((s) => s.id), ["s1"]);
  assert.deepEqual(filterServices(services, { ...none, query: "croche" }).map((s) => s.id), ["s1"]);
});

test("prazo em dias", () => {
  assert.equal(productionLabel(services[0]), "10 a 15 dias");
  assert.equal(productionLabel({ min_production_days: 1, max_production_days: 1 }), "1 dia");
});
