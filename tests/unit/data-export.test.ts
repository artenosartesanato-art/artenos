import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExport, exportFileName, exportToJson, maskDocument, type ExportInput } from "../../lib/data-export.ts";

const base: ExportInput = {
  email: "ana@ex.com",
  profile: { id: "u1", account_type: "client", full_name: "Ana Lima", email: "ana@ex.com", document: "12345678909", phone: "17999990000",
    address: "Rua A", address_number: "10", city: "Rio Preto", state: "SP", cep: "15086426", created_at: "2026-01-02T12:00:00Z", terms_accepted_at: "2026-01-02T12:00:00Z" },
  buyerOrders: [{ id: "o1", order_code: "ART-0001", created_at: "2026-10-01T15:00:00Z", artisan_id: "s1", status: "delivered", subtotal: 90, shipping_amount: 20, total_amount: 110, checkout_id: "c1",
    shipping_address: "Rua B", shipping_number: "5", shipping_city: "Campinas", shipping_state: "SP", shipping_cep: "13000000" }],
  orderItems: [{ order_id: "o1", product_name: "Bolsa", quantity: 1, unit_price: 90, subtotal: 90, made_to_order: false, customer_notes: "Embrulhar para presente" }],
  checkouts: [{ id: "c1", payment_method: "pix" }],
  storeNames: { s1: "Ateliê Barro Vivo" },
  favorites: [], favoriteProducts: [], conversations: [], messages: [], productReviews: [], storeReviews: [], reviewedProducts: [],
};

test("CPF e CNPJ mascarados", () => {
  assert.equal(maskDocument("123.456.789-09"), "***.456.789-**");
  assert.equal(maskDocument("12345678000199"), "**.345.678/0001-**");
});

test("comprador: abas que se aplicam, status e pagamento em português", () => {
  const result = buildExport(base);
  const names = result.sheets.map((sheet) => sheet.name);
  assert.deepEqual(names, ["Dados pessoais", "Endereços", "Pedidos", "Itens dos pedidos", "Consentimentos"]);
  const order = result.sheets.find((sheet) => sheet.name === "Pedidos")!.rows[0];
  assert.equal(order.status, "Entregue");
  assert.equal(order.pagamento, "Pix");
  assert.equal(order.loja, "Ateliê Barro Vivo");
  assert.equal(result.sheets[0].rows[0].documento, "***.456.789-**");
});

test("sem ids internos nem segredos no resultado", () => {
  const json = JSON.stringify(exportToJson(buildExport(base)));
  for (const forbidden of ["\"u1\"", "\"o1\"", "\"c1\"", "\"s1\"", "password", "token", "12345678909"]) {
    assert.ok(!json.includes(forbidden), `não deve conter ${forbidden}`);
  }
});

test("loja ganha as abas Loja, Peças, Vendas e Repasses", () => {
  const result = buildExport({ ...base, profile: { ...base.profile, account_type: "artisan", store_name: "Loja Ana" },
    products: [{ name: "Vaso", category_id: "k1", price: 50, stock: 2, availability: "ready", active: true, created_at: "2026-10-01T00:00:00Z" }],
    categories: { k1: "Cerâmica e Barro" },
    sales: [{ order_code: "ART-0002", created_at: "2026-10-02T00:00:00Z", status: "preparing", total_amount: 50 }],
    payouts: [{ created_at: "2026-10-03T00:00:00Z", gross_amount: 50, net_amount: 45, status: "pending" }] });
  const names = result.sheets.map((sheet) => sheet.name);
  for (const name of ["Loja", "Peças", "Vendas", "Repasses"]) assert.ok(names.includes(name), name);
  assert.equal(result.sheets.find((sheet) => sheet.name === "Peças")!.rows[0].categoria, "Cerâmica e Barro");
  assert.equal(result.sheets.find((sheet) => sheet.name === "Repasses")!.rows[0].status, "Aguardando liberação");
});

test("nome do arquivo com a data de Brasília", () => {
  assert.equal(exportFileName(new Date("2026-10-31T01:30:00Z"), "xlsx"), "artenos-meus-dados-2026-10-30.xlsx");
});
