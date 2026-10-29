import type { InvoiceDraft, InvoiceProvider, InvoiceResult } from "./types.ts";

/**
 * Padrão enquanto não há emissor integrado: valida o rascunho e deixa o pedido
 * "aguardando loja". A loja emite a nota no próprio sistema (ou no Sistema de
 * Gestão do Mercado Pago) e informa número e link ao atualizar o pedido em Vendas.
 */
export class ManualInvoiceProvider implements InvoiceProvider {
  readonly name = "manual";
  async emitir(draft: InvoiceDraft): Promise<InvoiceResult> {
    return { status: "manual", reason: `Emitir a NF-e do pedido ${draft.orderCode ?? draft.orderId} e informar em Vendas.` };
  }
  async consultar(): Promise<InvoiceResult> {
    return { status: "manual", reason: "Emissão manual pela loja." };
  }
  async cancelar(): Promise<void> {
    throw new Error("Cancele a nota no sistema em que ela foi emitida.");
  }
}

/** Emissor de mentira para sandbox e testes: "emite" na hora, sem chamar ninguém. */
export class FakeInvoiceProvider implements InvoiceProvider {
  readonly name = "fake";
  readonly issued = new Map<string, InvoiceDraft>();
  async emitir(draft: InvoiceDraft): Promise<InvoiceResult> {
    const providerId = `fake-${draft.idempotencyKey}`;
    this.issued.set(providerId, draft);
    return { status: "issued", number: String(this.issued.size).padStart(6, "0"), pdfUrl: null, xml: null, providerId };
  }
  async consultar(providerId: string): Promise<InvoiceResult> {
    return this.issued.has(providerId)
      ? { status: "issued", number: providerId, pdfUrl: null, xml: null, providerId }
      : { status: "manual", reason: "Nota de teste não encontrada." };
  }
  async cancelar(providerId: string): Promise<void> {
    this.issued.delete(providerId);
  }
}

/** Escolhe o emissor por INVOICE_PROVIDER (manual | fake). Novos emissores entram aqui. */
export function invoiceProviderFromEnv(env: Record<string, string | undefined> = process.env): InvoiceProvider | null {
  const name = (env.INVOICE_PROVIDER ?? "off").toLowerCase();
  if (name === "manual") return new ManualInvoiceProvider();
  if (name === "fake") return new FakeInvoiceProvider();
  return null;
}
