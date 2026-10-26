"use client";

import {
  Calculator,
  ChevronDown,
  Heart,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  Menu,
  PackageCheck,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
  UserRound,
  X,
} from "@/components/icons";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { useMarketplace } from "@/components/marketplace-state";

export type SellerProfile = {
  id: string;
  full_name: string;
  email: string | null;
  store_name: string | null;
  specialty: string | null;
  cep: string;
  account_type: "client" | "artisan";
  approval_status: "active" | "pending_review" | "assisted_review";
};

type SellerContextValue = {
  profile: SellerProfile;
  updateProfile: (
    patch: Partial<Pick<SellerProfile, "store_name" | "specialty">>,
  ) => void;
};

const SellerContext = createContext<SellerContextValue | null>(null);

export function useSellerProfile() {
  const context = useContext(SellerContext);
  return context?.profile ?? null;
}

export function useSellerProfileActions() {
  const context = useContext(SellerContext);
  return context?.updateProfile ?? (() => undefined);
}

const managementLinks = [
  { label: "Visão geral", href: "/vendedor", icon: LayoutDashboard },
  { label: "Minha loja", href: "/vendedor/minha-loja", icon: Store },
  { label: "Meu perfil", href: "/vendedor/perfil", icon: UserRound },
  { label: "Catálogo", href: "/vendedor/catalogo", icon: Tags },
  {
    label: "Precificação",
    href: "/vendedor/precificacao",
    icon: Calculator,
  },
  { label: "Encomendas", href: "/vendedor/encomendas", icon: PackageCheck },
  { label: "Vendas", href: "/vendedor/vendas", icon: ShoppingBag },
  { label: "Repasses", href: "/vendedor/repasses", icon: ShoppingBag },
  { label: "Mensagens", href: "/vendedor/mensagens", icon: Mail },
];

const purchaseLinks = [
  { label: "Comprar na Artenós", href: "/", icon: Sparkles },
  { label: "Favoritos", href: "/favoritos", icon: Heart },
  { label: "Carrinho", href: "/carrinho", icon: ShoppingBag },
  { label: "Minhas compras", href: "/pedidos", icon: ShoppingBag },
];

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 8
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : "CEP indisponível";
}

function SellerNavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: (typeof managementLinks)[number] | (typeof purchaseLinks)[number];
  pathname: string;
  onNavigate: () => void;
}) {
  const { cartCount } = useMarketplace();
  const Icon = item.icon;
  if (!item.href) {
    return (
      <span
        className="seller-nav-link is-disabled"
        aria-disabled="true"
        title="Esta página será criada na próxima etapa"
      >
        <Icon size={18} />
        <span>{item.label}</span>
        <small>Em breve</small>
      </span>
    );
  }
  const active =
    item.href === "/vendedor"
      ? pathname === item.href
      : pathname.startsWith(item.href);
  return (
    <Link
      className={`seller-nav-link${active ? " is-active" : ""}`}
      href={item.href}
      onClick={onNavigate}
      aria-label={item.href === "/carrinho" ? `Carrinho, ${cartCount} ${cartCount === 1 ? "unidade" : "unidades"}` : undefined}
    >
      <Icon size={18} />
      <span>{item.label}</span>
      {item.href === "/carrinho" && cartCount > 0 && <small className="seller-cart-count" aria-hidden="true">{cartCount > 99 ? "99+" : cartCount}</small>}
    </Link>
  );
}

export function SellerShell({ children }: { children: React.ReactNode }) {
  const { avatarUrl } = useMarketplace();
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [screen, setScreen] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showApprovalWelcome, setShowApprovalWelcome] = useState(false);

  useEffect(() => {
    let active = true;

    async function authorize() {
      try {
        const supabase = getSupabase();
        const { data: authData, error: authError } =
          await supabase.auth.getUser();
        if (!active) return;
        if (authError || !authData.user) {
          router.replace("/acesso");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id,full_name,email,store_name,specialty,cep,account_type,approval_status",
          )
          .eq("id", authData.user.id)
          .single();
        if (!active) return;
        if (error || !data) {
          setScreen("error");
          return;
        }

        const currentProfile = data as SellerProfile;
        if (currentProfile.account_type !== "artisan") {
          router.replace("/");
          return;
        }
        if (currentProfile.approval_status !== "active") {
          router.replace("/cadastro-em-analise");
          return;
        }

        setProfile(currentProfile);
        setScreen("ready");
        const { data: firstVisit } = await supabase.rpc("claim_artisan_approval_welcome");
        if (active && firstVisit === true) setShowApprovalWelcome(true);
      } catch {
        if (active) setScreen("error");
      }
    }

    void authorize();
    const { data: listener } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/acesso");
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    queueMicrotask(() => {
      setMenuOpen(false);
      setAccountOpen(false);
    });
  }, [pathname]);

  const avatar = avatarUrl
    ? <img className="seller-avatar" src={avatarUrl} alt="" />
    : <span className="seller-avatar"><UserRound size={20} /></span>;

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim().slice(0, 100);
    router.push(
      query ? `/categorias?busca=${encodeURIComponent(query)}` : "/categorias",
    );
  }

  async function signOut() {
    const { error } = await getSupabase().auth.signOut();
    if (error) {
      toast.error("Não foi possível sair da conta agora.");
      return;
    }
    router.replace("/acesso");
  }

  function updateProfile(
    patch: Partial<Pick<SellerProfile, "store_name" | "specialty">>,
  ) {
    setProfile((previous) => (previous ? { ...previous, ...patch } : previous));
  }

  if (screen === "loading") {
    return (
      <main className="seller-gate" role="status">
        <LoaderCircle className="seller-spin" size={30} />
        <strong>Preparando o painel da sua loja...</strong>
        <span>Estamos verificando sua aprovação no Supabase.</span>
      </main>
    );
  }

  if (screen === "error" || !profile) {
    return (
      <main className="seller-gate">
        <Store size={34} />
        <h1>Não foi possível abrir sua loja</h1>
        <p>
          Não conseguimos consultar seu perfil no Supabase. Recarregue a página
          e tente novamente.
        </p>
        <div>
          <button type="button" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
          <Link href="/">Voltar para a vitrine</Link>
        </div>
      </main>
    );
  }

  return (
    <SellerContext.Provider value={{ profile, updateProfile }}>
      <div className="seller-shell">
        <header className="seller-header">
          <div className="seller-header-main seller-container">
            <Link
              href="/vendedor"
              className="seller-logo"
              aria-label="Artenós, painel da loja"
            >
              <BrandLogo priority />
            </Link>
            <form
              className="seller-search"
              role="search"
              onSubmit={submitSearch}
            >
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Busque peças para comprar"
                aria-label="Pesquisar na Artenós"
                maxLength={100}
              />
              <button type="submit" aria-label="Pesquisar">
                <Search size={20} />
              </button>
            </form>
            <div className="seller-account-wrap">
              <button
                className="seller-account-button"
                type="button"
                onClick={() => setAccountOpen((value) => !value)}
                aria-expanded={accountOpen}
              >
                {avatar}
                <span>
                  <small>{profile.store_name || "Minha loja"}</small>
                  <strong>{profile.full_name}</strong>
                </span>
                <ChevronDown size={15} />
              </button>
              {accountOpen && (
                <div className="seller-account-menu">
                  <Link href="/vendedor/perfil">
                    <UserRound size={17} /> Meu perfil
                  </Link>
                  <span aria-disabled="true">
                    <Settings size={17} /> Configurações <small>Em breve</small>
                  </span>
                  <button type="button" onClick={signOut}>
                    <LogOut size={17} /> Sair
                  </button>
                </div>
              )}
            </div>
            <button
              className="seller-menu-button"
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={23} />
            </button>
          </div>
          <div className="seller-location-row seller-container">
            <MapPin size={16} />
            <span>
              Loja vinculada ao CEP <strong>{formatCep(profile.cep)}</strong>
            </span>
            <Link className="seller-market-link" href="/" aria-label="Ver vitrine Artenós">
              <Sparkles size={17} /> <span>Ver vitrine</span>
            </Link>
          </div>
        </header>

        <div className="seller-body seller-container">
          <aside
            className={`seller-sidebar${menuOpen ? " is-open" : ""}`}
            aria-label="Menu do vendedor"
          >
            <div className="seller-mobile-nav-heading">
              <strong>Menu da loja</strong>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
              >
                <X size={21} />
              </button>
            </div>
            <nav>
              <p>Gestão da loja</p>
              {managementLinks.map((item) => (
                <SellerNavLink
                  key={item.label}
                  item={item}
                  pathname={pathname}
                  onNavigate={() => setMenuOpen(false)}
                />
              ))}
            </nav>
            <nav>
              <p>Também quero comprar</p>
              {purchaseLinks.map((item) => (
                <SellerNavLink
                  key={item.label}
                  item={item}
                  pathname={pathname}
                  onNavigate={() => setMenuOpen(false)}
                />
              ))}
            </nav>
            <div className="seller-sidebar-profile">
              {avatar}
              <div>
                <strong>{profile.full_name}</strong>
                <small>{profile.specialty || "Artesanato autoral"}</small>
              </div>
            </div>
          </aside>
          {menuOpen && (
            <button
              className="seller-sidebar-backdrop"
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Fechar menu"
            />
          )}
          <main className="seller-content">{children}</main>
        </div>

        <footer className="seller-footer">
          <div className="seller-container">
            <div>
              <strong>Artenós para artesãs</strong>
              <span>
                Gestão da sua loja e acesso ao marketplace em um só lugar.
              </span>
            </div>
            <nav aria-label="Links do rodapé">
              <Link href="/termos">Termos de Uso</Link>
              <Link href="/privacidade">Privacidade</Link>
              <Link href="/vendedor/mensagens">Mensagens</Link>
              <Link href="/vendedor/perfil">Perfil</Link>
            </nav>
            <small>© {new Date().getFullYear()} Artenós.</small>
          </div>
        </footer>
      </div>
      {showApprovalWelcome && (
        <div className="seller-approval-overlay" role="presentation">
          <section className="seller-approval-dialog" role="dialog" aria-modal="true" aria-labelledby="seller-approval-title">
            <Sparkles size={38} aria-hidden="true" />
            <p className="seller-eyebrow">Bem-vinda à Artenós</p>
            <h2 id="seller-approval-title">Sua loja foi aprovada!</h2>
            <p>Agora você pode publicar suas peças e receber encomendas. Que bom ter você com a gente, {profile.full_name.trim().split(/\s+/)[0]}.</p>
            <button type="button" onClick={() => setShowApprovalWelcome(false)}>Começar a criar</button>
          </section>
        </div>
      )}
    </SellerContext.Provider>
  );
}
