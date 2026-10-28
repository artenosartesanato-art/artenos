"use client";

import "@/app/storefront.css";
import { CustomerFooter } from "@/components/customer-footer";
import { CustomerHeader } from "@/components/customer-header";
import { HeaderSearchProvider } from "@/components/header-search";
import { NotificationsProvider } from "@/components/notifications";
import { SessionGuard } from "@/components/session-guard";

/** Cabeçalho e rodapé únicos para todas as páginas (vitrine, conta, painel da loja e administração). */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <HeaderSearchProvider>
      <NotificationsProvider>
        <div className="an-site">
          <CustomerHeader />
          <div className="an-site-body">{children}</div>
          <CustomerFooter />
        </div>
        <SessionGuard />
      </NotificationsProvider>
    </HeaderSearchProvider>
  );
}
