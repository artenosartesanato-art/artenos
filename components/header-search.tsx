"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type SearchHandler = (query: string) => void;

type HeaderSearch = {
  value: string;
  setValue: (value: string) => void;
  /** Página atual assumiu a busca? Então submit chama o handler em vez de navegar. */
  runHandler: (query: string) => boolean;
  register: (handler: SearchHandler) => () => void;
};

const HeaderSearchContext = createContext<HeaderSearch | null>(null);

/**
 * Estado da busca do cabeçalho único (montado no layout raiz). Uma página pode
 * assumir a busca com useHeaderSearchControl; nas demais, buscar navega para
 * /categorias.
 */
export function HeaderSearchProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [value, setValue] = useState("");
  const handler = useRef<SearchHandler | null>(null);

  // O termo só faz sentido na página de resultados.
  useEffect(() => {
    if (pathname !== "/categorias") queueMicrotask(() => setValue(""));
  }, [pathname]);

  const runHandler = useCallback((query: string) => {
    if (!handler.current) return false;
    handler.current(query);
    return true;
  }, []);
  const register = useCallback((next: SearchHandler) => {
    handler.current = next;
    return () => { if (handler.current === next) handler.current = null; };
  }, []);
  const context = useMemo(() => ({ value, setValue, runHandler, register }), [value, runHandler, register]);

  return (
    <HeaderSearchContext.Provider value={context}>
      {children}
    </HeaderSearchContext.Provider>
  );
}

export function useHeaderSearch() {
  const context = useContext(HeaderSearchContext);
  if (!context) throw new Error("useHeaderSearch precisa do HeaderSearchProvider");
  return context;
}

/** A página filtra no lugar em vez de navegar; devolve o valor do campo. */
export function useHeaderSearchControl(onSearch: SearchHandler) {
  const { value, setValue, register } = useHeaderSearch();
  useEffect(() => register(onSearch), [register, onSearch]);
  return [value, setValue] as const;
}
