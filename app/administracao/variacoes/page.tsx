"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPageHead, Badge, FilterChips, LoadState, friendlyError } from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { formatDate } from "@/lib/admin";

type Status = "pending" | "approved" | "hidden" | "all";
type Review = {
  id: string; product_id: string; product_name: string; product_active: boolean; artisan_id: string; store_name: string | null;
  variation_type: string; option_text: string; status: Exclude<Status, "all">; created_at: string; reviewed_at: string | null;
};

const STATUS: Record<Exclude<Status, "all">, { label: string; tone: "ok" | "wait" | "alert" }> = {
  pending: { label: "Aguardando", tone: "wait" }, approved: { label: "Aprovada", tone: "ok" }, hidden: { label: "Recusada", tone: "alert" },
};

/**
 * Opções de variação em texto livre (Estampa, Modelo, Aroma). Os outros tipos
 * só aceitam listas fechadas ou números; estes passam pelo filtro de termos e
 * chegam aqui para a equipe conferir.
 */
export default function VariationReviewsPage() {
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await getSupabase().rpc("admin_list_variation_reviews", { p_status: status === "all" ? null : status });
    if (loadError) {
      setError(/admin_list_variation_reviews/.test(loadError.message)
        ? "A revisão de variações ainda não foi ativada no banco: rode a migração 20261116_variacoes_padronizadas.sql."
        : friendlyError(loadError, "Não foi possível carregar as variações."));
    } else setRows((data ?? []) as Review[]);
    setLoading(false);
  }, [status]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function decide(review: Review, action: "approve" | "hide") {
    if (action === "hide" && !window.confirm(
      `Recusar “${review.option_text}” (${review.variation_type})?\n\nA peça “${review.product_name}” sai da vitrine e a loja é avisada. Ela só volta a publicar depois de remover ou trocar a opção.`)) return;
    setBusy(review.id);
    const { error: saveError } = await getSupabase().rpc("admin_review_variation_text", { p_review_id: review.id, p_action: action });
    setBusy(null);
    if (saveError) return toast.error(friendlyError(saveError, "Não foi possível salvar a decisão."));
    toast.success(action === "approve" ? "Opção aprovada." : "Opção recusada: a peça saiu da vitrine e a loja foi avisada.");
    void load();
  }

  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Operação" title="Variações"
        description="Nomes de Estampa, Modelo e Aroma escritos pelas lojas. Cor, Tamanho, Comprimento, Quantidade e Material só aceitam opções da lista ou números." />
      <div className="adm-toolbar">
        <FilterChips label="Situação" value={status} onChange={setStatus} options={[
          { value: "pending", label: "Aguardando" }, { value: "approved", label: "Aprovadas" },
          { value: "hidden", label: "Recusadas" }, { value: "all", label: "Todas" },
        ]} />
      </div>
      <LoadState loading={loading} error={error} onRetry={() => void load()}>
        {rows.length ? (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>Opção</th><th>Tipo</th><th>Peça</th><th>Loja</th><th>Enviada</th><th>Situação</th><th aria-label="Ações" /></tr>
              </thead>
              <tbody>
                {rows.map((review) => (
                  <tr key={review.id}>
                    <td><strong>{review.option_text}</strong></td>
                    <td>{review.variation_type}</td>
                    <td>
                      {review.product_name}
                      {!review.product_active && <small> (fora da vitrine)</small>}
                    </td>
                    <td>{review.store_name ?? "—"}</td>
                    <td>{formatDate(review.created_at, true)}</td>
                    <td><Badge tone={STATUS[review.status].tone}>{STATUS[review.status].label}</Badge></td>
                    <td>
                      <div className="adm-row-actions">
                        {review.status !== "approved" && review.status !== "hidden" && (
                          <button type="button" className="adm-btn adm-btn--ghost" disabled={busy === review.id}
                            onClick={() => void decide(review, "approve")}>Aprovar</button>
                        )}
                        {review.status !== "hidden" && (
                          <button type="button" className="adm-btn adm-btn--danger" disabled={busy === review.id}
                            onClick={() => void decide(review, "hide")}>Recusar e tirar da vitrine</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="adm-empty-line">{status === "pending" ? "Nenhuma opção aguardando revisão." : "Nada por aqui."}</p>}
      </LoadState>
    </div>
  );
}
