import Link from "next/link";
import type { Metadata } from "next";
import { CustomerHeader } from "@/components/customer-header";
import { CustomerFooter } from "@/components/customer-footer";
import { PackageOpen } from "@/components/icons";
import "./storefront.css";

export const metadata: Metadata = { title: "Página não encontrada | Artenós" };

export default function NotFound() {
  return (
    <div className="store-page">
      <CustomerHeader />
      <main id="conteudo" tabIndex={-1} className="store-container">
        <section className="an-state an-state--page">
          <PackageOpen size={40} />
          <p className="store-eyebrow">Erro 404</p>
          <h1>Não encontramos esta página</h1>
          <p>O endereço pode ter mudado ou a peça não está mais publicada. Que tal continuar pela vitrine?</p>
          <div className="an-state-actions">
            <Link className="an-btn" href="/">Ir para a página inicial</Link>
            <Link className="an-btn an-btn--secondary" href="/categorias">Explorar peças</Link>
          </div>
        </section>
      </main>
      <CustomerFooter />
    </div>
  );
}
