"use client";

import { MessagesWorkspace } from "@/components/messages-workspace";
import { useMarketplace } from "@/components/marketplace-state";
import { messagesHref } from "@/lib/navigation";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import "../storefront.css";
import "./messages.css";

function Loading() {
  return <main className="store-container messages-main">Carregando mensagens...</main>;
}

/**
 * Tela de mensagens de quem compra. Quem tem loja aprovada usa só a tela do
 * painel: qualquer link para cá (avisos, e-mails, links antigos) segue para
 * /vendedor/mensagens com os mesmos parâmetros (conversa, produto).
 */
function ClientMessages() {
  const router = useRouter();
  const { authReady, userId, accountType, sellerPanelAvailable } = useMarketplace();
  // O perfil chega logo depois da sessão; se demorar, mostra a tela normal.
  const [waitedProfile, setWaitedProfile] = useState(false);
  const profilePending = authReady && Boolean(userId) && accountType === null && !waitedProfile;

  useEffect(() => {
    if (!sellerPanelAvailable) return;
    router.replace(messagesHref(true, window.location.search));
  }, [router, sellerPanelAvailable]);

  useEffect(() => {
    if (!profilePending) return;
    const timer = window.setTimeout(() => setWaitedProfile(true), 4000);
    return () => window.clearTimeout(timer);
  }, [profilePending]);

  if (!authReady || profilePending || sellerPanelAvailable) return <Loading />;
  return <MessagesWorkspace />;
}

export default function MensagensPage() {
  return <Suspense fallback={<Loading />}>
    <ClientMessages />
  </Suspense>;
}
