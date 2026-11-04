"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { formatDeletionDate } from "@/lib/account-deletion";
import { siteConfig } from "@/lib/site-config";

/**
 * Avisos que chegam pelo endereço depois de um redirecionamento
 * (ex.: /?conta=desativada&ate=... após pedir a exclusão da conta).
 * Mostra uma vez e limpa o endereço.
 */
export function UrlNotice() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("conta") !== "desativada") return;
    const until = url.searchParams.get("ate");
    const date = until && !Number.isNaN(Date.parse(until)) ? formatDeletionDate(until) : null;
    toast.success("Conta desativada", {
      description: `${date ? `Ela será excluída definitivamente em ${date}. ` : ""}Para reativar antes disso, envie um e-mail para ${siteConfig.supportEmail || "o atendimento da Artenós"}.`,
      duration: 12_000,
    });
    url.searchParams.delete("conta");
    url.searchParams.delete("ate");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);
  return null;
}
