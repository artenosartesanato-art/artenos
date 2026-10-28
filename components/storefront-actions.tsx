"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowRight, Heart, ShoppingBag, Sparkles, Truck, UserRound, X } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { SoundToggle } from "@/components/sound-toggle";
import { addProductToCart } from "@/lib/cart";
import { playUiSound } from "@/lib/ui-sound";
import { accessHref, currentPath } from "@/lib/navigation";
import { useMarketplace } from "@/components/marketplace-state";
import { confirmFavoriteRemoved, confirmFavoriteSaved } from "@/components/marketplace-feedback";
import { OptimizedImage } from "@/components/optimized-image";

export type ActionProduct = {
  id: string;
  name: string;
  price: number;
  image_url?: string | null;
  shop_name?: string | null;
  stock?: number | null;
  ready_to_ship?: boolean;
};

type AddedLine = { product: ActionProduct; quantity: number };
type AuthReason = "cart" | "favorite" | "generic";

type StorefrontActions = {
  /** Adiciona ao carrinho e confirma somente após a resposta do Supabase. */
  addToCart: (product: ActionProduct, quantity?: number) => Promise<boolean>;
  toggleFavorite: (product: ActionProduct) => Promise<void>;
  requireAuth: (reason?: AuthReason) => void;
  pendingCartIds: ReadonlySet<string>;
};

const StorefrontActionsContext = createContext<StorefrontActions | null>(null);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function StorefrontActionsProvider({ children }: { children: ReactNode }) {
  const {
    authReady, userId, cartCount, cartSubtotalCents, refreshCart, pulseCart,
    toggleFavorite: saveFavorite, addGuestToCart,
  } = useMarketplace();
  const pending = useRef(new Set<string>());
  const [pendingCartIds, setPendingCartIds] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<AddedLine | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authReason, setAuthReason] = useState<AuthReason | null>(null);

  const requireAuth = useCallback((reason: AuthReason = "generic") => setAuthReason(reason), []);

  const addToCart = useCallback(async (product: ActionProduct, quantity = 1) => {
    if (!authReady) {
      toast.info("Aguarde um instante enquanto verificamos sua conta.");
      return false;
    }
    if (!userId) {
      // Visitante: carrinho na memória desta aba (some ao recarregar).
      try {
        addGuestToCart(product, quantity);
        setAdded({ product, quantity });
        setDrawerOpen(true);
        pulseCart();
        playUiSound("added");
        return true;
      } catch (error) {
        playUiSound("error");
        toast.error(error instanceof Error ? error.message : "Não foi possível adicionar este produto ao carrinho.");
        return false;
      }
    }
    if (pending.current.has(product.id)) return false;
    pending.current.add(product.id);
    setPendingCartIds(new Set(pending.current));
    try {
      await addProductToCart(product.id, quantity);
      await refreshCart();
      setAdded({ product, quantity });
      setDrawerOpen(true);
      pulseCart();
      playUiSound("added");
      return true;
    } catch (error) {
      playUiSound("error");
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar este produto ao carrinho.");
      return false;
    } finally {
      pending.current.delete(product.id);
      setPendingCartIds(new Set(pending.current));
    }
  }, [authReady, userId, refreshCart, pulseCart, addGuestToCart]);

  const toggleFavorite = useCallback(async (product: ActionProduct) => {
    try {
      // Visitante: favorito na memória desta aba, levado para a conta ao entrar.
      const saved = await saveFavorite(product.id, product);
      if (saved) confirmFavoriteSaved(product.name);
      else confirmFavoriteRemoved(product.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar seus favoritos.");
    }
  }, [saveFavorite]);

  const value = useMemo(() => ({ addToCart, toggleFavorite, requireAuth, pendingCartIds }),
    [addToCart, toggleFavorite, requireAuth, pendingCartIds]);

  const lineCents = added ? Math.round(Number(added.product.price) * 100) * added.quantity : 0;

  return (
    <StorefrontActionsContext.Provider value={value}>
      {children}

      <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} variant="drawer"
        labelledBy="cart-drawer-title" describedBy="cart-drawer-status" closeLabel="Fechar resumo do carrinho"
        className="cart-drawer" closeButton={false}>
        <header className="an-drawer-header">
          <div className="cart-drawer-heading">
            <span className="cart-drawer-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
            </span>
            <h2 id="cart-drawer-title">Adicionado ao carrinho</h2>
          </div>
          <button type="button" className="an-icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Fechar resumo do carrinho">
            <X size={18} />
          </button>
        </header>
        <div className="an-drawer-body">
          {added && (
            <article className="cart-drawer-item">
              <div className="cart-drawer-thumb">
                {added.product.image_url
                  ? <OptimizedImage src={added.product.image_url} alt="" width={88} height={88} sizes="88px" />
                  : <Sparkles size={24} />}
              </div>
              <div>
                {added.product.shop_name && <small>{added.product.shop_name}</small>}
                <h3>{added.product.name}</h3>
                <p>
                  {added.quantity} × {money.format(Number(added.product.price))}
                  {" · "}
                  {added.product.ready_to_ship ? "Pronta entrega" : "Feita sob encomenda"}
                </p>
                <strong>{money.format(lineCents / 100)}</strong>
              </div>
            </article>
          )}
          <p id="cart-drawer-status" className="cart-drawer-summary" role="status">
            <ShoppingBag size={17} />
            <span>
              Seu carrinho tem <strong>{cartCount} {cartCount === 1 ? "unidade" : "unidades"}</strong>
              {" · "}produtos: <strong>{money.format(cartSubtotalCents / 100)}</strong>
            </span>
          </p>
          <p className="cart-drawer-note">
            <Truck size={17} />
            <span>O frete e o prazo de cada loja são calculados no carrinho, com o seu CEP.</span>
          </p>
          {!userId && (
            <p className="cart-drawer-note cart-drawer-guest">
              <UserRound size={17} />
              <span>
                Você está sem login: o carrinho fica só nesta aba e some se a página for recarregada.{" "}
                <Link href={accessHref(currentPath())} onClick={() => setDrawerOpen(false)}>Entre</Link> para guardar na sua conta.
              </span>
            </p>
          )}
        </div>
        <footer className="an-drawer-footer">
          <Link className="an-btn an-btn--lg an-btn--block" href="/carrinho" onClick={() => setDrawerOpen(false)} data-autofocus>
            Ver carrinho e calcular frete <ArrowRight size={18} />
          </Link>
          <button type="button" className="an-btn an-btn--secondary an-btn--block" onClick={() => setDrawerOpen(false)}>
            Continuar comprando
          </button>
          <SoundToggle className="cart-drawer-sound" />
        </footer>
      </Dialog>

      <Dialog open={authReason !== null} onClose={() => setAuthReason(null)} labelledBy="auth-prompt-title"
        describedBy="auth-prompt-text" className="auth-prompt">
        <div className="auth-prompt-body">
          <span className="auth-prompt-icon" aria-hidden="true">
            {authReason === "favorite" ? <Heart size={24} /> : <ShoppingBag size={24} />}
          </span>
          <h2 id="auth-prompt-title">Entre para continuar</h2>
          <p id="auth-prompt-text">
            {authReason === "favorite"
              ? "Entre na sua conta para salvar esta peça. Assim que você entrar, ela vai para os seus favoritos."
              : authReason === "cart"
                ? "O carrinho fica guardado na sua conta Artenós. Entre ou crie sua conta e volte para esta página."
                : "Entre ou crie sua conta para continuar."}
          </p>
          <div className="auth-prompt-actions">
            <Link className="an-btn an-btn--lg an-btn--block" href={accessHref(currentPath())} data-autofocus
              onClick={() => setAuthReason(null)}>
              Entrar ou criar conta <ArrowRight size={18} />
            </Link>
            <button type="button" className="an-btn an-btn--ghost an-btn--block" onClick={() => setAuthReason(null)}>
              Agora não
            </button>
          </div>
        </div>
      </Dialog>
    </StorefrontActionsContext.Provider>
  );
}

export function useStorefrontActions() {
  const context = useContext(StorefrontActionsContext);
  if (!context) throw new Error("useStorefrontActions deve ser usado dentro de StorefrontActionsProvider");
  return context;
}
