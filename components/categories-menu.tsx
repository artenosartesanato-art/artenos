"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { CATALOG_URL_EVENT } from "@/lib/catalog-filters";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, ChevronDown, LoaderCircle, RefreshCw, SpriteIcon } from "@/components/icons";
import { categoryLook } from "@/lib/category-looks";
import { Dialog } from "@/components/ui/dialog";
import { categoryCountLabel, categoryHref, topCategories, useStorefrontCategories, type StorefrontCategory } from "@/lib/storefront-categories";

const MOBILE_QUERY = "(max-width: 768px)";

/**
 * Já na listagem, troca a categoria sem recarregar a página: grava no histórico
 * (o Voltar funciona) e avisa a listagem para reler o endereço.
 */
function goToCategory(event: MouseEvent<HTMLAnchorElement>, href: string, onNavigate: () => void) {
  onNavigate();
  if (window.location.pathname !== "/categorias" || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  if (window.location.pathname + window.location.search !== href) window.history.pushState(null, "", href);
  window.dispatchEvent(new Event(CATALOG_URL_EVENT));
  window.scrollTo({ top: 0 });
}

function CategoryLinks({ categories, onNavigate, columns }: {
  categories: StorefrontCategory[]; onNavigate: () => void; columns: boolean;
}) {
  return (
    <ul className={columns ? "categories-menu-grid" : "categories-menu-list"}>
      {categories.map((category) => (
        <li key={category.id}>
          <Link href={categoryHref(category)} onClick={(event) => goToCategory(event, categoryHref(category), onNavigate)}
            className={category.product_count === 0 ? "is-empty" : undefined}>
            <SpriteIcon name={categoryLook(category).icon} size={16} className="categories-menu-icon" />
            <span>{category.name}</span>
            <small aria-label={categoryCountLabel(category)} title={categoryCountLabel(category)}>{category.product_count}</small>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MenuContent({ titleId, onNavigate, columns }: { titleId: string; onNavigate: () => void; columns: boolean }) {
  const { categories, failed, retry } = useStorefrontCategories();
  const highlights = categories ? topCategories(categories, 4) : [];
  return (
    <>
      <div className="categories-menu-head">
        <h2 id={titleId}>Categorias</h2>
        <Link className="categories-menu-all" href="/categorias" onClick={(event) => goToCategory(event, "/categorias", onNavigate)}>
          Ver todas as peças <ArrowRight size={15} />
        </Link>
      </div>
      {failed ? (
        <p className="categories-menu-state" role="alert">
          Não foi possível carregar as categorias.{" "}
          <button type="button" onClick={retry}><RefreshCw size={13} /> Tentar de novo</button>
        </p>
      ) : !categories ? (
        <p className="categories-menu-state" role="status"><LoaderCircle size={15} className="spin" /> Carregando categorias…</p>
      ) : (
        <>
          {highlights.length > 0 && (
            <section className="categories-menu-highlights" aria-label="Mais procuradas">
              <h3>Mais procuradas</h3>
              <ul>
                {highlights.map((category) => (
                  <li key={category.id}>
                    <Link href={categoryHref(category)} onClick={(event) => goToCategory(event, categoryHref(category), onNavigate)}>{category.name}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <CategoryLinks categories={categories} onNavigate={onNavigate} columns={columns} />
        </>
      )}
    </>
  );
}

/**
 * "Categorias" no cabeçalho: painel com todas as categorias em colunas
 * (tela cheia no celular). Clicar numa categoria abre a listagem já filtrada.
 */
export function CategoriesMenu({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();
  const pathname = usePathname();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  // Mudou de página: fecha (os links do painel também fecham ao clicar).
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    queueMicrotask(() => setOpen(false));
  }, [pathname]);

  // Painel do desktop: fecha com clique fora e Esc; o foco vai para o painel.
  useEffect(() => {
    if (!open || mobile) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("a, button")?.focus());
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mobile, close]);

  function toggle() {
    if (open) return close();
    setMobile(window.matchMedia(MOBILE_QUERY).matches);
    setOpen(true);
  }

  // Foco preso no painel (Tab circula) e setas entre as categorias.
  function onPanelKey(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a, button") ?? []);
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Tab") {
      if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0].focus(); }
    } else if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      items[(index + step + items.length) % items.length].focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1].focus();
    }
  }

  return (
    <>
      <button ref={buttonRef} type="button" className="store-nav-categories" onClick={toggle}
        aria-expanded={open} aria-controls={open && !mobile ? panelId : undefined} aria-haspopup="dialog"
        aria-current={active ? "page" : undefined}>
        <span>Categorias</span>
        <ChevronDown size={14} className={open ? "is-open" : undefined} />
      </button>
      {open && !mobile && (
        <div ref={panelRef} id={panelId} className="categories-menu" role="dialog" aria-modal="false" aria-labelledby={titleId}
          onKeyDown={onPanelKey}>
          <div className="store-container categories-menu-inner">
            <MenuContent titleId={titleId} onNavigate={() => close(false)} columns />
          </div>
        </div>
      )}
      {mobile && (
        <Dialog open={open} onClose={() => close()} variant="drawer-left" labelledBy={titleId}
          className="categories-menu-sheet" closeLabel="Fechar categorias">
          <div className="an-drawer-body">
            <MenuContent titleId={titleId} onNavigate={() => close(false)} columns={false} />
          </div>
        </Dialog>
      )}
    </>
  );
}

/** Mesmo conteúdo para a gaveta do menu do celular (item "Categorias"). */
export function CategoriesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  return (
    <Dialog open={open} onClose={onClose} variant="drawer-left" labelledBy={titleId}
      className="categories-menu-sheet" closeLabel="Fechar categorias">
      <div className="an-drawer-body">
        <MenuContent titleId={titleId} onNavigate={onClose} columns={false} />
      </div>
    </Dialog>
  );
}
