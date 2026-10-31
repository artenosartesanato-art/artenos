"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Flag } from "@/components/icons";
import { AdminPageHead, Badge, FilterChips, LoadState, friendlyError } from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { formatDate } from "@/lib/admin";

type Status = "open" | "reviewing" | "resolved" | "dismissed" | "all";
type Report = {
  report_id: string; conversation_id: string; reason: string; details: string | null; status: Exclude<Status, "all">;
  admin_note: string | null; created_at: string; reporter_name: string; reporter_role: "loja" | "comprador";
  client_id: string; client_name: string; artisan_id: string; store_name: string;
  recent_messages: { sender_id: string; body: string; created_at: string }[]; blocked_attempts: number;
};

type Suspension = { user_id: string; suspended_until: string };

const REASON: Record<string, string> = {
  ofensa: "Ofensa ou xingamento", assedio: "Assédio ou ameaça", golpe: "Golpe / pagamento por fora", spam: "Spam", outro: "Outro",
};
const STATUS: Record<Exclude<Status, "all">, { label: string; tone: "ok" | "wait" | "alert" | "muted" }> = {
  open: { label: "Aberta", tone: "alert" }, reviewing: { label: "Em análise", tone: "wait" },
  resolved: { label: "Resolvida", tone: "ok" }, dismissed: { label: "Arquivada", tone: "muted" },
};

export default function ReportsPage() {
  const [status, setStatus] = useState<Status>("open");
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [suspensions, setSuspensions] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const supabase = getSupabase();
    const [{ data, error: loadError }, suspended] = await Promise.all([
      supabase.rpc("admin_list_conversation_reports", { p_status: status }),
      // Sem a função no banco (migração não rodada): sem os avisos de suspensão.
      Promise.resolve(supabase.rpc("admin_list_suspensions")).catch(() => ({ data: null })),
    ]);
    if (loadError) setError(friendlyError(loadError, "Não foi possível carregar as denúncias."));
    else setRows((data ?? []) as Report[]);
    setSuspensions(new Map(((suspended.data ?? []) as Suspension[]).map((row) => [row.user_id, row.suspended_until])));
    setLoading(false);
  }, [status]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function decide(report: Report, next: "reviewing" | "resolved" | "dismissed", suspend?: { userId: string; days: number; who: string; store: boolean }) {
    if (suspend && !window.confirm(`Suspender ${suspend.who} por ${suspend.days} dias?\n\n${suspend.store ? "Durante a suspensão a loja sai da vitrine e não pode publicar ou editar peças, alterar a loja, comprar ou enviar mensagens (pedidos já pagos ainda podem ser enviados)." : "Durante a suspensão o comprador pode navegar, mas não compra, não favorita e não envia mensagens."}`)) return;
    const note = next === "reviewing" ? null : window.prompt("Anotação interna (opcional):") ?? null;
    setBusy(report.report_id);
    const { error: saveError } = await getSupabase().rpc("admin_resolve_conversation_report", {
      p_report_id: report.report_id, p_status: next, p_note: note,
      p_suspend_user: suspend?.userId ?? null, p_suspend_days: suspend?.days ?? null,
    });
    setBusy(null);
    if (saveError) return toast.error(friendlyError(saveError, "Não foi possível salvar a decisão."));
    toast.success(suspend ? `${suspend.who[0].toUpperCase()}${suspend.who.slice(1)} suspensa por ${suspend.days} dias.` : "Decisão salva.");
    void load();
  }

  async function lift(report: Report, userId: string, who: string) {
    if (!window.confirm(`Retirar a suspensão de ${who}? A conta volta a funcionar normalmente.`)) return;
    setBusy(report.report_id);
    const { error: liftError } = await getSupabase().rpc("admin_lift_suspension", { p_user_id: userId });
    setBusy(null);
    if (liftError) return toast.error(friendlyError(liftError, "Não foi possível retirar a suspensão."));
    toast.success("Suspensão retirada.");
    void load();
  }

  function participant(report: Report, role: "client" | "store") {
    const userId = role === "client" ? report.client_id : report.artisan_id;
    const who = role === "client" ? `a conta de ${report.client_name}` : `a loja ${report.store_name}`;
    const until = suspensions.get(userId);
    return { userId, who, until, label: role === "client" ? "comprador" : "loja" };
  }

  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Operação" title="Denúncias"
        description="Conversas denunciadas por compradores ou lojas, com as últimas mensagens. Use só para moderação." />
      <div className="adm-toolbar">
        <FilterChips label="Situação" value={status} onChange={setStatus} options={[
          { value: "open", label: "Abertas" }, { value: "reviewing", label: "Em análise" },
          { value: "resolved", label: "Resolvidas" }, { value: "dismissed", label: "Arquivadas" }, { value: "all", label: "Todas" },
        ]} />
      </div>
      <LoadState loading={loading} error={error} onRetry={() => void load()}>
        {rows.length ? (
          <ul className="adm-report-list">
            {rows.map((report) => (
              <li key={report.report_id} className="adm-card adm-report">
                <header className="adm-report-head">
                  <div>
                    <strong>{REASON[report.reason] ?? report.reason}</strong>
                    <small>
                      {report.reporter_name} ({report.reporter_role}) · {formatDate(report.created_at, true)} ·
                      {" "}{report.client_name} × {report.store_name}
                    </small>
                  </div>
                  <Badge tone={STATUS[report.status].tone}>{STATUS[report.status].label}</Badge>
                </header>
                {report.details && <p className="adm-report-details">“{report.details}”</p>}
                {report.blocked_attempts > 0 && (
                  <p className="adm-report-attempts">{report.blocked_attempts} tentativa(s) com termos bloqueados nos últimos 30 dias.</p>
                )}
                <ol className="adm-report-messages" aria-label="Últimas mensagens">
                  {report.recent_messages.map((message, index) => (
                    <li key={index} className={message.sender_id === report.artisan_id ? "is-store" : "is-client"}>
                      <small>{message.sender_id === report.artisan_id ? report.store_name : report.client_name} · {formatDate(message.created_at, true)}</small>
                      <span>{message.body}</span>
                    </li>
                  ))}
                </ol>
                {report.admin_note && <p className="adm-report-note">Anotação: {report.admin_note}</p>}
                {(["client", "store"] as const).map((role) => {
                  const person = participant(report, role);
                  return person.until ? (
                    <p key={role} className="adm-report-suspended">
                      <Badge tone="alert">{role === "client" ? "Comprador suspenso" : "Loja suspensa"}</Badge>
                      {" "}{role === "client" ? report.client_name : report.store_name} até {formatDate(person.until, true)}.
                      {" "}{role === "client"
                        ? "Pode navegar, mas não compra, não favorita e não envia mensagens."
                        : "Fora da vitrine; não publica nem edita peças, não altera a loja e não envia mensagens."}
                    </p>
                  ) : null;
                })}
                <div className="adm-report-actions">
                  {report.status === "open" && (
                    <button type="button" className="adm-btn adm-btn--ghost" disabled={busy === report.report_id}
                      onClick={() => void decide(report, "reviewing")}>Marcar em análise</button>
                  )}
                  {(["client", "store"] as const).map((role) => {
                    const person = participant(report, role);
                    return person.until ? (
                      <button key={role} type="button" className="adm-btn adm-btn--ghost" disabled={busy === report.report_id}
                        onClick={() => void lift(report, person.userId, person.who)}>
                        Retirar suspensão {role === "client" ? "do comprador" : "da loja"}
                      </button>
                    ) : (
                      <button key={role} type="button" className="adm-btn adm-btn--danger" disabled={busy === report.report_id}
                        onClick={() => void decide(report, "resolved", { userId: person.userId, days: 7, who: person.who, store: role === "store" })}>
                        Suspender {person.label} 7 dias
                      </button>
                    );
                  })}
                  {(report.status === "open" || report.status === "reviewing") && (
                    <button type="button" className="adm-btn" disabled={busy === report.report_id}
                      onClick={() => void decide(report, "resolved")}>Resolver sem suspensão</button>
                  )}
                  {report.status !== "dismissed" && report.status !== "resolved" && (
                    <button type="button" className="adm-btn adm-btn--ghost" disabled={busy === report.report_id}
                      onClick={() => void decide(report, "dismissed")}>Arquivar</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="adm-state"><Flag size={26} /><p>Nenhuma denúncia nesta situação.</p></div>
        )}
      </LoadState>
    </div>
  );
}
