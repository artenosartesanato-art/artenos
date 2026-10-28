"use client";

import {
  ChevronDown,
  Heart,
  LogOut,
  MapPin,
  Menu,
  Search,
  ShoppingBag,
  Store,
  UserRound,
} from "@/components/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { useMarketplace } from "@/components/marketplace-state";
import { Dialog } from "@/components/ui/dialog";
import { SoundToggle } from "@/components/sound-toggle";
import { accessHref } from "@/lib/navigation";
import { endSession } from "@/lib/session";
import { toast } from "sonner";
import { useHeaderSearch } from "@/components/header-search";
import { NotificationBell } from "@/components/notifications";

const NAV_LINKS = [
  { href: "/categorias", label: "Categorias" },
  { href: "/lojas", label: "Lojas" },
  { href: "/sob-encomenda", label: "Sob encomenda" },
  { href: "/favoritos", label: "Favoritos" },
  { href: "/pedidos", label: "Pedidos" },
  { href: "/mensagens", label: "Mensagens" },
];

const formatCep = (cep: string) => `${cep.slice(0, 5)}-${cep.slice(5)}`;

function CepControl({ compact = false }: { compact?: boolean }) {
  const { userId, cep, cepStatus, cepError, setGuestCep, sellerPanelAvailable } = useMarketplace();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputId = compact ? "cep-input-menu" : "cep-input";

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) {
      setError("Digite os 8 números do CEP.");
      return;
    }
    setChecking(true);
    setError("");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const address = await response.json();
      if (!response.ok || address.erro) {
        setError("CEP não encontrado. Confira os números.");
        return;
      }
      setGuestCep(digits);
      setOpen(false);
    } catch {
      setError("Não foi possível validar o CEP agora. Confira sua conexão e tente de novo.");
    } finally {
      setChecking(false);
    }
  }

  const label = cepStatus === "loading"
    ? "Carregando CEP…"
    : cepStatus === "error"
      ? "Revise seu CEP"
      : cep ? `Entregar em ${formatCep(cep)}` : "Informe seu CEP";

  return (
    <div className={`store-cep-wrap${compact ? " is-compact" : ""}`} ref={wrapRef}>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}
        aria-controls={`${inputId}-panel`} disabled={cepStatus === "loading"}>
        <MapPin size={17} />
        <span>{label}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="store-cep-popover" id={`${inputId}-panel`}>
          {userId ? (
            <>
              <strong>CEP do seu cadastro</strong>
              <p>{cepStatus === "error" ? cepError : formatCep(cep)}</p>
              <small>O frete e os prazos são calculados para este CEP.</small>
              <Link className="an-btn an-btn--secondary an-btn--sm" href={sellerPanelAvailable ? "/vendedor/perfil" : "/perfil"}>Alterar no meu perfil</Link>
            </>
          ) : (
            <form onSubmit={save} noValidate>
              <label htmlFor={inputId}>CEP para estimar entregas</label>
              <div>
                <input id={inputId} className="an-input" value={value} autoComplete="postal-code"
                  onChange={(event) => { setValue(event.target.value.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2")); setError(""); }}
                  inputMode="numeric" placeholder="00000-000" maxLength={9}
                  aria-invalid={error ? true : undefined} aria-describedby={`${inputId}-help`} />
                <button type="submit" className="an-btn an-btn--sm" disabled={checking} aria-busy={checking}>
                  {checking ? "Validando…" : "Aplicar"}
                </button>
              </div>
              <small id={`${inputId}-help`} className={error ? "is-error" : ""} role={error ? "alert" : undefined}>
                {error || "O frete é confirmado no carrinho antes da compra."}
              </small>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** Cabeçalho único do site, montado uma vez no layout raiz (SiteChrome). */
export function CustomerHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { authReady, userId, displayName, avatarUrl, sellerPanelAvailable, cartCount, cartPulse } = useMarketplace();
  const userSignedIn = authReady && !!userId;
  const [menuOpen, setMenuOpen] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const { value: search, setValue: setSearch, runHandler } = useHeaderSearch();
  const headerRef = useRef<HTMLElement>(null);

  // Publica a altura real do cabeçalho (muda com zoom, quebra de linha e
  // largura) para colunas fixas, como o menu da loja e o painel do acesso.
  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--an-header-h", `${Math.round(header.getBoundingClientRect().height)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!cartPulse) return;
    const start = window.setTimeout(() => setPulsing(true), 0);
    const stop = window.setTimeout(() => setPulsing(false), 520);
    return () => { window.clearTimeout(start); window.clearTimeout(stop); };
  }, [cartPulse]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim().slice(0, 100);
    setMenuOpen(false);
    if (!runHandler(query)) router.push(query ? `/categorias?busca=${encodeURIComponent(query)}` : "/categorias");
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // Quem tem loja edita o perfil dentro do painel, junto do menu da loja.
  const profileHref = sellerPanelAvailable ? "/vendedor/perfil" : "/perfil";
  const accountHref = userSignedIn ? profileHref : accessHref(pathname);
  const accountLabel = authReady ? (userSignedIn ? displayName || "Minha conta" : "Entrar") : "Minha conta";
  const cartLabel = `Carrinho, ${cartCount} ${cartCount === 1 ? "unidade" : "unidades"}`;

  const searchForm = (id: string) => (
    <form className="store-search" role="search" onSubmit={submit}>
      <label htmlFor={id} className="an-visually-hidden">Pesquisar peças, técnicas e lojas</label>
      <input id={id} type="search" value={search} onChange={(event) => setSearch(event.target.value)}
        placeholder="Busque peças, técnicas e lojas" maxLength={100} enterKeyHint="search" />
      <button type="submit" aria-label="Pesquisar">
        <Search size={19} />
      </button>
    </form>
  );

  return (
    <header className="store-header" ref={headerRef}>
      <a className="an-skip-link" href="#conteudo">Pular para o conteúdo</a>
      <div className="store-header-main store-container">
        <button type="button" className="an-icon-btn store-menu-button" onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu" aria-haspopup="dialog">
          <Menu size={22} />
        </button>
        <Link href="/" className="store-logo" aria-label="Artenós, página inicial">
          <BrandLogo priority />
        </Link>
        <div className="store-search-desktop">{searchForm("busca-cabecalho")}</div>
        <div className="store-header-actions">
          {sellerPanelAvailable && (
            <Link className="store-seller-switch" href="/vendedor" aria-label="Painel da loja"
              aria-current={pathname.startsWith("/vendedor") ? "page" : undefined}>
              <Store size={18} />
              <span>Painel da loja</span>
            </Link>
          )}
          {userSignedIn && <NotificationBell />}
          <Link className="store-header-link store-header-favorites" href="/favoritos" aria-label="Favoritos">
            <Heart size={21} />
          </Link>
          <Link className="store-header-link store-account" href={accountHref}
            aria-label={userSignedIn ? `Minha conta, ${displayName || "perfil"}` : "Entrar ou criar conta"}>
            {avatarUrl && userSignedIn
              // eslint-disable-next-line @next/next/no-img-element
              ? <img className="store-account-avatar" src={avatarUrl} alt="" width={30} height={30} />
              : <UserRound size={21} />}
            <span className="store-account-name">{accountLabel}</span>
          </Link>
          <Link className={`store-header-link store-cart-link${pulsing ? " is-pulsing" : ""}`}
            href="/carrinho" aria-label={cartLabel}>
            <ShoppingBag size={21} />
            {cartCount > 0 && (
              <span className="store-cart-count" aria-hidden="true">{cartCount > 99 ? "99+" : cartCount}</span>
            )}
          </Link>
        </div>
      </div>
      <div className="store-search-mobile store-container">{searchForm("busca-cabecalho-mobile")}</div>
      <nav className="store-nav store-container" aria-label="Navegação principal">
        <CepControl />
        <div className="store-nav-links">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} variant="drawer-left" label="Menu"
        className="store-menu-drawer" closeLabel="Fechar menu">
        <div className="store-menu-head">
          <BrandLogo />
        </div>
        <div className="an-drawer-body">
          <nav aria-label="Menu principal">
            <ul className="store-menu-list">
              <li><Link href="/" onClick={() => setMenuOpen(false)} aria-current={pathname === "/" ? "page" : undefined}>Início</Link></li>
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} onClick={() => setMenuOpen(false)} aria-current={isActive(link.href) ? "page" : undefined}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <li><Link href="/carrinho" onClick={() => setMenuOpen(false)}>Carrinho{cartCount > 0 ? ` (${cartCount})` : ""}</Link></li>
            </ul>
          </nav>
          <div className="store-menu-section">
            <CepControl compact />
          </div>
          <div className="store-menu-section">
            {sellerPanelAvailable && (
              <Link className="an-btn an-btn--moss an-btn--block" href="/vendedor" onClick={() => setMenuOpen(false)}>
                <Store size={18} /> Painel da loja
              </Link>
            )}
            <Link className={`an-btn an-btn--block${sellerPanelAvailable ? " an-btn--secondary" : ""}`} href={accountHref}
              onClick={() => setMenuOpen(false)}>
              <UserRound size={18} /> {userSignedIn ? "Meu perfil" : "Entrar ou criar conta"}
            </Link>
            {userSignedIn && (
              <button type="button" className="an-btn an-btn--ghost an-btn--block" onClick={async () => {
                setMenuOpen(false);
                await endSession("local");
                router.replace("/");
                toast.success("Você saiu da sua conta.");
              }}>
                <LogOut size={18} /> Sair da conta
              </button>
            )}
          </div>
          <SoundToggle className="store-menu-sound" />
        </div>
      </Dialog>
    </header>
  );
}
