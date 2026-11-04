import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInvoiceDraft, type InvoiceContext } from "../../lib/invoices/build-draft.ts";
import { processInvoiceJob, type FinishInput } from "../../lib/invoices/process.ts";
import { FakeInvoiceProvider, ManualInvoiceProvider, invoiceProviderFromEnv } from "../../lib/invoices/providers.ts";
import { InvoiceDataError, type InvoiceProvider } from "../../lib/invoices/types.ts";

const context = (): InvoiceContext => ({
  order: { id: "o1", code: "ART-1", subtotal: 100, shipping_amount: 20, total_amount: 110, payment_reference: "mp-9",
    recipient_name: "Ana Lima", shipping_cep: "01001-000", shipping_address: "Rua C", shipping_number: "3", shipping_city: "São Paulo", shipping_state: "sp" },
  buyer: { name: "Ana Lima", document: "444.333.222-11", email: "ana@x.com" },
  seller: { person_type: "pj", document: "12.345.678/0001-90", legal_name: "Loja LTDA", tax_regime: "simples_nacional", state_registration: "ISENTO",
    municipal_registration: null, cep: "15086426", street: "Rua A", number: "1", complement: null, district: "Centro", city: "Rio Preto", state: "SP", ibge_city_code: "3549805" },
  items: [{ name: "Vaso", quantity: 2, unit_price: 50, subtotal: 100, ncm: "69139000", cfop: "6102", origin: 0 }],
});

test("mapeia pedido, loja, comprador, itens, frete e desconto", () => {
  const draft = buildInvoiceDraft(context());
  assert.equal(draft.issuer.document, "12345678000190");
  assert.equal(draft.recipient.document, "44433322211");
  assert.equal(draft.recipient.personType, "pf");
  assert.equal(draft.recipient.address.state, "SP");
  assert.equal(draft.items[0].ncm, "69139000");
  assert.equal(draft.shipping, 20);
  assert.equal(draft.discount, 10);
  assert.equal(draft.idempotencyKey, "artenos-pedido-o1");
  assert.equal(draft.paymentReference, "mp-9");
});

test("lista os dados fiscais que faltam", () => {
  const missing = context();
  missing.seller = null;
  missing.items[0].ncm = null;
  assert.throws(() => buildInvoiceDraft(missing), (error: unknown) =>
    error instanceof InvoiceDataError && /dados fiscais da loja/.test(error.message) && /NCM/.test(error.message));
});

const run = async (provider: InvoiceProvider, ctx = context()) => {
  const finished: FinishInput[] = [];
  const outcome = await processInvoiceJob({ order_id: "o1", attempts: 1 }, {
    provider, loadContext: async () => ctx, finish: async (input) => { finished.push(input); },
  });
  return { outcome, finished };
};

test("emissor de teste emite e grava número", async () => {
  const { outcome, finished } = await run(new FakeInvoiceProvider());
  assert.equal(outcome, "issued");
  assert.equal(finished[0].outcome, "issued");
  assert.equal(finished[0].providerId, "fake-artenos-pedido-o1");
});

test("modo manual deixa o pedido aguardando a loja", async () => {
  const { finished } = await run(new ManualInvoiceProvider());
  assert.equal(finished[0].outcome, "manual");
});

test("falha do emissor agenda retentativa; dado faltando não", async () => {
  const failing: InvoiceProvider = {
    name: "falho",
    emitir: async () => { throw new Error("timeout"); },
    consultar: async () => { throw new Error("timeout"); },
    cancelar: async () => undefined,
  };
  assert.equal((await run(failing)).finished[0].outcome, "error");
  const ctx = context();
  ctx.items[0].cfop = null;
  assert.equal((await run(failing, ctx)).finished[0].outcome, "manual");
});

test("emissor escolhido pela variável de ambiente", () => {
  assert.equal(invoiceProviderFromEnv({}), null);
  assert.equal(invoiceProviderFromEnv({ INVOICE_PROVIDER: "manual" })?.name, "manual");
  assert.equal(invoiceProviderFromEnv({ INVOICE_PROVIDER: "fake" })?.name, "fake");
});
