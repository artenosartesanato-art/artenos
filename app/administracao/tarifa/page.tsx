"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Percent, Save } from "@/components/icons";
import { useAdmin } from "@/components/admin-shell";
import { AdminPageHead, LoadState, friendlyError } from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { brl, formatDate } from "@/lib/admin";

export default function PlatformFeePage() {
  const { account } = useAdmin();
  const [fee, setFee] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const owner = account.role === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await getSupabase().rpc("get_admin_platform_fee");
    if (loadError) setError(friendlyError(loadError, "Não foi possível carregar a tarifa."));
    else {
      const setting = (Array.isArray(data) ? data[0] : data) as { platform_fee_percent?: number; updated_at?: string } | null;
      const value = Number(setting?.platform_fee_percent ?? 0);
      setSaved(value);
      setFee(String(value));
      setUpdatedAt(setting?.updated_at ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owner || saving) return;
    const value = Number(fee.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value >= 100) {
      toast.error("Informe uma tarifa entre 0 e 99,99%.");
      return;
    }
    if (!window.confirm(`Definir a tarifa em ${value.toLocaleString("pt-BR")}% para as próximas vendas?`)) return;
    setSaving(true);
    const { data, error: saveError } = await getSupabase().rpc("admin_update_platform_fee", { p_platform_fee_percent: value });
    setSaving(false);
    if (saveError) {
      toast.error(friendlyError(saveError, "Não foi possível atualizar a tarifa."));
      return;
    }
    setSaved(Number(data));
    setFee(String(Number(data)));
    setUpdatedAt(new Date().toISOString());
    toast.success("Tarifa atualizada. Vale só para as próximas vendas.");
  }

  const preview = Number(fee.replace(",", "."));
  const example = Number.isFinite(preview) && preview >= 0 && preview < 100 ? preview : saved ?? 0;
  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Plataforma" title="Tarifa da plataforma"
        description="Percentual que a Artenós retém sobre o valor das peças de cada venda. O frete fica fora e vendas anteriores não são recalculadas." />
      <LoadState loading={loading} error={error} onRetry={() => void load()}>
        <div className="adm-grid-2">
          <form className="adm-card adm-form" onSubmit={save}>
            <h2><Percent size={18} /> Percentual atual</h2>
            <label className="adm-field adm-fee-field">
              <span>Tarifa sobre as peças</span>
              <span className="adm-suffix">
                <input type="number" min="0" max="99.99" step="0.01" inputMode="decimal" value={fee}
                  onChange={(event) => setFee(event.target.value)} disabled={!owner || saving} required />
                <strong>%</strong>
              </span>
            </label>
            {updatedAt && <small>Última alteração: {formatDate(updatedAt, true)}</small>}
            {owner ? (
              <button type="submit" className="adm-btn" disabled={saving || Number(fee) === saved}>
                {saving ? <Loader2 size={15} className="admin-spin" /> : <Save size={15} />} Salvar tarifa
              </button>
            ) : <p className="adm-note">Somente a proprietária pode alterar a tarifa.</p>}
          </form>
          <section className="adm-card" aria-labelledby="simulacao-titulo">
            <h2 id="simulacao-titulo">Como fica numa venda de {brl(100)} em peças</h2>
            <dl className="adm-dl">
              <div><dt>Cliente paga pelas peças</dt><dd>{brl(100)} + frete</dd></div>
              <div><dt>Tarifa da Artenós ({example.toLocaleString("pt-BR")}%)</dt><dd>{brl(example)}</dd></div>
              <div><dt>Repasse da loja</dt><dd>{brl(100 - example)} + frete</dd></div>
            </dl>
            <p className="adm-note">Do repasse ainda sai a taxa do Mercado Pago, que varia com o meio de pagamento (Pix ou cartão).</p>
          </section>
        </div>
      </LoadState>
    </div>
  );
}
