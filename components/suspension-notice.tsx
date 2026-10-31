"use client";

import Link from "next/link";
import { CircleSlash2 } from "@/components/icons";
import { useMarketplace } from "@/components/marketplace-state";
import { isSuspended, suspensionLimits, suspensionTitle } from "@/lib/suspension";

/**
 * Faixa no topo de todas as telas enquanto a conta está suspensa. O texto
 * muda para cliente (navega, mas não compra) e para loja (fora da vitrine).
 */
export function SuspensionNotice() {
  const { suspendedUntil, isAdmin, accountType } = useMarketplace();
  if (isAdmin || !isSuspended(suspendedUntil)) return null;
  return (
    <div className="suspension-notice" role="status">
      <CircleSlash2 size={18} aria-hidden="true" />
      <p>
        <strong>{suspensionTitle(suspendedUntil, accountType)}</strong>{" "}
        {suspensionLimits(accountType)}{" "}
        <Link href="/ajuda">Dúvidas? Fale com a Artenós</Link>
      </p>
    </div>
  );
}
