import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Recebe as violações da Content-Security-Policy em modo Report-Only (veja
// next.config.ts) e registra no log do servidor, para ajustar a política
// antes de ligar CSP_ENFORCE=true. Não grava nada no banco.
let recent = 0;
let windowStart = Date.now();

export async function POST(request: Request) {
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; recent = 0; }
  if (++recent > 60) return new NextResponse(null, { status: 204 });
  try {
    const body = (await request.json()) as { 'csp-report'?: Record<string, unknown> };
    const report = (body['csp-report'] ?? body) as Record<string, unknown>;
    console.warn('[csp]', JSON.stringify({
      directive: report['violated-directive'] ?? report['effective-directive'],
      blocked: report['blocked-uri'],
      page: report['document-uri'],
    }));
  } catch {
    // relatório malformado: ignora
  }
  return new NextResponse(null, { status: 204 });
}
