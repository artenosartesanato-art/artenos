"use client";

import "@/app/storefront.css";
import { usePathname } from "next/navigation";
import { CustomerFooter } from "@/components/customer-footer";
import { CustomerHeader } from "@/components/customer-header";
import { HeaderSearchProvider } from "@/components/header-search";
import { NotificationsProvider } from "@/components/notifications";
import { SessionGuard } from "@/components/session-guard";
import { UrlNotice } from "@/components/url-notice";

/** Cabeçalho e rodapé únicos para todas as páginas (vitrine, conta, painel da loja e administração). */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  // Entrar/cadastrar ocupa a tela toda: sem rodapé.
  const withFooter = usePathname() !== "/acesso";
  return (
    <HeaderSearchProvider>
      <NotificationsProvider>
        <div className="an-site">
          <CustomerHeader />
          <div className="an-site-body">{children}</div>
          {withFooter && <CustomerFooter />}
        </div>
        <SessionGuard />
        <UrlNotice />
      </NotificationsProvider>
    </HeaderSearchProvider>
  );
}
