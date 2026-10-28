"use client";

import {
  Calculator,
  HandCoins,
  Heart,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  Menu,
  PackageCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
  UserRound,
} from "@/components/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { useMarketplace } from "@/components/marketplace-state";
import { Dialog } from "@/components/ui/dialog";

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
  { label: "Repasses", href: "/vendedor/repasses", icon: HandCoins },
  { label: "Mensagens", href: "/vendedor/mensagens", icon: Mail },
];

const purchaseLinks = [
  { label: "Vitrine Artenós", href: "/", icon: Sparkles },
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
  // "/" e "/vendedor" só ficam ativos na própria rota; antes, "/" casava com
  // qualquer caminho e "Comprar na Artenós" aparecia sempre selecionado.
  const active =
    item.href === "/vendedor" || item.href === "/"
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      className={`seller-nav-link${active ? " is-active" : ""}`}
      href={item.href}
      aria-current={active ? "page" : undefined}
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
    queueMicrotask(() => setMenuOpen(false));
  }, [pathname]);

  const avatar = avatarUrl
    ? <img className="seller-avatar" src={avatarUrl} alt="" />
    : <span className="seller-avatar"><UserRound size={20} /></span>;

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
        <span>Estamos conferindo o acesso da sua loja.</span>
      </main>
    );
  }

  if (screen === "error" || !profile) {
    return (
      <main className="seller-gate">
        <Store size={34} />
        <h1>Não foi possível abrir sua loja</h1>
        <p>
          Não conseguimos carregar os dados da sua loja. Recarregue a página
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

  const navigation = (
    <>
      <div className="seller-sidebar-store">
        <strong>{profile.store_name || "Minha loja"}</strong>
        <small><MapPin size={14} /> CEP {formatCep(profile.cep)}</small>
      </div>
      <nav aria-label="Gestão da loja">
        <p>Gestão da loja</p>
        {managementLinks.map((item) => (
          <SellerNavLink key={item.label} item={item} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
        ))}
      </nav>
      <nav aria-label="Compras">
        <p>Também quero comprar</p>
        {purchaseLinks.map((item) => (
          <SellerNavLink key={item.label} item={item} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
        ))}
      </nav>
      <div className="seller-sidebar-profile">
        {avatar}
        <div>
          <strong>{profile.full_name}</strong>
          <small>{profile.specialty || "Artesanato autoral"}</small>
        </div>
      </div>
      <button type="button" className="seller-nav-link seller-signout" onClick={signOut}>
        <LogOut size={18} />
        <span>Sair da conta</span>
      </button>
    </>
  );

  return (
    <SellerContext.Provider value={{ profile, updateProfile }}>
      <div className="seller-shell">
        <div className="seller-mobile-bar seller-container">
          <button
            className="seller-menu-button"
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-haspopup="dialog"
          >
            <Menu size={20} />
            <span>Menu da loja</span>
          </button>
          <span className="seller-mobile-store">{profile.store_name || "Minha loja"}</span>
        </div>

        <div className="seller-body seller-container">
          <aside className="seller-sidebar" aria-label="Menu da loja">
            {navigation}
          </aside>
          <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} variant="drawer-left" label="Menu da loja"
            className="seller-menu-drawer" closeLabel="Fechar menu">
            <div className="an-drawer-body seller-sidebar is-drawer">
              {navigation}
            </div>
          </Dialog>
          <main id="conteudo" tabIndex={-1} className="seller-content">{children}</main>
        </div>
      </div>
      <Dialog open={showApprovalWelcome} onClose={() => setShowApprovalWelcome(false)} labelledBy="seller-approval-title"
        className="seller-approval-dialog" closeButton={false}>
        <Sparkles size={38} aria-hidden="true" />
        <p className="seller-eyebrow">Boas-vindas à Artenós</p>
        <h2 id="seller-approval-title">Sua loja foi aprovada!</h2>
        <p>Agora você pode publicar suas peças e receber encomendas. Que bom ter você com a gente, {profile.full_name.trim().split(/\s+/)[0]}.</p>
        <button type="button" data-autofocus onClick={() => setShowApprovalWelcome(false)}>Começar a criar</button>
      </Dialog>
    </SellerContext.Provider>
  );
}
