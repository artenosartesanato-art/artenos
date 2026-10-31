"use client";

import Link from "next/link";
import { CircleSlash2 } from "@/components/icons";
import { useMarketplace } from "@/components/marketplace-state";
import { formatSuspensionEnd, isSuspended } from "@/lib/suspension";

/**
 * Faixa no topo de todas as telas enquanto a conta está suspensa: a pessoa
 * navega, mas não compra, não favorita e não envia mensagens.
 */
export function SuspensionNotice() {
  const { suspendedUntil, isAdmin } = useMarketplace();
  if (isAdmin || !isSuspended(suspendedUntil)) return null;
  return (
    <div className="suspension-notice" role="status">
      <CircleSlash2 size={18} aria-hidden="true" />
      <p>
        <strong>Sua conta está suspensa até {formatSuspensionEnd(suspendedUntil!)}.</strong>{" "}
        Você pode navegar pela Artenós, mas não pode comprar, favoritar, enviar mensagens nem alterar sua loja.{" "}
        <Link href="/ajuda">Dúvidas? Fale com a Artenós</Link>
      </p>
    </div>
  );
}
