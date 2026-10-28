"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { guestCartAdd, guestCartTotals, type GuestCartLine, type GuestProduct } from "@/lib/guest-cart";
import { toast } from "sonner";

type MarketplaceState = {
  authReady: boolean;
  userId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  sellerPanelAvailable: boolean;
  accountType: "client" | "artisan" | null;
  cartCount: number;
  /** Soma dos produtos no carrinho, em centavos (sem frete). */
  cartSubtotalCents: number;
  /** Incrementa a cada adição confirmada; usado para o pulso do badge. */
  cartPulse: number;
  cep: string;
  cepStatus: CepStatus;
  cepError: string;
  setGuestCep: (digits: string) => void;
  favoriteIds: ReadonlySet<string>;
  /** Verdadeiro depois que os favoritos da conta atual foram lidos ao menos uma vez. */
  favoritesReady: boolean;
  pendingFavoriteIds: ReadonlySet<string>;
  refreshCart: () => Promise<boolean>;
  pulseCart: () => void;
  refreshFavorites: () => Promise<boolean>;
  /** Visitante: `product` guarda os dados para mostrar a peça nos favoritos. */
  toggleFavorite: (productId: string, product?: GuestProduct) => Promise<boolean>;
  /**
   * Carrinho e favoritos de quem não entrou: só na memória desta aba (somem ao
   * recarregar) e levados para a conta quando a pessoa entra.
   */
  guestCart: readonly GuestCartLine[];
  guestFavorites: readonly GuestProduct[];
  addGuestToCart: (product: GuestProduct, quantity: number) => void;
  setGuestQuantity: (productId: string, quantity: number) => void;
};

export type CepStatus = "loading" | "guest" | "account" | "error";
const MarketplaceContext = createContext<MarketplaceState | null>(null);
const GUEST_CEP_KEY = "artenos_guest_cep";

function readGuestCep() {
  try { return (window.localStorage.getItem(GUEST_CEP_KEY) || "").replace(/\D/g, "").slice(0, 8); }
  catch { return ""; }
}
const emptyFavorites = new Set<string>();
/** Mantido por compatibilidade: favoritar não exige mais login. */
export function favoriteIntentReturnPath(): string | null {
  return null;
}

/** Leva o carrinho e os favoritos do visitante para a conta que acabou de entrar. */
async function carryGuestItems(userId: string, cart: readonly GuestCartLine[], favorites: readonly GuestProduct[]) {
  const supabase = getSupabase();
  let movedUnits = 0;
  const failed: string[] = [];
  for (const line of cart) {
    try {
      // RPC direto (lib/cart importa este módulo; evita import circular).
      const { error } = await supabase.rpc("add_to_cart", { p_product_id: line.product.id, p_quantity: line.quantity });
      if (error) throw error;
      movedUnits += line.quantity;
    } catch {
      failed.push(line.product.name);
    }
  }
  let movedFavorites = 0;
  if (favorites.length) {
    const { error } = await supabase.from("storefront_favorites").upsert(
      favorites.map((item) => ({ user_id: userId, product_id: item.id })),
      { onConflict: "user_id,product_id", ignoreDuplicates: true });
    if (error) failed.push(...favorites.map((item) => item.name));
    else movedFavorites = favorites.length;
  }
  const parts = [
    movedUnits ? `${movedUnits} ${movedUnits === 1 ? "unidade no carrinho" : "unidades no carrinho"}` : "",
    movedFavorites ? `${movedFavorites} ${movedFavorites === 1 ? "favorito" : "favoritos"}` : "",
  ].filter(Boolean);
  if (parts.length) toast.success(`Levamos para sua conta: ${parts.join(" e ")}.`);
  if (failed.length) {
    toast.error(`Não foi possível levar ${failed.length === 1 ? `"${failed[0]}"` : `${failed.length} itens`} (estoque ou disponibilidade). Confira o carrinho.`);
  }
}

export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarUrlRef = useRef<string | null>(null);
  const [sellerPanelAvailable, setSellerPanelAvailable] = useState(false);
  const [accountType, setAccountType] = useState<"client" | "artisan" | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [cartSubtotalCents, setCartSubtotalCents] = useState(0);
  const [cartPulse, setCartPulse] = useState(0);
  const [cep, setCep] = useState("");
  const [cepStatus, setCepStatus] = useState<CepStatus>("loading");
  const [cepError, setCepError] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(emptyFavorites);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState<ReadonlySet<string>>(emptyFavorites);
  const accountRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const generation = useRef(0);
  const identityRequest = useRef(0);
  const cartRequest = useRef(0);
  const favoritesRequest = useRef(0);
  const favoritePending = useRef(new Set<string>());
  const [guestCart, setGuestCart] = useState<GuestCartLine[]>([]);
  const [guestFavorites, setGuestFavorites] = useState<GuestProduct[]>([]);
  // Cópias para o ouvinte de login, que roda fora do ciclo de render.
  const guestCartRef = useRef<GuestCartLine[]>([]);
  const guestFavoritesRef = useRef<GuestProduct[]>([]);
  useEffect(() => { guestCartRef.current = guestCart; }, [guestCart]);
  useEffect(() => { guestFavoritesRef.current = guestFavorites; }, [guestFavorites]);

  const refreshIdentity = useCallback(async () => {
    const account = accountRef.current;
    const request = generation.current;
    const identity = ++identityRequest.current;
    if (!account) return;
    const supabase = getSupabase();
    const { data, error } = await supabase.from("profiles")
      .select("full_name,account_type,approval_status,avatar_path,cep")
      .eq("id", account).maybeSingle();
    if (request !== generation.current || identity !== identityRequest.current || account !== accountRef.current) return;
    const registeredCep = String(data?.cep ?? "").replace(/\D/g, "");
    if (error || registeredCep.length !== 8) {
      setCep("");
      setCepStatus("error");
      setCepError(error
        ? "Não foi possível consultar o CEP do seu cadastro agora."
        : "O CEP salvo no seu cadastro está incompleto. Atualize-o no seu perfil.");
    } else {
      setCep(registeredCep);
      setCepStatus("account");
      setCepError("");
    }
    if (error) return;
    setAccountType(data?.account_type === "artisan" ? "artisan" : data?.account_type === "client" ? "client" : null);
    setDisplayName(String(data?.full_name ?? "").trim().split(/\s+/)[0] || null);
    setSellerPanelAvailable(data?.account_type === "artisan" && data.approval_status === "active");
    let nextUrl: string | null = null;
    if (data?.avatar_path) {
      const result = await supabase.storage.from("artenos-profile-avatars").download(data.avatar_path);
      if (result.data) nextUrl = URL.createObjectURL(result.data);
    }
    if (request !== generation.current || identity !== identityRequest.current || account !== accountRef.current) {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      return;
    }
    if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
    avatarUrlRef.current = nextUrl;
    setAvatarUrl(nextUrl);
  }, []);

  const refreshCart = useCallback(async () => {
    const account = accountRef.current;
    const generationAtStart = generation.current;
    const request = ++cartRequest.current;
    if (!account) return false;
    const { data, error } = await getSupabase().rpc("list_cart");
    if (error || generationAtStart !== generation.current ||
      request !== cartRequest.current || account !== accountRef.current) return false;
    const rows = (data ?? []) as { quantity?: number; unit_price?: number }[];
    setCartCount(rows.reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0));
    setCartSubtotalCents(rows.reduce((total, item) =>
      total + Math.round(Number(item.unit_price) * 100) * Math.max(0, Number(item.quantity) || 0), 0));
    return true;
  }, []);

  const refreshFavorites = useCallback(async () => {
    const account = accountRef.current;
    const generationAtStart = generation.current;
    const request = ++favoritesRequest.current;
    if (!account) return false;
    const { data, error } = await getSupabase().from("storefront_favorites")
      .select("product_id").eq("user_id", account);
    if (error || generationAtStart !== generation.current ||
      request !== favoritesRequest.current || account !== accountRef.current) return false;
    setFavoriteIds(new Set((data ?? []).map((item) => item.product_id)));
    setFavoritesReady(true);
    return true;
  }, []);

  const toggleFavorite = useCallback(async (productId: string, product?: GuestProduct) => {
    const account = accountRef.current;
    if (!account) {
      const saved = guestFavoritesRef.current.some((item) => item.id === productId);
      if (!saved && !product) throw new Error("Não foi possível salvar este favorito.");
      const next = saved
        ? guestFavoritesRef.current.filter((item) => item.id !== productId)
        : [product!, ...guestFavoritesRef.current];
      guestFavoritesRef.current = next;
      setGuestFavorites(next);
      return !saved;
    }
    if (favoritePending.current.has(productId)) throw new Error("Aguarde a atualização deste favorito.");
    favoritePending.current.add(productId);
    setPendingFavoriteIds(new Set(favoritePending.current));
    const wasSaved = favoriteIds.has(productId);
    try {
      const supabase = getSupabase();
      const { error } = wasSaved
        ? await supabase.from("storefront_favorites").delete()
          .eq("user_id", account).eq("product_id", productId)
        : await supabase.from("storefront_favorites")
          .insert({ user_id: account, product_id: productId });
      if (error) throw new Error("Não foi possível atualizar seus favoritos. Tente novamente.");
      if (account !== accountRef.current) throw new Error("A conta foi alterada. Confira seus favoritos.");
      favoritesRequest.current++;
      setFavoriteIds((previous) => {
        const next = new Set(previous);
        if (wasSaved) next.delete(productId);
        else next.add(productId);
        return next;
      });
      return !wasSaved;
    } finally {
      favoritePending.current.delete(productId);
      if (account === accountRef.current) setPendingFavoriteIds(new Set(favoritePending.current));
    }
  }, [favoriteIds]);

  useEffect(() => {
    const supabase = getSupabase();
    const generationCounter = generation;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user?.id ?? null;
      if (nextId === accountRef.current && readyRef.current) return;
      readyRef.current = true;
      const wasGuest = accountRef.current === null;
      const carried = nextId && wasGuest
        ? { cart: guestCartRef.current, favorites: guestFavoritesRef.current }
        : null;
      // Ao entrar ou sair, o estado de visitante recomeça (o de quem entrou
      // vai para a conta logo abaixo).
      guestCartRef.current = [];
      guestFavoritesRef.current = [];
      setGuestCart([]);
      setGuestFavorites([]);
      accountRef.current = nextId;
      generation.current++;
      identityRequest.current++;
      cartRequest.current++;
      favoritesRequest.current++;
      favoritePending.current.clear();
      setPendingFavoriteIds(new Set());
      setUserId(nextId);
      setDisplayName(null);
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
      avatarUrlRef.current = null;
      setAvatarUrl(null);
      setSellerPanelAvailable(false);
      setAccountType(null);
      setCartCount(0);
      setCartSubtotalCents(0);
      if (nextId) {
        setCep("");
        setCepStatus("loading");
      } else {
        const guestCep = readGuestCep();
        setCep(guestCep.length === 8 ? guestCep : "");
        setCepStatus("guest");
      }
      setCepError("");
      setFavoriteIds(new Set());
      setFavoritesReady(false);
      setAuthReady(true);
      if (!nextId) return;
      const request = generation.current;
      window.setTimeout(async () => {
        await refreshIdentity();
        const { data } = await supabase.from("profiles")
          .select("approval_status")
          .eq("id", nextId).maybeSingle();
        if (request !== generation.current || accountRef.current !== nextId) return;
        if (carried && (carried.cart.length || carried.favorites.length) && data?.approval_status === "active") {
          await carryGuestItems(nextId, carried.cart, carried.favorites);
        }
        if (request !== generation.current || accountRef.current !== nextId) return;
        void refreshCart();
        void refreshFavorites();
      }, 0);
    });
    return () => {
      generationCounter.current++;
      readyRef.current = false;
      listener.subscription.unsubscribe();
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
      avatarUrlRef.current = null;
    };
  }, [refreshCart, refreshFavorites, refreshIdentity]);

  useEffect(() => {
    if (!userId) return;
    const timer = window.setTimeout(() => { void refreshCart(); void refreshFavorites(); }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, userId, refreshCart, refreshFavorites]);

  useEffect(() => {
    const onCartChanged = () => { void refreshCart(); };
    const onProfileChanged = () => { void refreshIdentity(); };
    const onFocus = () => { if (accountRef.current) { void refreshIdentity(); void refreshCart(); void refreshFavorites(); } };
    window.addEventListener("artenos:cart-changed", onCartChanged);
    window.addEventListener("artenos:profile-changed", onProfileChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("artenos:cart-changed", onCartChanged);
      window.removeEventListener("artenos:profile-changed", onProfileChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshCart, refreshFavorites, refreshIdentity]);

  const addGuestToCart = useCallback((product: GuestProduct, quantity: number) => {
    // Lança "Estoque insuficiente…" como o carrinho da conta.
    const next = guestCartAdd(guestCartRef.current, product, quantity);
    guestCartRef.current = next;
    setGuestCart(next);
  }, []);

  const setGuestQuantity = useCallback((productId: string, quantity: number) => {
    const next = quantity <= 0
      ? guestCartRef.current.filter((line) => line.product.id !== productId)
      : guestCartRef.current.map((line) => line.product.id === productId
        ? { ...line, quantity: Math.min(quantity, line.product.stock ?? quantity) }
        : line);
    guestCartRef.current = next;
    setGuestCart(next);
  }, []);

  const setGuestCep = useCallback((digits: string) => {
    const value = digits.replace(/\D/g, "").slice(0, 8);
    try { window.localStorage.setItem(GUEST_CEP_KEY, value); } catch { /* armazenamento bloqueado */ }
    if (!accountRef.current) {
      setCep(value);
      setCepStatus("guest");
    }
  }, []);
  const pulseCart = useCallback(() => setCartPulse((value) => value + 1), []);

  // Valor memoizado: sem isso, qualquer render do provedor re-renderizava
  // todos os cards e cabeçalhos que consomem o contexto.
  // Visitante: contador, subtotal e favoritos vêm do estado em memória.
  const guestTotals = useMemo(() => guestCartTotals(guestCart), [guestCart]);
  const guestFavoriteIds = useMemo(() => new Set(guestFavorites.map((item) => item.id)), [guestFavorites]);
  const guest = authReady && !userId;
  const value = useMemo(() => ({ authReady, userId, displayName, avatarUrl,
    sellerPanelAvailable, accountType,
    cartCount: guest ? guestTotals.count : cartCount,
    cartSubtotalCents: guest ? guestTotals.subtotalCents : cartSubtotalCents,
    cartPulse, cep, cepStatus, cepError, setGuestCep,
    favoriteIds: guest ? guestFavoriteIds : favoriteIds,
    favoritesReady: guest ? true : favoritesReady,
    pendingFavoriteIds, refreshCart, pulseCart, refreshFavorites, toggleFavorite,
    guestCart, guestFavorites, addGuestToCart, setGuestQuantity }),
  [authReady, userId, displayName, avatarUrl, sellerPanelAvailable, accountType, cartCount, cartSubtotalCents, cartPulse,
    cep, cepStatus, cepError, setGuestCep, favoriteIds, favoritesReady, pendingFavoriteIds, refreshCart, pulseCart,
    refreshFavorites, toggleFavorite, guest, guestTotals, guestFavoriteIds, guestCart, guestFavorites, addGuestToCart,
    setGuestQuantity]);

  return <MarketplaceContext.Provider value={value}>
    {children}
  </MarketplaceContext.Provider>;
}

export function useMarketplace() {
  const state = useContext(MarketplaceContext);
  if (!state) throw new Error("useMarketplace deve ser usado dentro de MarketplaceProvider");
  return state;
}

export function notifyCartChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("artenos:cart-changed"));
}

export function notifyProfileChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("artenos:profile-changed"));
}
