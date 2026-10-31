"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Percent, Save } from "@/components/icons";
import { useAdmin } from "@/components/admin-shell";
import { AdminPageHead, LoadState, friendlyError } from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { brl, formatDate } from "@/lib/admin";
import { feeBreakdown } from "@/lib/pricing";

export default function PlatformFeePage() {
  const { account } = useAdmin();
  const [fee, setFee] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const owner = account.role === "owner";
  // Taxas do Mercado Pago usadas na calculadora de precificação das lojas.
  const [pix, setPix] = useState("");
  const [card, setCard] = useState("");
  const [savedFees, setSavedFees] = useState<{ pix: number; card: number } | null>(null);
  const [savingFees, setSavingFees] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const supabase = getSupabase();
    const [{ data, error: loadError }, fees] = await Promise.all([
      supabase.rpc("get_admin_platform_fee"),
      Promise.resolve(supabase.rpc("get_payment_fee_settings")).catch(() => ({ data: null, error: true })),
    ]);
    const feesRow = (Array.isArray(fees.data) ? fees.data[0] : fees.data) as { pix_percent?: number; card_percent?: number } | null;
    if (!fees.error && feesRow) {
      const next = { pix: Number(feesRow.pix_percent), card: Number(feesRow.card_percent) };
      setSavedFees(next);
      setPix(String(next.pix));
      setCard(String(next.card));
    } else setSavedFees(null);
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

  async function saveFees(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owner || savingFees) return;
    const pixValue = Number(pix.replace(",", "."));
    const cardValue = Number(card.replace(",", "."));
    if (![pixValue, cardValue].every((value) => Number.isFinite(value) && value >= 0 && value < 30)) {
      toast.error("Informe taxas entre 0 e 29,99%.");
      return;
    }
    setSavingFees(true);
    const { error: saveError } = await getSupabase().rpc("admin_update_payment_fees", { p_pix_percent: pixValue, p_card_percent: cardValue });
    setSavingFees(false);
    if (saveError) {
      toast.error(friendlyError(saveError, "Não foi possível atualizar as taxas."));
      return;
    }
    setSavedFees({ pix: pixValue, card: cardValue });
    toast.success("Taxas atualizadas. A calculadora das lojas já usa os novos valores.");
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
            {savedFees && (
              <dl className="adm-dl">
                {(["pix", "card"] as const).map((method) => {
                  const result = feeBreakdown(100, example, savedFees[method]);
                  return (
                    <div key={method}>
                      <dt>{method === "pix" ? "Pago com Pix" : "Pago com cartão"}: Mercado Pago {savedFees[method].toLocaleString("pt-BR")}%</dt>
                      <dd>loja recebe {brl(result.net)}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </section>
        </div>
        {savedFees ? (
          <form className="adm-card adm-form adm-payment-fees" onSubmit={saveFees}>
            <h2><Percent size={18} /> Taxas do Mercado Pago</h2>
            <p className="adm-note">
              Usadas na calculadora de precificação das lojas para mostrar quanto o Mercado Pago retira de cada venda.
              Confira os valores da sua conta no app do Mercado Pago (Seu negócio › Custos) e atualize quando mudarem.
              Elas não alteram cobranças: quem cobra é o próprio Mercado Pago.
            </p>
            <div className="adm-grid-2">
              <label className="adm-field adm-fee-field">
                <span>Pix (vendas online)</span>
                <span className="adm-suffix">
                  <input type="number" min="0" max="29.99" step="0.01" inputMode="decimal" value={pix}
                    onChange={(event) => setPix(event.target.value)} disabled={!owner || savingFees} required />
                  <strong>%</strong>
                </span>
              </label>
              <label className="adm-field adm-fee-field">
                <span>Cartão de crédito à vista</span>
                <span className="adm-suffix">
                  <input type="number" min="0" max="29.99" step="0.01" inputMode="decimal" value={card}
                    onChange={(event) => setCard(event.target.value)} disabled={!owner || savingFees} required />
                  <strong>%</strong>
                </span>
              </label>
            </div>
            {owner ? (
              <button type="submit" className="adm-btn"
                disabled={savingFees || (Number(pix) === savedFees.pix && Number(card) === savedFees.card)}>
                {savingFees ? <Loader2 size={15} className="admin-spin" /> : <Save size={15} />} Salvar taxas
              </button>
            ) : <p className="adm-note">Somente a proprietária pode alterar as taxas.</p>}
          </form>
        ) : null}
      </LoadState>
    </div>
  );
}
