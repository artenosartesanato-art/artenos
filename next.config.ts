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

const nextConfig: NextConfig = {
  // Payment routes and webhooks require the Next.js server (Vercel / next start).
  agentRules: false,
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
