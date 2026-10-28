"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "@/components/icons";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])", "textarea:not([disabled])", "summary", "[tabindex]:not([tabindex='-1'])",
].join(",");

// Mantém a duração da saída alinhada a --an-dur-base em globals.css.
const EXIT_MS = 240;

type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** id do título visível; use `label` quando não houver título. */
  labelledBy?: string;
  label?: string;
  describedBy?: string;
  variant?: "dialog" | "drawer" | "drawer-left";
  className?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Exibe o botão de fechar no canto. */
  closeButton?: boolean;
  closeLabel?: string;
  children: ReactNode;
};

// Pilha global: só o diálogo do topo fica interativo; todo o resto é inerte.
const stack: HTMLElement[] = [];
const inertByUs = new Set<HTMLElement>();
let savedOverflow = "";
let savedPadding = "";

// Último elemento focado fora do <body>: um botão desabilitado durante o envio
// perde o foco, mas continua sendo a origem lógica do diálogo.
let lastFocused: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (event) => {
    if (event.target instanceof HTMLElement && event.target !== document.body) lastFocused = event.target;
  });
}

function syncInert() {
  const top = stack[stack.length - 1];
  inertByUs.forEach((element) => { element.inert = false; });
  inertByUs.clear();
  if (!top) return;
  Array.from(document.body.children).forEach((child) => {
    const element = child as HTMLElement;
    if (element === top || element.inert || ["SCRIPT", "NEXT-ROUTE-ANNOUNCER"].includes(element.tagName)) return;
    if (element.hasAttribute("data-sonner-toaster") || element.querySelector("[data-sonner-toaster]")) return;
    element.inert = true;
    inertByUs.add(element);
  });
}
type PanelWithOrigin = HTMLElement & { __anReturnFocus?: HTMLElement | null };
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Diálogo modal acessível: foco preso, Escape, bloqueio de rolagem, fundo
 * inerte, retorno do foco à origem e animação de entrada e saída. Em
 * `prefers-reduced-motion` as transições são anuladas pelo CSS global.
 */
export function Dialog({
  open, onClose, labelledBy, label, describedBy, variant = "dialog", className = "",
  initialFocus, closeButton = true, closeLabel = "Fechar", children,
}: DialogProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const fallbackFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useIsomorphicLayoutEffect(() => { onCloseRef.current = onClose; });

  // Monta ao abrir e só desmonta depois da animação de saída.
  useEffect(() => {
    if (open) {
      const active = document.activeElement as HTMLElement | null;
      const origin = active && active !== document.body ? active : lastFocused;
      returnFocus.current = origin;
      // Aberto a partir de outro diálogo que pode fechar antes: guarda também
      // o elemento que abriu aquele diálogo.
      const parentPanel = origin?.closest(".an-dialog") as PanelWithOrigin | null;
      fallbackFocus.current = parentPanel?.__anReturnFocus ?? null;
      const mount = window.setTimeout(() => setMounted(true), 0);
      // Dois quadros garantem que o estado "closed" foi pintado antes de "open".
      let frame = 0;
      const timer = window.setTimeout(() => {
        frame = requestAnimationFrame(() => setVisible(true));
      }, 16);
      return () => { window.clearTimeout(mount); window.clearTimeout(timer); cancelAnimationFrame(frame); };
    }
    const hide = window.setTimeout(() => setVisible(false), 0);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const unmount = window.setTimeout(() => setMounted(false), reduced ? 0 : EXIT_MS);
    return () => { window.clearTimeout(hide); window.clearTimeout(unmount); };
  }, [open]);

  // Fundo inerte, rolagem bloqueada e foco inicial enquanto estiver montado.
  useEffect(() => {
    if (!mounted) return;
    const root = overlayRef.current?.parentElement;
    if (!root) return;
    if (stack.length === 0) {
      savedOverflow = document.body.style.overflow;
      savedPadding = document.body.style.paddingRight;
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    }
    stack.push(root);
    syncInert();
    if (panelRef.current) (panelRef.current as PanelWithOrigin).__anReturnFocus = returnFocus.current;
    const focusTarget = initialFocus?.current ??
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      panelRef.current;
    focusTarget?.focus({ preventScroll: true });
    return () => {
      const index = stack.indexOf(root);
      if (index >= 0) stack.splice(index, 1);
      syncInert();
      if (stack.length === 0) {
        document.body.style.overflow = savedOverflow;
        document.body.style.paddingRight = savedPadding;
      }
      const target = [returnFocus.current, fallbackFocus.current]
        .find((element) => element && document.contains(element) && !element.closest("[inert]"));
      target?.focus({ preventScroll: true });
    };
  }, [mounted, initialFocus]);

  useEffect(() => {
    if (!mounted) return;
    function onKeyDown(event: KeyboardEvent) {
      const root = overlayRef.current?.parentElement;
      if (root && stack[stack.length - 1] !== root) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (items.length === 0) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mounted]);

  if (!mounted || typeof document === "undefined") return null;
  const drawer = variant !== "dialog";
  return createPortal(
    <div data-an-dialog-root="">
      <div
        ref={overlayRef}
        className={`an-overlay${drawer ? " an-overlay--drawer" : ""}${variant === "drawer-left" ? " an-overlay--drawer-left" : ""}`}
        data-state={visible && open ? "open" : "closed"}
        onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseRef.current(); }}
      >
        <div
          ref={panelRef}
          className={`an-dialog${drawer ? " an-drawer" : ""} ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : label}
          aria-describedby={describedBy}
          tabIndex={-1}
        >
          {closeButton && (
            <button type="button" className="an-icon-btn an-dialog-close" onClick={() => onCloseRef.current()} aria-label={closeLabel}>
              <X size={18} />
            </button>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
