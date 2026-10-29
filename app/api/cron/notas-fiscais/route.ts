import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';
import { invoiceProviderFromEnv } from '../../../../lib/invoices/providers';
import { processInvoiceJob, type InvoiceJob } from '../../../../lib/invoices/process';
import type { InvoiceContext } from '../../../../lib/invoices/build-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Processa a fila de notas fiscais (invoice_jobs), alimentada quando o
// pagamento é confirmado pelo webhook do Mercado Pago. Rode a cada 10–15 min.
// Emissor: INVOICE_PROVIDER = off (padrão) | manual | fake.
// Authorization: Bearer <CRON_SECRET>.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const provider = invoiceProviderFromEnv();
  if (!provider) return NextResponse.json({ skipped: 'INVOICE_PROVIDER=off' });

  const admin = getSupabaseAdmin();
  const { data: jobs, error } = await admin.rpc('claim_invoice_jobs', { p_limit: 20 });
  if (error) {
    console.error('[notas-fiscais]', error.message);
    return NextResponse.json({ error: 'Falha ao ler a fila.' }, { status: 500 });
  }
  const summary: Record<string, number> = {};
  for (const job of (jobs ?? []) as InvoiceJob[]) {
    const outcome = await processInvoiceJob(job, {
      provider,
      loadContext: async (orderId) => {
        const { data, error: contextError } = await admin.rpc('invoice_context', { p_order_id: orderId });
        if (contextError) throw new Error(contextError.message);
        return data as InvoiceContext | null;
      },
      finish: async (input) => {
        const { error: finishError } = await admin.rpc('finish_invoice_job', {
          p_order_id: input.orderId, p_outcome: input.outcome, p_number: input.number ?? null, p_pdf_url: input.pdfUrl ?? null,
          p_xml: input.xml ?? null, p_provider_id: input.providerId ?? null, p_error: input.error ?? null, p_max_attempts: input.maxAttempts,
        });
        if (finishError) console.error('[notas-fiscais] status não gravado:', finishError.message);
      },
    });
    summary[outcome] = (summary[outcome] ?? 0) + 1;
  }
  return NextResponse.json({ provider: provider.name, processed: (jobs ?? []).length, summary });
}

export const GET = handle;
export const POST = handle;
