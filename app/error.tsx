"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "@/components/icons";
import "./storefront.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Erro inesperado na interface", error.digest ?? error.message);
  }, [error]);

  return (
    <main id="conteudo" className="store-page store-container">
      <section className="an-state an-state--page" role="alert">
        <AlertTriangle size={40} />
        <h1>Algo não saiu como esperado</h1>
        <p>Não foi possível exibir esta tela. Seus dados, carrinho e pedidos continuam salvos.</p>
        <div className="an-state-actions">
          <button type="button" className="an-btn" onClick={reset}><RefreshCw size={15} /> Tentar novamente</button>
          <Link className="an-btn an-btn--secondary" href="/">Voltar ao início</Link>
        </div>
      </section>
    </main>
  );
}
