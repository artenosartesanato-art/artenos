// Camada de nota fiscal independente do emissor. A Artenós monta o rascunho a
// partir do pedido (build-draft.ts) e um InvoiceProvider emite, consulta e
// cancela. O Mercado Pago não publica API de emissão de NF-e/NFS-e: a emissão
// automática exige um emissor integrado (ex.: NFe.io, Focus NFe, PlugNotas),
// que deve implementar esta interface sem alterar o restante do fluxo.

export type TaxRegime = "mei" | "simples_nacional" | "lucro_presumido" | "lucro_real" | "pessoa_fisica";

export type InvoiceParty = {
  name: string;
  document: string;
  personType: "pf" | "pj";
  email?: string | null;
  address: { cep: string; street: string; number: string; complement?: string | null; district?: string | null; city: string; state: string; ibgeCityCode?: string | null };
};

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  ncm: string;
  cfop: string;
  origin: number;
};

export type InvoiceDraft = {
  orderId: string;
  orderCode: string | null;
  /** Chave de idempotência enviada ao emissor: uma nota por pedido. */
  idempotencyKey: string;
  kind: "nfe";
  issuer: InvoiceParty & { taxRegime: TaxRegime; stateRegistration?: string | null; municipalRegistration?: string | null };
  recipient: InvoiceParty;
  items: InvoiceItem[];
  shipping: number;
  discount: number;
  total: number;
  paymentReference: string | null;
};

export type InvoiceResult =
  | { status: "issued"; number: string; pdfUrl: string | null; xml: string | null; providerId: string }
  | { status: "processing"; providerId: string }
  | { status: "manual"; reason: string };

export interface InvoiceProvider {
  readonly name: string;
  emitir(draft: InvoiceDraft): Promise<InvoiceResult>;
  consultar(providerId: string): Promise<InvoiceResult>;
  cancelar(providerId: string, reason: string): Promise<void>;
}

/** Erro que não adianta tentar de novo (dados fiscais faltando etc.). */
export class InvoiceDataError extends Error {}
