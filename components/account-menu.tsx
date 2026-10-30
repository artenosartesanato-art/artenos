"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, LogOut, UserRound } from "@/components/icons";
import { useMarketplace } from "@/components/marketplace-state";
import { accountLinks, type AccountRole } from "@/lib/navigation";
import { endSession } from "@/lib/session";

/** Papel da conta conectada (admin, loja aprovada ou comprador). */
export function useAccountRole(): AccountRole {
  const { isAdmin, sellerPanelAvailable } = useMarketplace();
  return isAdmin ? "admin" : sellerPanelAvailable ? "seller" : "client";
}

export async function signOutTo(router: ReturnType<typeof useRouter>, href = "/") {
  await endSession("local");
  router.replace(href);
  toast.success("Você saiu da sua conta.");
}

/**
 * Botão da conta no cabeçalho. Conectado, abre um menu com as opções do papel
 * (admin: painel e perfil da administração; loja; comprador) e "Sair".
 */
export function AccountMenu({ label }: { label: string }) {
  const { avatarUrl, displayName } = useMarketplace();
  const role = useAccountRole();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Fecha ao trocar de página, com clique fora e com Esc.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    queueMicrotask(() => setOpen(false));
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="store-account-menu">
      <button ref={buttonRef} type="button" className="store-header-link store-account" onClick={() => setOpen((value) => !value)}
        aria-expanded={open} aria-controls={menuId} aria-label={`Minha conta, ${displayName || (role === "admin" ? "administração" : "perfil")}`}>
        {avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="store-account-avatar" src={avatarUrl} alt="" width={30} height={30} />
          : <UserRound size={21} />}
        <span className="store-account-name">{label}</span>
        <ChevronDown size={13} className={open ? "is-open" : undefined} />
      </button>
      {open && (
        <div id={menuId} className="store-account-dropdown">
          <ul>
            {accountLinks(role).map((link) => (
              <li key={link.href}>
                <Link href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={() => setOpen(false)}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => { setOpen(false); void signOutTo(router); }}>
                <LogOut size={15} /> Sair
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
