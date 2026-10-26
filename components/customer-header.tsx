"use client";

import {
  ChevronDown,
  MapPin,
  Menu,
  Search,
  ShoppingBag,
  Store,
  UserRound,
} from "@/components/icons";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { useMarketplace } from "@/components/marketplace-state";

export function CustomerHeader({
  cep,
  cepStatus,
  cepError,
  cepOpen,
  cepInput,
  searchInput,
  onSearchInput,
  onSearch,
  onToggleCep,
  onCepInput,
  onSaveCep,
}: {
  userSignedIn: boolean;
  cep: string;
  cepStatus: "loading" | "guest" | "account" | "error";
  cepError: string;
  cepOpen: boolean;
  cepInput: string;
  searchInput: string;
  onSearchInput: (value: string) => void;
  onSearch: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleCep: () => void;
  onCepInput: (value: string) => void;
  onSaveCep: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const { authReady, userId, displayName, avatarUrl, sellerPanelAvailable, cartCount } = useMarketplace();
  const userSignedIn = authReady && !!userId;

  const cepLabel =
    cepStatus === "loading"
      ? "Carregando CEP..."
      : cepStatus === "error"
        ? "CEP cadastrado indisponível"
        : cep
          ? `Enviar para ${cep.slice(0, 5)}-${cep.slice(5)}`
          : "Informe seu CEP";
  return (
    <header className="store-header">
      <div className="store-header-main store-container">
        <Link href="/" className="store-logo" aria-label="Artenós, início">
          <BrandLogo priority />
        </Link>
        <form className="store-search" role="search" onSubmit={onSearch}>
          <input
            value={searchInput}
            onChange={(event) => onSearchInput(event.target.value)}
            placeholder="Busque peças, técnicas e lojas"
            aria-label="Pesquisar produtos"
            maxLength={100}
          />
          <button type="submit" aria-label="Pesquisar">
            <Search size={20} />
          </button>
        </form>
        <div className="store-header-actions">
          {sellerPanelAvailable && (
            <Link
              className="store-seller-switch"
              href="/vendedor"
              title="Abrir o painel da sua loja"
            >
              <Store size={20} />
              <span>Painel da loja</span>
            </Link>
          )}
          <div className="store-account">
            <Link
              href={userSignedIn ? "/perfil" : "/acesso"}
              title={userSignedIn ? `Perfil de ${displayName || "usuário"}` : "Entrar ou cadastrar"}
            >
              {avatarUrl && userSignedIn ? <img className="store-account-avatar" src={avatarUrl} alt="" /> : <UserRound size={22} />}
              <span>{authReady ? (userSignedIn ? displayName || "Minha conta" : "Entrar ou cadastrar") : "Minha conta"}</span>
            </Link>
          </div>
          <Link
            className="store-cart-link"
            href={userSignedIn ? "/carrinho" : "/acesso"}
            title={
              userSignedIn ? "Abrir carrinho" : "Entre para acessar o carrinho"
            }
            aria-label={
              userSignedIn
                ? `Abrir carrinho, ${cartCount} ${cartCount === 1 ? "unidade" : "unidades"}`
                : "Entrar para acessar o carrinho"
            }
          >
            <ShoppingBag size={22} />
            {userSignedIn && cartCount > 0 && (
              <span className="store-cart-count" aria-hidden="true">{cartCount > 99 ? "99+" : cartCount}</span>
            )}
          </Link>
        </div>
      </div>
      <nav
        className="store-nav store-container"
        aria-label="Navegação principal"
      >
        <div className="store-cep-wrap">
          <button
            type="button"
            onClick={onToggleCep}
            aria-expanded={cepOpen}
            disabled={cepStatus === "loading"}
          >
            <MapPin size={17} />
            <span>{cepLabel}</span>
            <ChevronDown size={14} />
          </button>
          {cepOpen &&
            (userSignedIn ? (
              <div className="store-cep-popover">
                <strong>CEP do seu cadastro</strong>
                <p>
                  {cepStatus === "error"
                    ? cepError
                    : `${cep.slice(0, 5)}-${cep.slice(5)}`}
                </p>
                <small>
                  {cepStatus === "account"
                    ? "Este CEP foi carregado do seu perfil no Supabase."
                    : "Recarregue a página depois de corrigir o cadastro."}
                </small>
              </div>
            ) : (
              <form className="store-cep-popover" onSubmit={onSaveCep}>
                <label htmlFor="store-cep-input">CEP para sua região</label>
                <div>
                  <input
                    id="store-cep-input"
                    value={cepInput}
                    onChange={(event) => onCepInput(event.target.value)}
                    inputMode="numeric"
                    placeholder="00000-000"
                    maxLength={9}
                  />
                  <button type="submit">Aplicar</button>
                </div>
                <small>O frete é confirmado no carrinho antes da compra.</small>
              </form>
            ))}
        </div>
        <div className="store-nav-links">
          <Link href="/categorias">Categorias</Link>
          <Link href="/lojas">Lojas</Link>
          <Link href="/sob-encomenda">Sob encomenda</Link>
          <Link href="/favoritos">Favoritos</Link>
          <Link href="/pedidos">Pedidos</Link>
          <Link href="/mensagens">Mensagens</Link>
        </div>
        <Menu className="store-mobile-menu" size={19} />
      </nav>
    </header>
  );
}
