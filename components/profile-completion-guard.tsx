"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMarketplace } from "@/components/marketplace-state";

/** Telas que uma conta com cadastro incompleto pode abrir. */
const OPEN_PATHS = ["/concluir-cadastro", "/acesso", "/termos", "/privacidade", "/redefinir-senha"];

export function allowedWhileIncomplete(pathname: string) {
  return OPEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Conta conectada sem profile (Google sem cadastro concluído) não usa a
 * plataforma: qualquer outra página leva para a conclusão do cadastro. O banco
 * também recusa carrinho, pedidos e mensagens de quem não tem profile.
 */
export function ProfileCompletionGuard() {
  const { profileMissing } = useMarketplace();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!profileMissing || allowedWhileIncomplete(pathname)) return;
    const back = pathname === "/" ? "" : `?voltar=${encodeURIComponent(pathname + window.location.search)}`;
    router.replace(`/concluir-cadastro${back}`);
  }, [pathname, profileMissing, router]);
  return null;
}
