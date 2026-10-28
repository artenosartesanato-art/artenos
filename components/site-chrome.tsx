"use client";

import "@/app/storefront.css";
import { CustomerFooter } from "@/components/customer-footer";
import { CustomerHeader } from "@/components/customer-header";
import { HeaderSearchProvider } from "@/components/header-search";

/** Cabeçalho e rodapé únicos para todas as páginas (vitrine, conta, painel da loja e administração). */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <HeaderSearchProvider>
      <div className="site-shell">
        <CustomerHeader />
        <div className="site-body">{children}</div>
        <CustomerFooter />
      </div>
    </HeaderSearchProvider>
  );
}
