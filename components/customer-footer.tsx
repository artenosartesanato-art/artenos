"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { useMarketplace } from "@/components/marketplace-state";
import { SoundToggle } from "@/components/sound-toggle";
import { messagesHref } from "@/lib/navigation";
import { formatPhone, siteConfig } from "@/lib/site-config";
import { openCookiePreferences } from "@/lib/cookie-consent";

/** As props antigas continuam aceitas, mas o estado vem do MarketplaceProvider. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CustomerFooter(_props: { userSignedIn?: boolean; authLoading?: boolean } = {}) {
  const { authReady, userId, sellerPanelAvailable } = useMarketplace();
  return (
    <footer className="store-footer">
      <div className="store-container store-footer-grid">
        <div>
          <Link href="/" className="store-logo" aria-label="Artenós, página inicial">
            <BrandLogo variant="perola" />
          </Link>
          <p>Um espaço para descobrir o valor de cada história feita à mão — e de quem faz.</p>
          <SoundToggle className="store-footer-sound" />
        </div>
        <div>
          <h2>Explore</h2>
          <Link href="/">Início</Link>
          <Link href="/categorias">Categorias</Link>
          <Link href="/lojas">Lojas e artesãs</Link>
          <Link href="/categorias?encomenda=1">Sob encomenda</Link>
          <Link href="/como-funciona">Como funciona</Link>
          {!sellerPanelAvailable && <Link href="/como-funciona#vender">Venda na Artenós</Link>}
        </div>
        <div>
          <h2>Sua conta</h2>
          {!authReady ? (
            <span aria-live="polite">Verificando sua conta…</span>
          ) : userId ? (
            <Link href={sellerPanelAvailable ? "/vendedor" : "/perfil"}>{sellerPanelAvailable ? "Painel da loja" : "Meu perfil"}</Link>
          ) : (
            <Link href="/acesso">Entrar ou cadastrar</Link>
          )}
          <Link href="/favoritos">Favoritos</Link>
          <Link href="/pedidos">Pedidos</Link>
          <Link href={messagesHref(sellerPanelAvailable)}>Mensagens</Link>
        </div>
        <div>
          <h2>Informações</h2>
          <Link href="/ajuda">Central de Ajuda</Link>
          <Link href="/termos">Termos de Uso</Link>
          <Link href="/privacidade">Privacidade</Link>
          <button type="button" className="store-footer-link-button" onClick={openCookiePreferences}>Preferências de cookies</button>
          {siteConfig.supportEmail && <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>}
          {siteConfig.supportPhone && <a href={`tel:+55${siteConfig.supportPhone.replace(/\D/g, "").replace(/^55/, "")}`}>{formatPhone(siteConfig.supportPhone)}</a>}
          {!userId && <Link href="/acesso">Venda na Artenós</Link>}
        </div>
      </div>
      <div className="store-container store-footer-bottom">
        <span>© {new Date().getFullYear()} Artenós. Feito com cuidado.</span>
        <span>
          Desenvolvido por{" "}
          <a href="https://cmkcogit.com.br" target="_blank" rel="noopener noreferrer">
            CMK Cogit<span className="an-visually-hidden"> (abre em nova aba)</span>
          </a>
        </span>
      </div>
    </footer>
  );
}
