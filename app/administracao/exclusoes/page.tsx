"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "@/components/icons";
import { AdminPageHead, Badge, LoadState, friendlyError } from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { formatDate } from "@/lib/admin";

type PendingDeletion = {
  user_id: string; full_name: string; email: string; account_type: "client" | "artisan"; store_name: string | null;
  deletion_requested_at: string; deletion_scheduled_at: string;
};

/** Dias até a exclusão definitiva (0 = hoje, o job da madrugada exclui). */
function daysLeft(value: string) {
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

export default function PendingDeletionsPage() {
  const [rows, setRows] = useState<PendingDeletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reactivating, setReactivating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await getSupabase().rpc("admin_list_pending_deletions");
    if (loadError) setError(friendlyError(loadError, "Não foi possível carregar as contas em exclusão."));
    else setRows((data ?? []) as PendingDeletion[]);
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function reactivate(row: PendingDeletion) {
    if (!window.confirm(`Reativar a conta de ${row.full_name} (${row.email})? A pessoa recebe um e-mail avisando.`)) return;
    setReactivating(row.user_id);
    try {
      const { data } = await getSupabase().auth.getSession();
      const response = await fetch("/api/admin/reativar-conta", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ userId: row.user_id }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível reativar a conta.");
      toast.success(`Conta de ${row.full_name} reativada.`);
      await load();
    } catch (reactivateError) {
      toast.error(reactivateError instanceof Error ? reactivateError.message : "Não foi possível reativar a conta.");
    } finally {
      setReactivating(null);
    }
  }

  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Operação" title="Contas em exclusão"
        description="Contas desativadas a pedido da pessoa. Ficam guardadas por 30 dias e depois são excluídas de vez pelo job diário. Reative só quando a própria pessoa pedir, pelo e-mail da conta." />
      <LoadState loading={loading} error={error} onRetry={() => void load()}>
        {rows.length ? (
          <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Contas em exclusão">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Conta</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Pedido em</th>
                  <th scope="col">Exclusão definitiva</th>
                  <th scope="col"><span className="an-visually-hidden">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user_id}>
                    <th scope="row">
                      <span className="adm-stack">
                        <strong>{row.full_name}</strong>
                        <small>{row.account_type === "artisan" ? `Loja${row.store_name ? ` · ${row.store_name}` : ""}` : "Comprador"}</small>
                      </span>
                    </th>
                    <td>{row.email}</td>
                    <td>{formatDate(row.deletion_requested_at, true)}</td>
                    <td>
                      <span className="adm-stack">
                        <span>{formatDate(row.deletion_scheduled_at)}</span>
                        <Badge tone={daysLeft(row.deletion_scheduled_at) <= 3 ? "alert" : "wait"}>
                          {daysLeft(row.deletion_scheduled_at) === 0 ? "hoje" : `em ${daysLeft(row.deletion_scheduled_at)} dias`}
                        </Badge>
                      </span>
                    </td>
                    <td>
                      <button type="button" className="adm-btn adm-btn--ghost" onClick={() => void reactivate(row)}
                        disabled={reactivating !== null} aria-busy={reactivating === row.user_id}>
                        {reactivating === row.user_id && <Loader2 size={15} className="admin-spin" />} Reativar conta
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="adm-state"><Trash2 size={26} /><p>Nenhuma conta em processo de exclusão.</p></div>
        )}
      </LoadState>
    </div>
  );
}
