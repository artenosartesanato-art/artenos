import { buildInvoiceDraft, type InvoiceContext } from "./build-draft.ts";
import { InvoiceDataError, type InvoiceProvider } from "./types.ts";

export type InvoiceJob = { order_id: string; attempts: number };
export type FinishInput = {
  orderId: string; outcome: "issued" | "processing" | "manual" | "error";
  number?: string | null; pdfUrl?: string | null; xml?: string | null; providerId?: string | null; error?: string | null; maxAttempts: number;
};
export type InvoiceDeps = {
  provider: InvoiceProvider;
  loadContext: (orderId: string) => Promise<(InvoiceContext & { order: { nf_status?: string; nf_provider_id?: string | null } }) | null>;
  finish: (input: FinishInput) => Promise<void>;
  maxAttempts?: number;
};

/** Processa um job da fila. Nunca lança: o resultado vai para finish(). */
export async function processInvoiceJob(job: InvoiceJob, deps: InvoiceDeps): Promise<FinishInput["outcome"]> {
  const maxAttempts = deps.maxAttempts ?? 5;
  const base = { orderId: job.order_id, maxAttempts };
  try {
    const context = await deps.loadContext(job.order_id);
    if (!context) throw new Error("Pedido não encontrado.");
    const previousId = context.order.nf_provider_id;
    const result = previousId && context.order.nf_status === "processando"
      ? await deps.provider.consultar(previousId)
      : await deps.provider.emitir(buildInvoiceDraft(context));
    if (result.status === "issued") {
      await deps.finish({ ...base, outcome: "issued", number: result.number, pdfUrl: result.pdfUrl, xml: result.xml, providerId: result.providerId });
    } else if (result.status === "processing") {
      await deps.finish({ ...base, outcome: "processing", providerId: result.providerId });
    } else {
      await deps.finish({ ...base, outcome: "manual", error: result.reason });
    }
    return result.status;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao emitir a nota.";
    // Dado faltando não melhora tentando de novo: vai direto para a loja resolver.
    if (error instanceof InvoiceDataError) {
      await deps.finish({ ...base, outcome: "manual", error: message });
      return "manual";
    }
    await deps.finish({ ...base, outcome: "error", error: message });
    return "error";
  }
}
