"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { confirmFavoriteSaved } from "@/components/marketplace-feedback";
import { toast } from "sonner";

type MarketplaceState = {
  authReady: boolean;
  userId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  sellerPanelAvailable: boolean;
  cartCount: number;
  favoriteIds: ReadonlySet<string>;
  pendingFavoriteIds: ReadonlySet<string>;
  refreshCart: () => Promise<boolean>;
  refreshFavorites: () => Promise<boolean>;
  toggleFavorite: (productId: string) => Promise<boolean>;
};

const MarketplaceContext = createContext<MarketplaceState | null>(null);
const emptyFavorites = new Set<string>();
const FAVORITE_INTENT_KEY = "artenos:favorite-intent";
type FavoriteIntent = { productId: string; name: string; returnTo: string; createdAt: number };

function pendingFavoriteIntent(): FavoriteIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FAVORITE_INTENT_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw) as FavoriteIntent;
    if (Date.now() - intent.createdAt > 15 * 60_000 ||
      !/^[0-9a-f-]{36}$/i.test(intent.productId) ||
      !intent.returnTo.startsWith("/") || intent.returnTo.startsWith("//")) {
      window.sessionStorage.removeItem(FAVORITE_INTENT_KEY);
      return null;
    }
    return intent;
  } catch { return null; }
}

export function rememberFavoriteIntent(productId: string, name: string) {
  if (typeof window === "undefined") return;
  const intent: FavoriteIntent = { productId, name, returnTo: location.pathname + location.search,
    createdAt: Date.now() };
  window.sessionStorage.setItem(FAVORITE_INTENT_KEY, JSON.stringify(intent));
}

export function favoriteIntentReturnPath() {
  return pendingFavoriteIntent()?.returnTo ?? null;
}

export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarUrlRef = useRef<string | null>(null);
  const [sellerPanelAvailable, setSellerPanelAvailable] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(emptyFavorites);
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState<ReadonlySet<string>>(emptyFavorites);
  const accountRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const generation = useRef(0);
  const identityRequest = useRef(0);
  const cartRequest = useRef(0);
  const favoritesRequest = useRef(0);
  const favoritePending = useRef(new Set<string>());

  const refreshIdentity = useCallback(async () => {
    const account = accountRef.current;
    const request = generation.current;
    const identity = ++identityRequest.current;
    if (!account) return;
    const supabase = getSupabase();
    const { data, error } = await supabase.from("profiles")
      .select("full_name,account_type,approval_status,avatar_path")
      .eq("id", account).maybeSingle();
    if (error || request !== generation.current || identity !== identityRequest.current || account !== accountRef.current) return;
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
    setCartCount((data ?? []).reduce((total: number, item: { quantity?: number }) =>
      total + Math.max(0, Number(item.quantity) || 0), 0));
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
    return true;
  }, []);

  const toggleFavorite = useCallback(async (productId: string) => {
    const account = accountRef.current;
    if (!account) throw new Error("Entre na sua conta para salvar favoritos.");
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
      setCartCount(0);
      setFavoriteIds(new Set());
      setAuthReady(true);
      if (!nextId) return;
      const request = generation.current;
      window.setTimeout(async () => {
        await refreshIdentity();
        const { data } = await supabase.from("profiles")
          .select("approval_status")
          .eq("id", nextId).maybeSingle();
        if (request !== generation.current || accountRef.current !== nextId) return;
        void refreshCart();
        void refreshFavorites();
        const intent = pendingFavoriteIntent();
        if (intent && data?.approval_status === "active") {
          const { error } = await supabase.from("storefront_favorites")
            .upsert({ user_id: nextId, product_id: intent.productId },
              { onConflict: "user_id,product_id", ignoreDuplicates: true });
          if (request === generation.current && accountRef.current === nextId) {
            if (error) toast.error("Não foi possível salvar o favorito após entrar. Tente novamente.");
            else {
              window.sessionStorage.removeItem(FAVORITE_INTENT_KEY);
              void refreshFavorites();
              confirmFavoriteSaved(intent.name);
            }
          }
        }
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

  return <MarketplaceContext.Provider value={{ authReady, userId, displayName, avatarUrl,
    sellerPanelAvailable, cartCount, favoriteIds, pendingFavoriteIds,
    refreshCart, refreshFavorites, toggleFavorite }}>
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
