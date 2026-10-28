"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, MessageCircle, Palette, ShoppingBag, Truck, X } from "@/components/icons";
import { useMarketplace } from "@/components/marketplace-state";
import { Dialog } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { formatListTime } from "@/lib/message-format";
import {
  badgeText, readOnVisit, titleWithCount, unreadByRef, unreadTotal, upsertNotification,
  MAX_ITEMS, type AppNotification, type NotificationKind,
} from "@/lib/notifications";
import {
  notificationSoundEnabled, playNotificationSound, setNotificationSoundEnabled,
  subscribeNotificationSoundPreference, unlockAudio,
} from "@/lib/ui-sound";

type NotificationsValue = {
  /** false enquanto o banco não tem a tabela (notificacoes.sql não executado). */
  available: boolean;
  items: AppNotification[];
  unread: number;
  unreadByRef: Map<string, number>;
  markRead: (ids?: string[]) => void;
  /** A conversa aberta na tela: mensagens dela não tocam o som cheio nem acumulam. */
  setActiveRef: (ref: string | null) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
};

const NotificationsContext = createContext<NotificationsValue | null>(null);
const COLUMNS = "id, kind, title, body, link, ref_id, unread_count, created_at, read_at";

export function useNotifications() {
  return useContext(NotificationsContext);
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useMarketplace();
  const router = useRouter();
  const pathname = usePathname();
  const [available, setAvailable] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const activeRef = useRef<string | null>(null);
  const openRef = useRef(false);
  const itemsRef = useRef<AppNotification[]>([]);

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const markRead = useCallback((ids?: string[]) => {
    if (ids && ids.length === 0) return;
    const now = new Date().toISOString();
    setItems((current) => current.map((item) =>
      !item.read_at && (!ids || ids.includes(item.id)) ? { ...item, read_at: now } : item));
    void Promise.resolve(getSupabase().rpc("mark_notifications_read", { p_ids: ids ?? null })).catch(() => undefined);
  }, []);

  const setActiveRef = useCallback((ref: string | null) => {
    activeRef.current = ref;
    if (!ref) return;
    const ids = itemsRef.current.filter((item) => !item.read_at && item.ref_id === ref).map((item) => item.id);
    if (ids.length) markRead(ids);
  }, [markRead]);

  // Libera o áudio no primeiro clique/tecla (exigência dos navegadores).
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Carrega as recentes e escuta novas em tempo real.
  useEffect(() => {
    if (!userId) {
      queueMicrotask(() => { setItems([]); setAvailable(false); });
      return;
    }
    let active = true;
    const supabase = getSupabase();

    function alert(row: AppNotification) {
      const visible = document.visibilityState === "visible";
      if (row.ref_id && row.ref_id === activeRef.current && visible) {
        // Já está na conversa: só um toque discreto e o aviso é lido na hora.
        playNotificationSound("soft");
        markRead([row.id]);
        return;
      }
      playNotificationSound(row.kind === "mensagem" ? "message" : "update");
      if (!openRef.current) {
        toast.custom((toastId) => (
          <NotificationToast item={row}
            onOpen={() => { toast.dismiss(toastId); markRead([row.id]); router.push(row.link); }}
            onClose={() => toast.dismiss(toastId)} />
        ), { id: `notificacao-${row.id}`, duration: 7000 });
      }
    }

    void Promise.resolve(supabase.from("notifications").select(COLUMNS)
      .order("created_at", { ascending: false }).limit(MAX_ITEMS))
      .then(({ data, error }) => {
        if (!active) return;
        // Tabela ausente: o recurso fica escondido até o script ser executado.
        if (error) { setAvailable(false); return; }
        setItems((data ?? []) as AppNotification[]);
        setAvailable(true);
      });

    const channel = supabase
      .channel(`notificacoes-${userId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as AppNotification;
          if (!row?.id) return;
          setItems((current) => upsertNotification(current, row));
          // INSERT, ou UPDATE de agrupamento (mais uma mensagem não lida).
          if (!row.read_at) alert(row);
        })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId, router, markRead]);

  // Abrir a página do aviso (ex.: /pedidos) já conta como visto.
  useEffect(() => {
    const ids = readOnVisit(items, pathname);
    if (ids.length) queueMicrotask(() => markRead(ids));
  }, [pathname, items, markRead]);

  const unread = unreadTotal(items);

  // "(3) Artenós" na aba; reaplica após a troca de título de cada rota.
  useEffect(() => {
    const apply = () => {
      const next = titleWithCount(document.title, unread);
      if (next !== document.title) document.title = next;
    };
    apply();
    const timer = window.setTimeout(apply, 300);
    return () => window.clearTimeout(timer);
  }, [unread, pathname]);

  const value = useMemo<NotificationsValue>(() => ({
    available, items, unread, unreadByRef: unreadByRef(items), markRead, setActiveRef, open, setOpen,
  }), [available, items, unread, markRead, setActiveRef, open]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {available && <NotificationsPanel />}
    </NotificationsContext.Provider>
  );
}

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  mensagem: MessageCircle,
  pedido: Truck,
  venda: ShoppingBag,
  encomenda: Palette,
};

/** Aviso flutuante no mesmo desenho do painel (ícone, título, trecho e "Abrir"). */
function NotificationToast({ item, onOpen, onClose }: {
  item: AppNotification; onOpen: () => void; onClose: () => void;
}) {
  const Icon = KIND_ICON[item.kind] ?? Bell;
  return (
    <div className={`notif-toast notif-item--${item.kind}`}>
      <span className="notif-icon" aria-hidden="true"><Icon size={18} /></span>
      <div className="notif-copy">
        <strong className="notif-toast-title">{item.title}</strong>
        {item.body && <span className="notif-text">{item.body}</span>}
      </div>
      <button type="button" className="notif-toast-open" onClick={onOpen}>Abrir</button>
      <button type="button" className="notif-toast-close" onClick={onClose} aria-label="Dispensar aviso">
        <X size={14} />
      </button>
    </div>
  );
}

function useNotificationSound() {
  return useSyncExternalStore(subscribeNotificationSoundPreference, notificationSoundEnabled, () => true);
}

/** Sininho do cabeçalho. Some enquanto o recurso não estiver ativo no banco. */
export function NotificationBell() {
  const notifications = useNotifications();
  if (!notifications?.available) return null;
  const { unread, open, setOpen } = notifications;
  return (
    <button type="button" className="store-header-link store-bell" onClick={() => setOpen(!open)}
      aria-haspopup="dialog" aria-expanded={open}
      aria-label={unread ? `Notificações, ${unread} não ${unread === 1 ? "lida" : "lidas"}` : "Notificações"}>
      <Bell size={21} />
      {unread > 0 && <span className="store-cart-count store-bell-count" aria-hidden="true">{badgeText(unread)}</span>}
    </button>
  );
}

function NotificationsPanel() {
  const router = useRouter();
  const notifications = useNotifications()!;
  const soundOn = useNotificationSound();
  const { items, unread, open, setOpen, markRead } = notifications;

  function follow(item: AppNotification) {
    if (!item.read_at) markRead([item.id]);
    setOpen(false);
    router.push(item.link);
  }

  return (
    <Dialog open={open} onClose={() => setOpen(false)} variant="drawer" labelledBy="notificacoes-titulo"
      className="notif-drawer" closeLabel="Fechar notificações">
      <div className="notif-head">
        <h2 id="notificacoes-titulo">Notificações</h2>
        <p>{unread ? `${unread} não ${unread === 1 ? "lida" : "lidas"}` : "Tudo em dia"}</p>
        <div className="notif-head-actions">
          {unread > 0 && (
            <button type="button" className="notif-link" onClick={() => markRead()}>Marcar todas como lidas</button>
          )}
          <button type="button" role="switch" aria-checked={soundOn} className="an-sound-toggle notif-sound"
            onClick={() => setNotificationSoundEnabled(!soundOn)}>
            <span className="an-sound-toggle-track" aria-hidden="true"><span /></span>
            <span>Som das notificações: {soundOn ? "ligado" : "desligado"}</span>
          </button>
        </div>
      </div>
      <div className="an-drawer-body notif-body">
        {items.length === 0 ? (
          <div className="notif-empty">
            <Bell size={30} />
            <strong>Nenhuma notificação por aqui</strong>
            <p>Avisamos quando chegar uma mensagem ou quando a loja atualizar seu pedido ou encomenda.</p>
          </div>
        ) : (
          <ul className="notif-list">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind] ?? Bell;
              return (
                <li key={item.id}>
                  <button type="button" className={`notif-item notif-item--${item.kind}${item.read_at ? "" : " is-unread"}`}
                    onClick={() => follow(item)}>
                    <span className="notif-icon" aria-hidden="true"><Icon size={18} /></span>
                    <span className="notif-copy">
                      <span className="notif-title">
                        <strong>{item.title}</strong>
                        <time dateTime={item.created_at}>{formatListTime(item.created_at)}</time>
                      </span>
                      {item.body && <span className="notif-text">{item.body}</span>}
                    </span>
                    {!item.read_at && (item.unread_count > 1 ? (
                      <span className="notif-count">
                        {badgeText(item.unread_count)}<span className="an-visually-hidden"> não lidas</span>
                      </span>
                    ) : (
                      <span className="notif-dot"><span className="an-visually-hidden">Não lida</span></span>
                    ))}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
