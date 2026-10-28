// Quais imagens passam pelo otimizador do Next.js (redimensiona por tela,
// converte para AVIF/WebP e guarda em cache). Só as do Storage do próprio
// projeto Supabase: qualquer outro endereço segue direto, sem otimização,
// para nunca quebrar uma imagem antiga cadastrada com outro host.

export const STORAGE_PUBLIC_PATH = "/storage/v1/object/public/";

export function supabaseImageHost(url = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    return url ? new URL(url) : null;
  } catch {
    return null;
  }
}

export function canOptimize(src: string | null | undefined, base = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (!src || process.env.NEXT_PUBLIC_IMAGE_OPTIMIZATION === "off") return false;
  const host = supabaseImageHost(base);
  if (!host) return false;
  try {
    const url = new URL(src);
    return url.origin === host.origin && url.pathname.startsWith(STORAGE_PUBLIC_PATH);
  } catch {
    return false; // blob:, data:, caminhos relativos
  }
}
