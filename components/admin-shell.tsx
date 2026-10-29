"use client";

import {
  AlertTriangle,
  CircleSlash2,
  Flag,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Package,
  Percent,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  Tags,
  UserRound,
  UserRoundCheck,
} from "@/components/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { useMarketplace } from "@/components/marketplace-state";
import { Dialog } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { endSession } from "@/lib/session";
import { ADMIN_ROLE_LABEL, type AdminRole } from "@/lib/admin";

export type AdminAccount = {
  userId: string;
  email: string;
  name: string;
  role: AdminRole;
};

type AdminContextValue = {
  account: AdminAccount;
  /** Solicitações aguardando decisão (badge do menu). */
  waiting: number;
  refreshWaiting: () => void;
  updateName: (name: string) => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) throw new Error("useAdmin fora do painel administrativo");
  return context;
}

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; badge?: "waiting"; ownerOnly?: boolean };

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Operação",
    items: [
      { label: "Visão geral", href: "/administracao", icon: LayoutDashboard },
      { label: "Aprovações", href: "/administracao/aprovacoes", icon: UserRoundCheck, badge: "waiting" },
      { label: "Vendedores", href: "/administracao/vendedores", icon: Store },
      { label: "Pedidos", href: "/administracao/pedidos", icon: Package },
      { label: "Clientes", href: "/administracao/clientes", icon: UserRound },
      { label: "Denúncias", href: "/administracao/denuncias", icon: Flag },
    ],
  },
  {
    title: "Vitrine e plataforma",
    items: [
      { label: "Categorias", href: "/administracao/categorias", icon: Tags },
      { label: "Tarifa", href: "/administracao/tarifa", icon: Percent },
      { label: "Equipe", href: "/administracao/equipe", icon: ShieldCheck },
      { label: "Atividade", href: "/administracao/atividade", icon: History },
    ],
  },
  {
    title: "Sua conta",
    items: [
      { label: "Meu perfil", href: "/administracao/perfil", icon: UserRound },
      { label: "Ver a vitrine", href: "/", icon: Sparkles },
    ],
  },
];

type Screen = "loading" | "ready" | "unauthenticated" | "denied" | "error";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { avatarUrl, displayName } = useMarketplace();
  const router = useRouter();
  const pathname = usePathname();
  const [screen, setScreen] = useState<Screen>("loading");
  const [account, setAccount] = useState<AdminAccount | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const authorize = useCallback(async () => {
    setScreen("loading");
    try {
      const supabase = getSupabase();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        setScreen("unauthenticated");
        return;
      }
      // A permissão é decidida no banco; o navegador só lê o resultado.
      const { data: allowed, error: allowedError } = await supabase.rpc("is_active_admin");
      if (allowedError || allowed !== true) {
        setScreen("denied");
        return;
      }
      const { data: adminRow } = await supabase.from("admin_users").select("role")
        .eq("user_id", authData.user.id).single();
      const user = authData.user;
      setAccount({
        userId: user.id,
        email: user.email ?? "",
        name: String(user.user_metadata?.full_name || "").trim(),
        role: adminRow?.role === "owner" ? "owner" : "reviewer",
      });
      setScreen("ready");
    } catch {
      setScreen("error");
    }
  }, []);

  const refreshWaiting = useCallback(() => {
    void Promise.resolve(getSupabase().rpc("get_admin_application_counts")).then(({ data }) => {
      const rows = (data ?? []) as { status: string; total: number }[];
      setWaiting(rows.filter((row) => ["pending_review", "under_review", "changes_requested"].includes(row.status))
        .reduce((sum, row) => sum + Number(row.total), 0));
    }).catch(() => undefined);
  }, []);

  useEffect(() => { queueMicrotask(() => void authorize()); }, [authorize]);
  useEffect(() => { if (screen === "ready") queueMicrotask(refreshWaiting); }, [screen, refreshWaiting, pathname]);
  useEffect(() => { queueMicrotask(() => setMenuOpen(false)); }, [pathname]);

  async function signOut() {
    const error = await endSession("local");
    if (error) {
      toast.error("Não foi possível sair agora.");
      return;
    }
    router.replace("/acesso?motivo=saiu");
  }

  if (screen !== "ready" || !account) {
    return (
      <main id="conteudo" tabIndex={-1} className="admin-gate">
        <div className="admin-gate-card" role={screen === "loading" ? "status" : undefined}>
          {screen === "loading" && <>
            <Loader2 className="admin-spin" size={30} />
            <h1>Validando acesso administrativo</h1>
            <p>Estamos confirmando sua sessão e suas permissões.</p>
          </>}
          {screen === "unauthenticated" && <>
            <ShieldCheck size={34} />
            <h1>Entre com a conta administrativa</h1>
            <p>Este painel é reservado à equipe autorizada da Artenós.</p>
            <Link href="/acesso?voltar=%2Fadministracao">Entrar na plataforma</Link>
          </>}
          {screen === "denied" && <>
            <CircleSlash2 size={34} />
            <h1>Acesso não autorizado</h1>
            <p>Sua conta está conectada, mas não consta como administradora ativa.</p>
            <div>
              <Link href="/">Voltar para a vitrine</Link>
              <button type="button" onClick={signOut}>Sair da conta</button>
            </div>
          </>}
          {screen === "error" && <>
            <AlertTriangle size={34} />
            <h1>Não foi possível validar o acesso</h1>
            <p>Tente novamente. Se continuar, confirme que o painel administrativo foi configurado no banco.</p>
            <button type="button" onClick={() => void authorize()}><RefreshCw size={17} /> Tentar novamente</button>
          </>}
        </div>
      </main>
    );
  }

  const name = account.name || displayName || account.email;
  const isActive = (href: string) => href === "/administracao" || href === "/"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  const navigation = (
    <>
      <div className="seller-sidebar-store">
        <strong>Administração</strong>
        <small><ShieldCheck size={14} /> {ADMIN_ROLE_LABEL[account.role]}</small>
      </div>
      {NAV.map((group) => (
        <nav key={group.title} aria-label={group.title}>
          <p>{group.title}</p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const badge = item.badge === "waiting" && waiting > 0 ? waiting : 0;
            return (
              <Link key={item.href} href={item.href} className={`seller-nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}
                aria-label={badge ? `${item.label}, ${badge} aguardando` : undefined}>
                <Icon size={18} />
                <span>{item.label}</span>
                {badge > 0 && <small className="seller-cart-count" aria-hidden="true">{badge > 99 ? "99+" : badge}</small>}
              </Link>
            );
          })}
        </nav>
      ))}
      <div className="seller-sidebar-profile">
        {avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="seller-avatar" src={avatarUrl} alt="" />
          : <span className="seller-avatar"><UserRound size={20} /></span>}
        <div>
          <strong>{name}</strong>
          <small title={account.email}>{account.email}</small>
        </div>
      </div>
      <button type="button" className="seller-nav-link seller-signout" onClick={signOut}>
        <LogOut size={18} />
        <span>Sair da conta</span>
      </button>
    </>
  );

  return (
    <AdminContext.Provider value={{
      account, waiting, refreshWaiting,
      updateName: (next) => setAccount((current) => current ? { ...current, name: next } : current),
    }}>
      <div className="seller-shell admin-shell">
        <div className="seller-mobile-bar seller-container">
          <button className="seller-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog">
            <Menu size={20} />
            <span>Menu da administração</span>
          </button>
          {waiting > 0 && <Link className="admin-mobile-waiting" href="/administracao/aprovacoes">{waiting} aguardando</Link>}
        </div>
        <div className="seller-body seller-container">
          <aside className="seller-sidebar" aria-label="Menu da administração">{navigation}</aside>
          <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} variant="drawer-left" label="Menu da administração"
            className="seller-menu-drawer" closeLabel="Fechar menu">
            <div className="an-drawer-body seller-sidebar is-drawer">{navigation}</div>
          </Dialog>
          <main id="conteudo" tabIndex={-1} className="seller-content admin-content">{children}</main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}
