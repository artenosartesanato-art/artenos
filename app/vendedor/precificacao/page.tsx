"use client";

import {
  Calculator,
  Clock3,
  History,
  LoaderCircle,
  Package,
  Pencil,
  Save,
  Trash2,
  X,
} from "@/components/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import {
  DEFAULT_PAYMENT_FEES,
  PAYMENT_METHOD_LABEL,
  feeBreakdown,
  roundMoney,
  suggestedPrice as priceFor,
  type PaymentFees,
  type PaymentMethod,
} from "@/lib/pricing";
import "./pricing-calculator.css";

type ProductOption = {
  id: string;
  name: string;
};

type Calculation = {
  id: string;
  product_id: string | null;
  product_name: string | null;
  title: string;
  material_cost: number;
  hours_spent: number;
  hourly_rate: number;
  extra_cost: number;
  operational_cost: number;
  margin_percent: number;
  platform_fee_percent: number;
  labor_cost: number;
  production_cost: number;
  desired_profit: number;
  platform_fee_amount: number;
  suggested_price: number;
  payment_method?: PaymentMethod | null;
  payment_fee_percent?: number | null;
  payment_fee_amount?: number | null;
  created_at: string;
};

type PricingForm = {
  title: string;
  productId: string;
  materialCost: string;
  hoursSpent: string;
  hourlyRate: string;
  extraCost: string;
  operationalCost: string;
  marginPercent: string;
  paymentMethod: PaymentMethod;
};

const EMPTY_FORM: PricingForm = {
  title: "",
  productId: "",
  materialCost: "",
  hoursSpent: "",
  hourlyRate: "",
  extraCost: "",
  operationalCost: "",
  marginPercent: "",
  paymentMethod: "card",
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function toNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export default function PricingCalculatorPage() {
  const [form, setForm] = useState<PricingForm>(EMPTY_FORM);
  const [feePercent, setFeePercent] = useState<number | null>(null);
  // Taxas do Mercado Pago (tela Tarifa do painel). null = migração ainda não
  // rodada: a calculadora segue só com a tarifa da Artenós.
  const [paymentFees, setPaymentFees] = useState<PaymentFees | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [history, setHistory] = useState<Calculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function loadCalculator() {
    setLoading(true);
    setLoadError("");
    const supabase = getSupabase();

    try {
      const [settingsResponse, historyResponse, feesResponse] = await Promise.all([
        supabase.rpc("get_pricing_calculator_settings"),
        supabase.rpc("list_my_pricing_calculations", { p_limit: 12 }),
        Promise.resolve(supabase.rpc("get_payment_fee_settings")).catch(() => ({ data: null, error: true })),
      ]);
      const feesRow = (Array.isArray(feesResponse.data) ? feesResponse.data[0] : feesResponse.data) as
        { pix_percent?: number; card_percent?: number } | null;
      setPaymentFees(!feesResponse.error && feesRow
        ? { pix: Number(feesRow.pix_percent ?? DEFAULT_PAYMENT_FEES.pix), card: Number(feesRow.card_percent ?? DEFAULT_PAYMENT_FEES.card) }
        : null);
      if (settingsResponse.error) throw settingsResponse.error;
      if (historyResponse.error) throw historyResponse.error;

      const setting = Array.isArray(settingsResponse.data)
        ? settingsResponse.data[0]
        : settingsResponse.data;
      const configuredFee = Number(setting?.platform_fee_percent);
      if (!Number.isFinite(configuredFee)) {
        throw new Error("Tarifa da plataforma não configurada");
      }

      setFeePercent(configuredFee);
      setHistory((historyResponse.data ?? []) as Calculation[]);
    } catch {
      setFeePercent(null);
      setLoadError(
        "A calculadora está temporariamente indisponível. Tente novamente em instantes.",
      );
    }

    const productsResponse = await supabase.rpc("list_my_product_catalog", {
      p_query: null,
      p_status: "all",
      p_limit: 100,
    });
    if (!productsResponse.error) {
      setProducts(
        ((productsResponse.data ?? []) as ProductOption[]).map((product) => ({
          id: product.id,
          name: product.name,
        })),
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCalculator(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const values = useMemo(() => {
    const materialCost = toNumber(form.materialCost);
    const hoursSpent = toNumber(form.hoursSpent);
    const hourlyRate = toNumber(form.hourlyRate);
    const extraCost = toNumber(form.extraCost);
    const operationalCost = toNumber(form.operationalCost);
    const marginPercent = toNumber(form.marginPercent);
    const laborCost = roundMoney(hoursSpent * hourlyRate);
    const productionCost = roundMoney(
      materialCost + laborCost + extraCost + operationalCost,
    );
    const desiredProfit = roundMoney(
      productionCost * (marginPercent / 100),
    );
    const validFee =
      feePercent !== null && feePercent >= 0 && feePercent < 100;
    const paymentPercent = paymentFees ? paymentFees[form.paymentMethod] : 0;
    const suggestedPrice = validFee
      ? priceFor(productionCost + desiredProfit, feePercent, paymentPercent)
      : 0;
    const breakdown = feeBreakdown(suggestedPrice, validFee ? feePercent : 0, paymentPercent);
    const platformFeeAmount = breakdown.platform;
    const paymentFeeAmount = breakdown.payment;
    // Com este preço, quanto fica com a loja em cada meio de pagamento.
    const byMethod = paymentFees && validFee
      ? (["pix", "card"] as const).map((method) => ({
          method,
          percent: paymentFees[method],
          ...feeBreakdown(suggestedPrice, feePercent, paymentFees[method]),
        }))
      : [];

    return {
      materialCost,
      hoursSpent,
      hourlyRate,
      extraCost,
      operationalCost,
      marginPercent,
      laborCost,
      productionCost,
      desiredProfit,
      platformFeeAmount,
      paymentPercent,
      paymentFeeAmount,
      byMethod,
      suggestedPrice,
    };
  }, [feePercent, paymentFees, form]);

  function setField<Key extends keyof PricingForm>(
    key: Key,
    value: PricingForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    setForm((current) => ({
      ...current,
      productId,
      title: current.title || product?.name || "",
    }));
  }

  function cancelEditing() {
    if (saving) return;
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function editCalculation(calculation: Calculation) {
    setEditingId(calculation.id);
    setForm({
      title: calculation.title,
      productId: calculation.product_id || "",
      materialCost: String(Number(calculation.material_cost)),
      hoursSpent: String(Number(calculation.hours_spent)),
      hourlyRate: String(Number(calculation.hourly_rate)),
      extraCost: String(Number(calculation.extra_cost)),
      operationalCost: String(Number(calculation.operational_cost)),
      marginPercent: String(Number(calculation.margin_percent)),
      paymentMethod: calculation.payment_method === "pix" ? "pix" : "card",
    });
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current?.querySelector<HTMLInputElement>("input")?.focus({
        preventScroll: true,
      });
    });
  }

  async function saveCalculation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || feePercent === null) return;
    if (form.title.trim().length < 2) {
      toast.error("Informe um nome para identificar este cálculo.");
      return;
    }
    if (values.productionCost <= 0) {
      toast.error("Informe ao menos um custo para calcular o preço.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        p_title: form.title.trim(),
        p_material_cost: values.materialCost,
        p_hours_spent: values.hoursSpent,
        p_hourly_rate: values.hourlyRate,
        p_extra_cost: values.extraCost,
        p_operational_cost: values.operationalCost,
        p_margin_percent: values.marginPercent,
        p_product_id: form.productId || null,
        // Só envia quando o banco já conhece as taxas do Mercado Pago.
        ...(paymentFees ? { p_payment_method: form.paymentMethod } : {}),
      };
      const response = editingId
        ? await getSupabase().rpc("update_my_pricing_calculation", {
            p_calculation_id: editingId,
            ...payload,
          })
        : await getSupabase().rpc("save_pricing_calculation", payload);
      if (response.error || (editingId && response.data !== true)) {
        throw response.error ?? new Error("Cálculo não encontrado.");
      }

      toast.success(
        editingId
          ? "Cálculo atualizado no seu histórico."
          : "Cálculo salvo no seu histórico.",
      );
      setEditingId(null);
      setForm(EMPTY_FORM);
      await loadCalculator();
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar o cálculo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteCalculation(calculation: Calculation) {
    if (
      deletingId ||
      !window.confirm(`Excluir o cálculo “${calculation.title}”?`)
    )
      return;

    setDeletingId(calculation.id);
    try {
      const { data, error } = await getSupabase().rpc(
        "delete_my_pricing_calculation",
        { p_id: calculation.id },
      );
      if (error || data !== true) throw error ?? new Error();
      setHistory((current) =>
        current.filter((item) => item.id !== calculation.id),
      );
      if (editingId === calculation.id) cancelEditing();
      toast.success("Cálculo excluído.");
    } catch {
      toast.error("Não foi possível excluir este cálculo.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="pricing-page">
      <header className="pricing-heading">
        <div>
          <p className="seller-eyebrow">Gestão financeira</p>
          <h1>Calculadora de precificação</h1>
          <p>
            Considere materiais, tempo de produção e custos da loja para chegar
            a um preço de venda sustentável.
          </p>
        </div>
        {feePercent !== null && (
          <span>
            Tarifa da Artenós: {percent(feePercent)}
            {paymentFees && <> · Mercado Pago: Pix {percent(paymentFees.pix)}, cartão {percent(paymentFees.card)}</>}
          </span>
        )}
      </header>

      {loadError && (
        <div className="pricing-error" role="alert">
          <strong>Configuração necessária</strong>
          <p>{loadError}</p>
          <button type="button" onClick={loadCalculator}>
            Tentar novamente
          </button>
        </div>
      )}

      <form
        ref={formRef}
        className="pricing-calculator"
        onSubmit={saveCalculation}
      >
        <section className="pricing-inputs" aria-labelledby="pricing-data-title">
          <div className="pricing-section-title">
            <span><Calculator size={20} /></span>
            <div>
              <h2 id="pricing-data-title">
                {editingId ? "Editar cálculo" : "Dados da peça"}
              </h2>
              <p>
                {editingId
                  ? "Altere os valores e confirme para atualizar este registro."
                  : "Preencha os custos reais usados para produzir uma unidade."}
              </p>
            </div>
          </div>

          <div className="pricing-identification">
            <label>
              <span>Nome deste cálculo</span>
              <input
                value={form.title}
                onChange={(event) => setField("title", event.target.value)}
                maxLength={120}
                placeholder="Ex.: Bolsa de crochê média"
                required
              />
            </label>
            <label>
              <span>Produto vinculado (opcional)</span>
              <select
                value={form.productId}
                onChange={(event) => selectProduct(event.target.value)}
              >
                <option value="">Não vincular a um produto</option>
                {products.map((product) => (
                  <option value={product.id} key={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="pricing-fields">
            <MoneyField
              label="Custo de materiais"
              helper="Barbantes, tecidos, tintas e outros insumos"
              value={form.materialCost}
              onChange={(value) => setField("materialCost", value)}
            />
            <NumberField
              label="Tempo gasto na peça"
              suffix="horas"
              value={form.hoursSpent}
              onChange={(value) => setField("hoursSpent", value)}
            />
            <MoneyField
              label="Valor da sua hora de trabalho"
              value={form.hourlyRate}
              onChange={(value) => setField("hourlyRate", value)}
            />
            <MoneyField
              label="Custos extras"
              helper="Embalagem, fitas, etiquetas e outros"
              value={form.extraCost}
              onChange={(value) => setField("extraCost", value)}
            />
            <MoneyField
              label="Custo operacional por produto"
              helper="Energia, ferramentas, aluguel e despesas rateadas"
              value={form.operationalCost}
              onChange={(value) => setField("operationalCost", value)}
            />
            <NumberField
              label="Margem de lucro desejada"
              suffix="%"
              max="1000"
              value={form.marginPercent}
              onChange={(value) => setField("marginPercent", value)}
            />
          </div>

          {paymentFees && (
            <fieldset className="pricing-payment">
              <legend>Taxa do Mercado Pago considerada no preço</legend>
              <p>
                O Mercado Pago retira uma porcentagem de cada venda, que muda conforme o cliente paga.
                Calcular pelo cartão (a mais alta) garante o seu lucro em qualquer pagamento.
              </p>
              <div className="pricing-payment-options">
                {(["card", "pix"] as const).map((method) => (
                  <label key={method} className={form.paymentMethod === method ? "is-selected" : ""}>
                    <input type="radio" name="paymentMethod" value={method}
                      checked={form.paymentMethod === method}
                      onChange={() => setField("paymentMethod", method)} />
                    <span>
                      <strong>{PAYMENT_METHOD_LABEL[method]}</strong>
                      <small>{percent(paymentFees[method])} do preço final{method === "card" ? " · recomendado" : ""}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </section>

        <aside className="pricing-summary" aria-live="polite">
          <h2>Resumo dos valores</h2>
          <dl>
            <SummaryRow label="Materiais" value={values.materialCost} />
            <SummaryRow label="Mão de obra" value={values.laborCost} />
            <SummaryRow label="Custos extras" value={values.extraCost} />
            <SummaryRow
              label="Custo operacional"
              value={values.operationalCost}
            />
            <SummaryRow
              label="Custo de produção total"
              value={values.productionCost}
              strong
            />
            <SummaryRow
              label={`Tarifa da Artenós${feePercent === null ? "" : ` (${percent(feePercent)})`}`}
              value={values.platformFeeAmount}
            />
            {paymentFees && (
              <SummaryRow
                label={`Taxa do Mercado Pago · ${form.paymentMethod === "pix" ? "Pix" : "cartão"} (${percent(values.paymentPercent)})`}
                value={values.paymentFeeAmount}
              />
            )}
            <SummaryRow
              label="Lucro desejado"
              value={values.desiredProfit}
              profit
            />
          </dl>
          <div className="pricing-result">
            <span>Preço de venda sugerido</span>
            <strong>{money.format(values.suggestedPrice)}</strong>
          </div>
          {values.suggestedPrice > 0 && values.byMethod.length > 0 && (
            <div className="pricing-by-method">
              <p>Com o preço de {money.format(values.suggestedPrice)}, em cada venda:</p>
              <ul>
                {values.byMethod.map((row) => (
                  <li key={row.method}>
                    <span>{PAYMENT_METHOD_LABEL[row.method]}</span>
                    <span>
                      sai {money.format(row.platform + row.payment)}
                      <small> (Artenós {money.format(row.platform)} + Mercado Pago {money.format(row.payment)} · {percent(row.percent)})</small>
                    </span>
                    <strong>você recebe {money.format(row.net)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="pricing-formula-note">
            As taxas são porcentagens do preço final da venda: preço = (custo +
            lucro) ÷ (1 − taxas). O frete não entra neste cálculo, mas o Mercado
            Pago também cobra a taxa sobre ele. Parcelamento sem juros tem custo
            extra, que não está incluído aqui.
          </p>
          <div className="pricing-save-actions">
            {editingId && (
              <button
                className="pricing-cancel"
                type="button"
                onClick={cancelEditing}
                disabled={saving}
              >
                <X size={17} /> Cancelar edição
              </button>
            )}
            <button
              className="pricing-save"
              type="submit"
              disabled={saving || loading || feePercent === null}
            >
              {saving ? (
                <LoaderCircle className="seller-spin" size={18} />
              ) : (
                <Save size={18} />
              )}
              {saving
                ? "Salvando..."
                : editingId
                  ? "Atualizar cálculo"
                  : "Salvar cálculo"}
            </button>
          </div>
        </aside>
      </form>

      <section className="pricing-history" aria-labelledby="pricing-history-title">
        <div className="pricing-history-heading">
          <div>
            <span><History size={19} /></span>
            <div>
              <h2 id="pricing-history-title">Histórico de cálculos</h2>
              <p>Os cálculos salvos ficam disponíveis somente para sua loja.</p>
            </div>
          </div>
          <small>{history.length} salvos</small>
        </div>

        {loading ? (
          <div className="pricing-history-state" role="status">
            <LoaderCircle className="seller-spin" size={26} />
            <span>Carregando seus cálculos...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="pricing-history-state">
            <Calculator size={29} />
            <strong>Nenhum cálculo salvo</strong>
            <span>Preencha a calculadora e salve sua primeira precificação.</span>
          </div>
        ) : (
          <div className="pricing-history-list">
            {history.map((calculation) => (
              <article key={calculation.id}>
                <div className="pricing-history-icon">
                  {calculation.product_id ? <Package size={18} /> : <Calculator size={18} />}
                </div>
                <div className="pricing-history-copy">
                  <strong>{calculation.title}</strong>
                  <span>
                    {calculation.product_name
                      ? `Produto: ${calculation.product_name}`
                      : "Cálculo avulso"}
                  </span>
                  <time dateTime={calculation.created_at}>
                    <Clock3 size={13} /> {date.format(new Date(calculation.created_at))}
                  </time>
                </div>
                <div className="pricing-history-values">
                  <span>Custo {money.format(Number(calculation.production_cost))}</span>
                  <strong>{money.format(Number(calculation.suggested_price))}</strong>
                </div>
                <div className="pricing-history-actions">
                  <button
                    type="button"
                    className="is-edit"
                    onClick={() => editCalculation(calculation)}
                    disabled={saving || deletingId === calculation.id}
                    aria-label={`Editar cálculo ${calculation.title}`}
                    title="Editar cálculo"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="is-delete"
                    onClick={() => deleteCalculation(calculation)}
                    disabled={deletingId === calculation.id}
                    aria-label={`Excluir cálculo ${calculation.title}`}
                    title="Excluir cálculo"
                  >
                    {deletingId === calculation.id ? (
                      <LoaderCircle className="seller-spin" size={17} />
                    ) : (
                      <Trash2 size={17} />
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MoneyField({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      {helper && <small>{helper}</small>}
      <div className="pricing-field-affix is-prefix">
        <span>R$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0,00"
        />
      </div>
    </label>
  );
}

function NumberField({
  label,
  suffix,
  max,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  max?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <div className="pricing-field-affix is-suffix">
        <input
          type="number"
          min="0"
          max={max}
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
        />
        <span>{suffix}</span>
      </div>
    </label>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
  profit = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  profit?: boolean;
}) {
  return (
    <div className={`${strong ? "is-strong" : ""}${profit ? " is-profit" : ""}`}>
      <dt>{label}</dt>
      <dd>{money.format(value)}</dd>
    </div>
  );
}
