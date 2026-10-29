"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { LoaderCircle } from "@/components/icons";
import { getSupabase } from "@/lib/supabase";
import "../avaliacoes/reviews.css";
import "./fiscal.css";

type Profile = {
  person_type: "pf" | "pj"; document: string; legal_name: string; tax_regime: string; state_registration: string | null;
  municipal_registration: string | null; cep: string; street: string; number: string; complement: string | null;
  district: string; city: string; state: string; ibge_city_code: string | null;
};
type ProductFiscal = { id: string; name: string; active: boolean; ncm: string | null; cfop: string | null; fiscal_origin: number | null };

const EMPTY: Profile = {
  person_type: "pf", document: "", legal_name: "", tax_regime: "mei", state_registration: "", municipal_registration: "",
  cep: "", street: "", number: "", complement: "", district: "", city: "", state: "", ibge_city_code: "",
};
const REGIMES: Record<string, string> = {
  mei: "MEI", simples_nacional: "Simples Nacional", lucro_presumido: "Lucro Presumido", lucro_real: "Lucro Real", pessoa_fisica: "Pessoa física (sem CNPJ)",
};

function friendly(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (/check constraint|violates/i.test(message)) return "Confira os campos: CPF com 11 números ou CNPJ com 14, CEP com 8 e UF com 2 letras.";
  return message.replace(/^FISCAL:\s*/, "") || fallback;
}

/** Dados para a nota fiscal: da loja (emitente) e de cada peça (NCM/CFOP). */
export default function FiscalDataPage() {
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [products, setProducts] = useState<ProductFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const [profileResponse, productsResponse] = await Promise.all([
      supabase.rpc("get_my_fiscal_profile"), supabase.rpc("list_my_products_fiscal"),
    ]);
    const row = (profileResponse.data ?? [])[0] as Profile | undefined;
    if (row) setProfile({ ...EMPTY, ...row });
    setProducts((productsResponse.data ?? []) as ProductFiscal[]);
    setLoading(false);
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const set = (field: keyof Profile) => (event: { target: { value: string } }) => setProfile((current) => ({ ...current, [field]: event.target.value }));

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const { error } = await getSupabase().rpc("save_my_fiscal_profile", { p: profile });
    setSaving(false);
    if (error) return toast.error(friendly(error, "Não foi possível salvar os dados fiscais."));
    toast.success("Dados fiscais salvos.");
  }

  async function saveProduct(product: ProductFiscal) {
    const { error } = await getSupabase().rpc("set_my_product_fiscal", {
      p_product_id: product.id, p_ncm: product.ncm, p_cfop: product.cfop, p_origin: product.fiscal_origin ?? 0,
    });
    if (error) return toast.error(friendly(error, "Não foi possível salvar a peça."));
    toast.success(`NCM/CFOP de “${product.name}” salvos.`);
  }

  const update = (id: string, patch: Partial<ProductFiscal>) => setProducts((list) => list.map((item) => item.id === id ? { ...item, ...patch } : item));

  return (
    <div className="seller-reviews seller-fiscal">
      <header className="seller-reviews-heading">
        <p className="seller-eyebrow">Gestão da loja</p>
        <h1>Dados fiscais</h1>
        <p>Usados para emitir a nota fiscal de cada venda. Confira com quem cuida da sua contabilidade: NCM e CFOP dependem do produto e do seu enquadramento.</p>
      </header>
      {loading ? <p role="status"><LoaderCircle size={16} className="spin" /> Carregando…</p> : (
        <>
          <form className="seller-fiscal-card" onSubmit={saveProfile}>
            <h2>Emitente (sua loja)</h2>
            <div className="seller-fiscal-grid">
              <label className="an-field"><span>Tipo</span>
                <select value={profile.person_type} onChange={set("person_type")}><option value="pf">Pessoa física (CPF)</option><option value="pj">Pessoa jurídica (CNPJ)</option></select>
              </label>
              <label className="an-field"><span>{profile.person_type === "pj" ? "CNPJ" : "CPF"}</span><input value={profile.document} onChange={set("document")} inputMode="numeric" required /></label>
              <label className="an-field is-wide"><span>{profile.person_type === "pj" ? "Razão social" : "Nome completo"}</span><input value={profile.legal_name} onChange={set("legal_name")} required /></label>
              <label className="an-field"><span>Regime tributário</span>
                <select value={profile.tax_regime} onChange={set("tax_regime")}>{Object.entries(REGIMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              </label>
              <label className="an-field"><span>Inscrição estadual (ou ISENTO)</span><input value={profile.state_registration ?? ""} onChange={set("state_registration")} /></label>
              <label className="an-field"><span>Inscrição municipal</span><input value={profile.municipal_registration ?? ""} onChange={set("municipal_registration")} /></label>
              <label className="an-field"><span>CEP</span><input value={profile.cep} onChange={set("cep")} inputMode="numeric" required /></label>
              <label className="an-field is-wide"><span>Rua</span><input value={profile.street} onChange={set("street")} required /></label>
              <label className="an-field"><span>Número</span><input value={profile.number} onChange={set("number")} required /></label>
              <label className="an-field"><span>Complemento</span><input value={profile.complement ?? ""} onChange={set("complement")} /></label>
              <label className="an-field"><span>Bairro</span><input value={profile.district} onChange={set("district")} required /></label>
              <label className="an-field"><span>Cidade</span><input value={profile.city} onChange={set("city")} required /></label>
              <label className="an-field"><span>UF</span><input value={profile.state} onChange={set("state")} maxLength={2} required /></label>
              <label className="an-field"><span>Código IBGE do município</span><input value={profile.ibge_city_code ?? ""} onChange={set("ibge_city_code")} inputMode="numeric" /></label>
            </div>
            <button type="submit" className="an-btn" disabled={saving} aria-busy={saving}>{saving && <LoaderCircle size={16} className="spin" />} Salvar dados da loja</button>
          </form>

          <section className="seller-fiscal-card" aria-labelledby="pecas-fiscais">
            <h2 id="pecas-fiscais">Peças</h2>
            <p>NCM tem 8 números (ex.: 6913.90.00 para objetos de cerâmica); CFOP tem 4 (ex.: 5102 dentro do estado, 6102 para outro estado). Confirme os códigos com sua contabilidade.</p>
            {products.length ? (
              <div className="seller-fiscal-table" role="region" aria-label="NCM e CFOP das peças" tabIndex={0}>
                <table>
                  <thead><tr><th scope="col">Peça</th><th scope="col">NCM</th><th scope="col">CFOP</th><th scope="col">Origem</th><th scope="col"><span className="an-visually-hidden">Salvar</span></th></tr></thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <th scope="row">{product.name}{!product.active && <small> (rascunho)</small>}</th>
                        <td><input aria-label={`NCM de ${product.name}`} value={product.ncm ?? ""} inputMode="numeric" maxLength={10} onChange={(event) => update(product.id, { ncm: event.target.value })} /></td>
                        <td><input aria-label={`CFOP de ${product.name}`} value={product.cfop ?? ""} inputMode="numeric" maxLength={5} onChange={(event) => update(product.id, { cfop: event.target.value })} /></td>
                        <td>
                          <select aria-label={`Origem de ${product.name}`} value={product.fiscal_origin ?? 0} onChange={(event) => update(product.id, { fiscal_origin: Number(event.target.value) })}>
                            <option value={0}>0 – Nacional</option><option value={1}>1 – Importação direta</option><option value={2}>2 – Estrangeira, mercado interno</option>
                          </select>
                        </td>
                        <td><button type="button" className="an-btn an-btn--secondary an-btn--sm" onClick={() => void saveProduct(product)}>Salvar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p>Nenhuma peça cadastrada.</p>}
          </section>
        </>
      )}
    </div>
  );
}
