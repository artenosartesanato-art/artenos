"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { Calculator, Check, ExternalLink, LoaderCircle, X } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import {
  DEFAULT_PAYMENT_FEES, PAYMENT_METHOD_LABEL, computePricing, feeBreakdown, parsePricingNumber,
  type PaymentFees, type PaymentMethod, type PricingInputs,
} from "@/lib/pricing";

/** Campos como digitados (texto, para aceitar vazio e vírgula). */
export type PricingDraft = {
  materialCost: string;
  hoursSpent: string;
  hourlyRate: string;
  extraCost: string;
  operationalCost: string;
  marginPercent: string;
  paymentMethod: PaymentMethod;
};

/** O que fica guardado para salvar no histórico junto com a peça. */
export type AppliedPricing = { inputs: PricingInputs; paymentMethod: PaymentMethod; price: number };

const EMPTY_DRAFT: PricingDraft = {
  materialCost: "", hoursSpent: "", hourlyRate: "", extraCost: "", operationalCost: "", marginPercent: "", paymentMethod: "card",
};

// Valores que costumam se repetir entre peças (hora, custo fixo, margem):
// lembrados só neste navegador, como conveniência.
const DEFAULTS_KEY = "artenos:precificacao-padroes";
function readDefaults(): Partial<PricingDraft> {
  try {
    const value = JSON.parse(window.localStorage.getItem(DEFAULTS_KEY) || "{}") as Partial<PricingDraft>;
    return {
      hourlyRate: typeof value.hourlyRate === "string" ? value.hourlyRate : "",
      operationalCost: typeof value.operationalCost === "string" ? value.operationalCost : "",
      marginPercent: typeof value.marginPercent === "string" ? value.marginPercent : "",
      paymentMethod: value.paymentMethod === "pix" ? "pix" : "card",
    };
  } catch {
    return {};
  }
}
function writeDefaults(draft: PricingDraft) {
  try {
    window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify({
      hourlyRate: draft.hourlyRate, operationalCost: draft.operationalCost,
      marginPercent: draft.marginPercent, paymentMethod: draft.paymentMethod,
    }));
  } catch { /* sem armazenamento */ }
}

type SavedCalculation = {
  product_id: string | null; material_cost: number; hours_spent: number; hourly_rate: number; extra_cost: number;
  operational_cost: number; margin_percent: number; payment_method?: PaymentMethod | null; created_at: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const asText = (value: number) => (Number(value) ? String(Number(value)) : "");

export function draftToInputs(draft: PricingDraft): PricingInputs {
  return {
    materialCost: parsePricingNumber(draft.materialCost),
    hoursSpent: parsePricingNumber(draft.hoursSpent),
    hourlyRate: parsePricingNumber(draft.hourlyRate),
    extraCost: parsePricingNumber(draft.extraCost),
    operationalCost: parsePricingNumber(draft.operationalCost),
    marginPercent: Math.min(parsePricingNumber(draft.marginPercent), 1000),
  };
}

/**
 * Calculadora de precificação dentro do cadastro da peça (gaveta lateral).
 * Mesma conta da página Precificação (lib/pricing.ts = pricing_compute no banco).
 * "Usar este preço" preenche o preço do produto (ou de todas as variações); o
 * cálculo vai para o histórico da Precificação quando a peça for salva.
 */
export function ProductPricingPanel({ open, onClose, productId, productName, currentPrice, variationCount, applied, onApply }: {
  open: boolean;
  onClose: () => void;
  /** Peça já salva: carrega o último cálculo ligado a ela. */
  productId: string | null;
  productName: string;
  /** Preço que está no formulário agora (menor preço, com variações). */
  currentPrice: number;
  /** Quantas combinações de variação a peça tem (0 = sem variações). */
  variationCount: number;
  /** Cálculo já aplicado nesta edição (reabre com os mesmos valores). */
  applied: AppliedPricing | null;
  onApply: (result: AppliedPricing) => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState<PricingDraft>(EMPTY_DRAFT);
  const [feePercent, setFeePercent] = useState<number | null>(null);
  const [paymentFees, setPaymentFees] = useState<PaymentFees | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [source, setSource] = useState<"applied" | "history" | "defaults" | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    queueMicrotask(() => { if (active) { setLoading(true); setLoadError(""); } });
    const supabase = getSupabase();
    void Promise.all([
      supabase.rpc("get_pricing_calculator_settings"),
      Promise.resolve(supabase.rpc("get_payment_fee_settings")).catch(() => ({ data: null, error: true })),
      productId && !applied
        ? Promise.resolve(supabase.rpc("list_my_pricing_calculations", { p_limit: 50 })).catch(() => ({ data: null, error: true }))
        : Promise.resolve({ data: null, error: null }),
    ]).then(([settings, fees, history]) => {
      if (!active) return;
      const setting = (Array.isArray(settings.data) ? settings.data[0] : settings.data) as { platform_fee_percent?: number } | null;
      const fee = Number(setting?.platform_fee_percent);
      if (settings.error || !Number.isFinite(fee)) {
        setFeePercent(null);
        setLoadError("A tarifa da Artenós não foi carregada. Tente abrir de novo em instantes.");
      } else {
        setFeePercent(fee);
      }
      const feeRow = (Array.isArray(fees.data) ? fees.data[0] : fees.data) as { pix_percent?: number; card_percent?: number } | null;
      setPaymentFees(!fees.error && feeRow
        ? { pix: Number(feeRow.pix_percent ?? DEFAULT_PAYMENT_FEES.pix), card: Number(feeRow.card_percent ?? DEFAULT_PAYMENT_FEES.card) }
        : null);

      // Preenche: o que já foi aplicado nesta edição > último cálculo da peça > padrões deste navegador.
      if (applied) {
        const { inputs } = applied;
        setDraft({
          materialCost: asText(inputs.materialCost), hoursSpent: asText(inputs.hoursSpent), hourlyRate: asText(inputs.hourlyRate),
          extraCost: asText(inputs.extraCost), operationalCost: asText(inputs.operationalCost), marginPercent: asText(inputs.marginPercent),
          paymentMethod: applied.paymentMethod,
        });
        setSource("applied");
      } else {
        const last = Array.isArray(history.data)
          ? (history.data as SavedCalculation[]).find((item) => item.product_id === productId)
          : undefined;
        if (last) {
          setDraft({
            materialCost: asText(last.material_cost), hoursSpent: asText(last.hours_spent), hourlyRate: asText(last.hourly_rate),
            extraCost: asText(last.extra_cost), operationalCost: asText(last.operational_cost), marginPercent: asText(last.margin_percent),
            paymentMethod: last.payment_method === "pix" ? "pix" : "card",
          });
          setSource("history");
        } else {
          setDraft({ ...EMPTY_DRAFT, ...readDefaults() });
          setSource("defaults");
        }
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [open, productId, applied]);

  const inputs = useMemo(() => draftToInputs(draft), [draft]);
  const result = useMemo(() => computePricing(inputs, feePercent, paymentFees, draft.paymentMethod),
    [inputs, feePercent, paymentFees, draft.paymentMethod]);
  const current = currentPrice > 0 && feePercent !== null
    ? feeBreakdown(currentPrice, feePercent, paymentFees ? paymentFees[draft.paymentMethod] : 0)
    : null;
  const costPlusProfit = result.productionCost + result.desiredProfit;
  const canApply = result.suggestedPrice >= 0.01 && !loading && feePercent !== null;

  function setField<Key extends keyof PricingDraft>(key: Key, value: PricingDraft[Key]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function apply() {
    if (!canApply) return;
    writeDefaults(draft);
    onApply({ inputs, paymentMethod: draft.paymentMethod, price: result.suggestedPrice });
  }

  const money2 = (label: string, key: keyof PricingDraft, helper?: string) => (
    <label className="pp-field">
      <span>{label}</span>
      <span className="pp-affix is-prefix">
        <b>R$</b>
        <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" value={draft[key] as string}
          onChange={(event) => setField(key, event.target.value as never)} />
      </span>
      {helper && <small>{helper}</small>}
    </label>
  );
  const number2 = (label: string, key: keyof PricingDraft, suffix: string, max?: string) => (
    <label className="pp-field">
      <span>{label}</span>
      <span className="pp-affix is-suffix">
        <input type="number" min="0" max={max} step="0.01" inputMode="decimal" placeholder="0" value={draft[key] as string}
          onChange={(event) => setField(key, event.target.value as never)} />
        <b>{suffix}</b>
      </span>
    </label>
  );

  return (
    <Dialog open={open} onClose={onClose} variant="drawer" labelledBy={titleId} className="product-pricing-drawer" closeButton={false}>
      <header className="an-drawer-header">
        <div className="pp-heading">
          <span className="pp-heading-icon" aria-hidden="true"><Calculator size={18} /></span>
          <div>
            <h2 id={titleId}>Precificar esta peça</h2>
            <p>{productName.trim() || "Peça sem nome"}</p>
          </div>
        </div>
        <button type="button" className="an-icon-btn" onClick={onClose} aria-label="Fechar precificação"><X size={18} /></button>
      </header>

      <div className="an-drawer-body pp-body">
        {loading ? (
          <p className="pp-status" role="status"><LoaderCircle className="spin" size={18} /> Carregando tarifas…</p>
        ) : (
          <>
            {loadError && <p className="pp-alert" role="alert">{loadError}</p>}
            {source === "history" && <p className="pp-note"><Check size={14} /> Valores do último cálculo salvo para esta peça.</p>}
            {source === "applied" && <p className="pp-note"><Check size={14} /> Cálculo aplicado nesta edição.</p>}

            <div className="pp-grid">
              {money2("Materiais", "materialCost", "Insumos de uma unidade")}
              {number2("Tempo na peça", "hoursSpent", "h")}
              {money2("Valor da sua hora", "hourlyRate")}
              {money2("Custos extras", "extraCost", "Embalagem, etiquetas")}
              {money2("Custo operacional", "operationalCost", "Energia, ferramentas, aluguel")}
              {number2("Margem de lucro", "marginPercent", "%", "1000")}
            </div>

            {paymentFees && (
              <fieldset className="pp-payment">
                <legend>Taxa do Mercado Pago considerada</legend>
                <div>
                  {(["card", "pix"] as const).map((method) => (
                    <label key={method} className={draft.paymentMethod === method ? "is-selected" : undefined}>
                      <input type="radio" name="pp-payment" checked={draft.paymentMethod === method}
                        onChange={() => setField("paymentMethod", method)} />
                      <span>{PAYMENT_METHOD_LABEL[method]} · {percent(paymentFees[method])}{method === "card" ? " (recomendado)" : ""}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <section className="pp-result" aria-live="polite">
              <span>Preço ideal sugerido</span>
              <strong>{money.format(result.suggestedPrice)}</strong>
              {result.suggestedPrice > 0 && (
                <small>
                  Custo {money.format(result.productionCost)} + lucro {money.format(result.desiredProfit)} = {money.format(costPlusProfit)},
                  já com a tarifa da Artenós ({percent(feePercent ?? 0)}){paymentFees ? ` e a taxa do Mercado Pago (${percent(result.paymentPercent)})` : ""}.
                </small>
              )}
            </section>

            {result.suggestedPrice > 0 && (
              <dl className="pp-breakdown">
                <div><dt>Materiais</dt><dd>{money.format(result.materialCost)}</dd></div>
                <div><dt>Mão de obra ({result.hoursSpent.toLocaleString("pt-BR")} h)</dt><dd>{money.format(result.laborCost)}</dd></div>
                <div><dt>Extras + operacional</dt><dd>{money.format(result.extraCost + result.operationalCost)}</dd></div>
                <div><dt>Tarifa da Artenós</dt><dd>− {money.format(result.platformFeeAmount)}</dd></div>
                {paymentFees && <div><dt>Mercado Pago</dt><dd>− {money.format(result.paymentFeeAmount)}</dd></div>}
                <div className="is-profit"><dt>Seu lucro</dt><dd>{money.format(result.desiredProfit)}</dd></div>
              </dl>
            )}

            {current && (
              <p className={`pp-compare${result.suggestedPrice > 0 && currentPrice + 0.009 < result.suggestedPrice ? " is-low" : ""}`}>
                Com o preço atual ({money.format(currentPrice)}) você recebe <strong>{money.format(current.net)}</strong> por venda
                {result.suggestedPrice > 0 && currentPrice + 0.009 < result.suggestedPrice
                  ? <> — abaixo do ideal: faltam {money.format(costPlusProfit - current.net)} para cobrir custo e lucro.</>
                  : result.suggestedPrice > 0 ? <> — cobre o custo e o lucro desejado.</> : "."}
              </p>
            )}
          </>
        )}
      </div>

      <footer className="an-drawer-footer">
        <button type="button" className="an-btn an-btn--lg an-btn--block" onClick={apply} disabled={!canApply} data-autofocus>
          <Check size={18} />
          {variationCount > 0
            ? `Usar ${money.format(result.suggestedPrice)} em todas as ${variationCount} variações`
            : `Usar ${money.format(result.suggestedPrice)} como preço`}
        </button>
        <p className="pp-footnote">
          {variationCount > 0 ? "Depois você pode ajustar o preço de cada variação na tabela. " : ""}
          O cálculo vai para o histórico da <Link href="/vendedor/precificacao" target="_blank" rel="noopener">Precificação <ExternalLink size={12} /></Link> quando você salvar a peça.
        </p>
      </footer>
    </Dialog>
  );
}
