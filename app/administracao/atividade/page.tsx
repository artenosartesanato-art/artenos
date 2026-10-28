"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History } from "@/components/icons";
import { AdminPageHead, FilterChips, LoadState, friendlyError } from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { ADMIN_ROLE_LABEL, formatDate, type AdminRole } from "@/lib/admin";

type Entry = {
  created_at: string; area: "loja" | "equipe"; action: string; actor_name: string; subject_name: string;
  status_from: string | null; status_to: string | null; public_note: string | null; internal_note: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  submitted: "Cadastro enviado",
  backfilled: "Loja incluída na fila",
  assigned: "Responsável definido",
  review_started: "Análise iniciada",
  changes_requested: "Correções solicitadas",
  approved: "Loja aprovada",
  rejected: "Cadastro recusado",
  suspended: "Loja suspensa",
  reactivated: "Loja reativada",
  resubmitted: "Cadastro reenviado",
  status_changed: "Situação atualizada",
  granted: "Acesso concedido",
  removed: "Acesso removido",
  activated: "Acesso devolvido",
  deactivated: "Acesso retirado",
  role_changed: "Papel alterado",
};

type Area = "all" | "loja" | "equipe";

export default function ActivityPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [area, setArea] = useState<Area>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await getSupabase().rpc("admin_recent_activity", { p_limit: 150 });
    if (loadError) setError(friendlyError(loadError, "Não foi possível carregar a atividade."));
    else setRows((data ?? []) as Entry[]);
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const visible = useMemo(() => rows.filter((row) => area === "all" || row.area === area), [rows, area]);
  const role = (value: string | null) => value && value in ADMIN_ROLE_LABEL ? ADMIN_ROLE_LABEL[value as AdminRole] : value;

  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Plataforma" title="Atividade"
        description="Registro permanente das decisões sobre lojas e das mudanças na equipe. Não pode ser editado pelo painel." />
      <div className="adm-toolbar">
        <FilterChips label="Área" value={area} onChange={setArea} options={[
          { value: "all", label: "Tudo", count: rows.length },
          { value: "loja", label: "Lojas", count: rows.filter((row) => row.area === "loja").length },
          { value: "equipe", label: "Equipe", count: rows.filter((row) => row.area === "equipe").length },
        ]} />
      </div>
      <LoadState loading={loading} error={error} onRetry={() => void load()}>
        {visible.length ? (
          <ol className="adm-timeline">
            {visible.map((row, index) => (
              <li key={`${row.created_at}-${index}`}>
                <span className={`adm-timeline-dot is-${row.area}`} aria-hidden="true" />
                <div>
                  <strong>{ACTION_LABEL[row.action] ?? "Atualização"} · {row.subject_name}</strong>
                  <small>
                    {row.actor_name} · {formatDate(row.created_at, true)}
                    {row.area === "equipe" && (row.status_from || row.status_to)
                      ? ` · ${[role(row.status_from), role(row.status_to)].filter(Boolean).join(" → ")}` : ""}
                  </small>
                  {row.public_note && <p><b>Para a artesã:</b> {row.public_note}</p>}
                  {row.internal_note && <p className="adm-internal"><b>Nota interna:</b> {row.internal_note}</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="adm-state"><History size={26} /><p>Nenhum registro.</p></div>
        )}
      </LoadState>
    </div>
  );
}
