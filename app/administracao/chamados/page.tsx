"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LifeBuoy } from "@/components/icons";
import { AdminPageHead, Badge, FilterChips, LoadState, friendlyError } from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { formatDate } from "@/lib/admin";
import { SUPPORT_TOPICS, type SupportTopic } from "@/lib/support";

type Status = "open" | "answered" | "closed" | "all";
type Ticket = {
  id: string; protocol: string; name: string; email: string; topic: SupportTopic; order_code: string | null;
  message: string; status: Exclude<Status, "all">; created_at: string;
};
const STATUS: Record<Exclude<Status, "all">, { label: string; tone: "ok" | "wait" | "alert" | "muted" }> = {
  open: { label: "Aberto", tone: "alert" }, answered: { label: "Respondido", tone: "wait" }, closed: { label: "Encerrado", tone: "muted" },
};

export default function SupportTicketsPage() {
  const [status, setStatus] = useState<Status>("open");
  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await getSupabase().rpc("admin_list_support_tickets", { p_status: status });
    if (loadError) setError(friendlyError(loadError, "Não foi possível carregar os chamados."));
    else setRows((data ?? []) as Ticket[]);
    setLoading(false);
  }, [status]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function setTicketStatus(ticket: Ticket, next: Exclude<Status, "all">) {
    const { error: saveError } = await getSupabase().rpc("admin_set_support_ticket_status", { p_id: ticket.id, p_status: next });
    if (saveError) return toast.error(friendlyError(saveError, "Não foi possível atualizar o chamado."));
    void load();
  }

  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Operação" title="Chamados"
        description="Mensagens da Central de Ajuda. Responda pelo e-mail da pessoa, citando o protocolo, e marque o chamado aqui." />
      <div className="adm-toolbar">
        <FilterChips label="Situação" value={status} onChange={setStatus} options={[
          { value: "open", label: "Abertos" }, { value: "answered", label: "Respondidos" },
          { value: "closed", label: "Encerrados" }, { value: "all", label: "Todos" },
        ]} />
      </div>
      <LoadState loading={loading} error={error} onRetry={() => void load()}>
        {rows.length ? (
          <ul className="adm-report-list">
            {rows.map((ticket) => (
              <li key={ticket.id} className="adm-card adm-report">
                <header className="adm-report-head">
                  <div>
                    <strong>{ticket.protocol} · {SUPPORT_TOPICS[ticket.topic] ?? ticket.topic}</strong>
                    <small>{ticket.name} · <a href={`mailto:${ticket.email}?subject=${encodeURIComponent(`Re: protocolo ${ticket.protocol}`)}`}>{ticket.email}</a>
                      {ticket.order_code ? ` · pedido ${ticket.order_code}` : ""} · {formatDate(ticket.created_at, true)}</small>
                  </div>
                  <Badge tone={STATUS[ticket.status].tone}>{STATUS[ticket.status].label}</Badge>
                </header>
                <p className="adm-report-details" style={{ whiteSpace: "pre-line" }}>{ticket.message}</p>
                <div className="adm-report-actions">
                  {ticket.status !== "answered" && <button type="button" className="adm-btn" onClick={() => void setTicketStatus(ticket, "answered")}>Marcar respondido</button>}
                  {ticket.status !== "closed" && <button type="button" className="adm-btn adm-btn--ghost" onClick={() => void setTicketStatus(ticket, "closed")}>Encerrar</button>}
                  {ticket.status !== "open" && <button type="button" className="adm-btn adm-btn--ghost" onClick={() => void setTicketStatus(ticket, "open")}>Reabrir</button>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="adm-state"><LifeBuoy size={26} /><p>Nenhum chamado nesta situação.</p></div>
        )}
      </LoadState>
    </div>
  );
}
