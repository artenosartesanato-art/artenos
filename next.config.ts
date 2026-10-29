import type { NextConfig } from "next";

// Imagens do Storage do Supabase passam pelo otimizador do Next.js
// (components/optimized-image.tsx). O host vem da variável pública do projeto.
const supabase = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
  } catch {
    return null;
  }
})();
const localSupabase = Boolean(supabase && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(supabase.hostname));

// Cabeçalhos de segurança em todas as respostas. Sem CSP completa de scripts
// para não quebrar o pagamento (Mercado Pago); só diretivas sem esse risco.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  // Payment routes and webhooks require the Next.js server (Vercel / next start).
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // A antiga tela "Sob encomenda" virou o filtro da listagem; orçamentos ficam na página de cada loja.
  async redirects() {
    return [{ source: "/sob-encomenda", destination: "/categorias?encomenda=1", permanent: true }];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // Menos larguras = menos versões geradas (custo e cache) sem perder nitidez.
    deviceSizes: [360, 480, 640, 828, 1080, 1280, 1600],
    imageSizes: [48, 96, 128, 256],
    qualities: [70, 80],
    // Fotos de peças mudam pouco; um mês de cache evita reprocessar.
    minimumCacheTTL: 60 * 60 * 24 * 31,
    remotePatterns: supabase
      ? [{
          protocol: supabase.protocol.replace(":", "") as "http" | "https",
          hostname: supabase.hostname,
          port: supabase.port,
          pathname: "/storage/v1/object/public/**",
        }]
      : [],
    // Só para o Supabase local de testes (127.0.0.1); em produção fica desligado.
    dangerouslyAllowLocalIP: localSupabase,
  },
};

export default nextConfig;
