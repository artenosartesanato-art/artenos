"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  Heart,
  ImagePlus,
  LoaderCircle,
  MapPin,
  PackageCheck,
  PackageOpen,
  PauseCircle,
  Save,
  Sparkles,
  Store,
  Tags,
  Truck,
  Trash2,
} from "@/components/icons";
import Link from "next/link";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { meaningfulTextError } from "@/lib/text-quality";
import { findBlockedTerm, moderationError } from "@/lib/moderation";
import { specialtyValueError } from "@/lib/store-specialties";
import { SpecialtyField } from "@/components/specialty-field";
import { StoreLogoEditor } from "@/components/store-logo-editor";
import { HEIC_HELP, IMAGE_EXT, IMAGE_MIME, PickedFileError, detectImage, readPickedFile } from "@/lib/image-file";
import {
  useSellerProfile,
  useSellerProfileActions,
} from "@/components/seller-shell";
import "./store-panel.css";

type StoreData = {
  artisan_id: string;
  full_name: string;
  email: string;
  store_name: string;
  specialty: string;
  story: string;
  city: string;
  state: string;
  announcement: string | null;
  production_time_days: number;
  accepts_custom_orders: boolean;
  vacation_mode: boolean;
  cover_path: string | null;
  updated_at: string;
};

type StoreForm = {
  storeName: string;
  specialty: string;
  story: string;
  announcement: string;
  shippingOriginCep: string;
  productionTimeDays: string;
  acceptsCustomOrders: boolean;
  vacationMode: boolean;
};

type StoreOverview = {
  total_products: number;
  published_products: number;
  paused_products: number;
  out_of_stock_products: number;
  ready_to_ship_products: number;
  favorite_count: number;
};

type StoreProduct = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  stock: number | null;
  ready_to_ship: boolean;
  active: boolean;
  category_name: string | null;
};

const STORE_BUCKET = "artenos-store-assets";
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const emptyForm: StoreForm = {
  storeName: "",
  specialty: "",
  story: "",
  announcement: "",
  shippingOriginCep: "",
  productionTimeDays: "7",
  acceptsCustomOrders: true,
  vacationMode: false,
};
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function storeInitials(name: string) {
  return name.split(/\s+/).filter((word) => word.length > 2).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "A";
}

function publicCoverUrl(path: string | null) {
  if (!path) return "";
  return getSupabase().storage.from(STORE_BUCKET).getPublicUrl(path).data
    .publicUrl;
}

export default function StorePanelPage() {
  const seller = useSellerProfile();
  const updateSellerProfile = useSellerProfileActions();
  const [store, setStore] = useState<StoreData | null>(null);
  const [overview, setOverview] = useState<StoreOverview | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [form, setForm] = useState<StoreForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function loadStore() {
    setLoading(true);
    setError("");
    try {
      const supabase = getSupabase();
      const [
        storeResponse,
        overviewResponse,
        productsResponse,
        shippingOriginResponse,
      ] =
        await Promise.all([
          supabase.rpc("get_my_artisan_store"),
          supabase.rpc("get_my_store_overview"),
          supabase.rpc("list_my_store_products", { p_limit: 6 }),
          supabase.rpc("get_my_shipping_origin"),
        ]);
      if (
        storeResponse.error ||
        overviewResponse.error ||
        productsResponse.error ||
        shippingOriginResponse.error
      )
        throw (
          storeResponse.error ||
          overviewResponse.error ||
          productsResponse.error ||
          shippingOriginResponse.error
        );
      const current = (
        Array.isArray(storeResponse.data)
          ? storeResponse.data[0]
          : storeResponse.data
      ) as StoreData | undefined;
      if (!current) throw new Error("Loja não encontrada.");
      const shippingOrigin = (
        Array.isArray(shippingOriginResponse.data)
          ? shippingOriginResponse.data[0]
          : shippingOriginResponse.data
      ) as { shipping_origin_cep?: string } | undefined;
      setStore(current);
      setOverview(
        (Array.isArray(overviewResponse.data)
          ? overviewResponse.data[0]
          : overviewResponse.data) as StoreOverview,
      );
      setProducts((productsResponse.data || []) as StoreProduct[]);
      setForm({
        storeName: current.store_name || "",
        specialty: current.specialty || "",
        story: current.story || "",
        announcement: current.announcement || "",
        shippingOriginCep:
          shippingOrigin?.shipping_origin_cep || seller?.cep || "",
        productionTimeDays: String(current.production_time_days || 7),
        acceptsCustomOrders: current.accepts_custom_orders,
        vacationMode: current.vacation_mode,
      });
    } catch {
      setError(
        "Não foi possível carregar os dados da loja agora. Confira sua conexão e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Adia o carregamento para fora do corpo do efeito (evita renderização em cascata).
    const timer = window.setTimeout(() => void loadStore(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coverUrl = useMemo(
    () => publicCoverUrl(store?.cover_path || null),
    [store?.cover_path],
  );

  function setField<Key extends keyof StoreForm>(
    key: Key,
    value: StoreForm[Key],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function saveStore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const productionDays = Number(form.productionTimeDays);
    const shippingOriginCep = form.shippingOriginCep.replace(/\D/g, "");
    if (form.storeName.trim().length < 3)
      return toast.error("O nome da loja precisa ter pelo menos 3 caracteres.");
    const specialtyProblem = specialtyValueError(form.specialty);
    if (specialtyProblem) return toast.error(specialtyProblem);
    const storyError = meaningfulTextError(form.story, "A história da loja");
    if (storyError) return toast.error(storyError);
    if (findBlockedTerm(`${form.storeName} ${form.specialty} ${form.story} ${form.announcement}`))
      return toast.error("O nome, a especialidade, a história ou o aviso da loja contém termos que não são permitidos na Artenós.");
    if (
      !Number.isInteger(productionDays) ||
      productionDays < 1 ||
      productionDays > 180
    )
      return toast.error("Informe um prazo entre 1 e 180 dias.");
    if (shippingOriginCep.length !== 8)
      return toast.error("Informe um CEP de origem com 8 números.");

    setSaving(true);
    try {
      const supabase = getSupabase();
      const storeUpdate = await supabase.rpc("update_my_artisan_store", {
        p_store_name: form.storeName.trim(),
        p_specialty: form.specialty.trim(),
        p_story: form.story.trim(),
        p_announcement: form.announcement.trim() || null,
        p_production_time_days: productionDays,
        p_accepts_custom_orders: form.acceptsCustomOrders,
        p_vacation_mode: form.vacationMode,
      });
      if (storeUpdate.error) throw storeUpdate.error;

      const originUpdate = await supabase.rpc("update_my_shipping_origin", {
        p_cep: shippingOriginCep,
      });
      if (originUpdate.error) throw originUpdate.error;
      setStore((previous) =>
        previous
          ? {
              ...previous,
              store_name: form.storeName.trim(),
              specialty: form.specialty.trim(),
              story: form.story.trim(),
              announcement: form.announcement.trim() || null,
              production_time_days: productionDays,
              accepts_custom_orders: form.acceptsCustomOrders,
              vacation_mode: form.vacationMode,
              updated_at: new Date().toISOString(),
            }
          : previous,
      );
      updateSellerProfile({
        store_name: form.storeName.trim(),
        specialty: form.specialty.trim(),
      });
      setField("shippingOriginCep", shippingOriginCep);
      toast.success("Informações da loja salvas.");
    } catch (error) {
      toast.error(
        moderationError(error) ??
          "Não foi possível salvar as alterações da loja. Tente novamente; seus textos continuam no formulário.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadCover(event: React.ChangeEvent<HTMLInputElement>) {
    if (!store || uploading) {
      event.currentTarget.value = "";
      return;
    }
    // Lê a foto antes de limpar o campo (Android: a permissão da galeria é temporária).
    const file = await readPickedFile(event.currentTarget).catch((error: unknown) => {
      toast.error(error instanceof PickedFileError ? `O celular não liberou a leitura desta foto. Tente escolher de novo (${error.reason}).` : "Não foi possível abrir a foto.");
      return null;
    });
    if (!file) return;
    // Formato pelo conteúdo: alguns celulares mandam a foto sem o tipo.
    const kind = await detectImage(file);
    if (kind === "heic") return toast.error(HEIC_HELP);
    if (!kind) return toast.error("Escolha uma imagem JPG, PNG ou WebP.");
    const extension = IMAGE_EXT[kind];
    if (file.size > MAX_COVER_BYTES)
      return toast.error("A imagem deve ter no máximo 5 MB.");

    const oldPath = store.cover_path;
    const newPath = `${store.artisan_id}/cover-${crypto.randomUUID()}.${extension}`;
    setUploading(true);
    try {
      const supabase = getSupabase();
      const { error: uploadError } = await supabase.storage
        .from(STORE_BUCKET)
        .upload(newPath, file, {
          contentType: IMAGE_MIME[kind],
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { error: saveError } = await supabase.rpc("set_my_store_cover", {
        p_cover_path: newPath,
      });
      if (saveError) {
        await supabase.storage.from(STORE_BUCKET).remove([newPath]);
        throw saveError;
      }
      setStore((previous) =>
        previous ? { ...previous, cover_path: newPath } : previous,
      );
      if (oldPath) await supabase.storage.from(STORE_BUCKET).remove([oldPath]);
      toast.success("Capa da loja atualizada.");
    } catch {
      toast.error(
        "Não foi possível enviar a capa. Use JPG, PNG ou WebP e tente novamente.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function removeCover() {
    if (
      !store?.cover_path ||
      uploading ||
      !window.confirm("Remover a imagem de capa da loja?")
    )
      return;
    const oldPath = store.cover_path;
    setUploading(true);
    try {
      const supabase = getSupabase();
      const { error: saveError } = await supabase.rpc("set_my_store_cover", {
        p_cover_path: null,
      });
      if (saveError) throw saveError;
      setStore((previous) =>
        previous ? { ...previous, cover_path: null } : previous,
      );
      const { error: deleteError } = await supabase.storage
        .from(STORE_BUCKET)
        .remove([oldPath]);
      if (deleteError)
        toast.info(
          "A capa foi removida da loja, mas o arquivo antigo ainda precisa ser limpo no Storage.",
        );
      else toast.success("Capa removida.");
    } catch {
      toast.error("Não foi possível remover a capa.");
    } finally {
      setUploading(false);
    }
  }

  if (loading)
    return (
      <section className="store-panel-state" role="status">
        <LoaderCircle className="seller-spin" size={28} />
        <strong>Carregando sua loja...</strong>
      </section>
    );
  if (error || !store)
    return (
      <section className="store-panel-state is-error">
        <Store size={32} />
        <h1>Painel da loja indisponível</h1>
        <p>{error}</p>
        <button type="button" onClick={loadStore}>
          Tentar novamente
        </button>
      </section>
    );

  return (
    <div className="store-panel-page">
      <div className="store-panel-heading">
        <div>
          <p className="seller-eyebrow">Gestão da loja</p>
          <h1>Minha loja</h1>
          <p>
            Acompanhe sua vitrine e atualize as informações exibidas aos
            clientes.
          </p>
        </div>
        <div className="store-heading-actions">
          <span>
            <CheckCircle2 size={17} /> Loja aprovada
          </span>
          <Link
            href={`/loja?id=${encodeURIComponent(store.artisan_id)}`}
            target="_blank"
          >
            Ver como cliente <ExternalLink size={15} />
          </Link>
        </div>
      </div>

      <section className="store-overview-grid" aria-label="Resumo da loja">
        <article>
          <span>
            <Tags size={19} />
          </span>
          <div>
            <strong>{overview?.total_products ?? 0}</strong>
            <small>Produtos cadastrados</small>
          </div>
        </article>
        <article>
          <span>
            <PackageCheck size={19} />
          </span>
          <div>
            <strong>{overview?.published_products ?? 0}</strong>
            <small>Publicados na vitrine</small>
          </div>
        </article>
        <article>
          <span>
            <Archive size={19} />
          </span>
          <div>
            <strong>{overview?.out_of_stock_products ?? 0}</strong>
            <small>Sem estoque</small>
          </div>
        </article>
        <article>
          <span>
            <Heart size={19} />
          </span>
          <div>
            <strong>{overview?.favorite_count ?? 0}</strong>
            <small>Favoritos recebidos</small>
          </div>
        </article>
      </section>

      <section className="store-cover-card">
        <div
          className="store-cover-image"
          style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
        >
          {!coverUrl && (
            <>
              <ImagePlus size={34} />
              <span>Nenhuma capa cadastrada</span>
            </>
          )}
        </div>
        <div>
          <h2>Imagem de capa</h2>
          <p>Use uma foto horizontal que represente o trabalho da sua loja.</p>
          <div className="store-cover-actions">
            <label>
              {uploading ? (
                <LoaderCircle className="seller-spin" size={16} />
              ) : (
                <Camera size={16} />
              )}
              {uploading
                ? "Enviando..."
                : coverUrl
                  ? "Trocar capa"
                  : "Adicionar capa"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={uploadCover}
                disabled={uploading}
              />
            </label>
            {coverUrl && (
              <button type="button" onClick={removeCover} disabled={uploading}>
                <Trash2 size={15} /> Remover
              </button>
            )}
          </div>
          <small>JPG, PNG ou WebP · até 5 MB</small>
        </div>
      </section>

      {store && (
        <StoreLogoEditor
          artisanId={store.artisan_id}
          initials={storeInitials(form.storeName || store.store_name || "")}
        />
      )}

      <div className="store-panel-grid">
        <form className="store-settings-form" onSubmit={saveStore}>
          <section className="store-form-card">
            <div className="store-form-title">
              <Store size={20} />
              <div>
                <h2>Identidade da loja</h2>
                <p>Informações públicas que apresentam o seu trabalho.</p>
              </div>
            </div>
            <div className="store-form-fields">
              <label>
                <span>Nome da loja</span>
                <input
                  value={form.storeName}
                  onChange={(event) =>
                    setField("storeName", event.target.value)
                  }
                  minLength={3}
                  maxLength={80}
                  required
                />
              </label>
              <SpecialtyField
                value={form.specialty}
                onChange={(value) => setField("specialty", value)}
              />
              <label className="is-wide">
                <span>História da loja</span>
                <textarea
                  value={form.story}
                  onChange={(event) => setField("story", event.target.value)}
                  minLength={40}
                  maxLength={1200}
                  rows={7}
                  required
                />
                <small>{form.story.length}/1200 caracteres</small>
              </label>
            </div>
          </section>

          <section className="store-form-card">
            <div className="store-form-title">
              <Truck size={20} />
              <div>
                <h2>Origem das postagens</h2>
                <p>
                  Este CEP será usado para calcular o frete dos produtos da
                  sua loja.
                </p>
              </div>
            </div>
            <div className="store-form-fields">
              <label>
                <span>CEP de origem</span>
                <input
                  value={form.shippingOriginCep}
                  onChange={(event) =>
                    setField(
                      "shippingOriginCep",
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 8)
                        .replace(/^(\d{5})(\d)/, "$1-$2"),
                    )
                  }
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  maxLength={9}
                  required
                />
                <small>
                  Informe o local de onde os pedidos realmente serão enviados.
                </small>
              </label>
            </div>
          </section>

          <section className="store-form-card">
            <div className="store-form-title">
              <Clock3 size={20} />
              <div>
                <h2>Atendimento e produção</h2>
                <p>Defina como a loja está recebendo novos pedidos.</p>
              </div>
            </div>
            <div className="store-form-fields">
              <label className="is-wide">
                <span>
                  Aviso da loja <em>opcional</em>
                </span>
                <textarea
                  value={form.announcement}
                  onChange={(event) =>
                    setField("announcement", event.target.value)
                  }
                  maxLength={240}
                  rows={3}
                  placeholder="Ex.: Agenda de novembro aberta para novos pedidos."
                />
                <small>{form.announcement.length}/240 caracteres</small>
              </label>
              <label>
                <span>Prazo médio de produção</span>
                <span className="store-number-field">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={180}
                    value={form.productionTimeDays}
                    onChange={(event) =>
                      setField("productionTimeDays", event.target.value)
                    }
                    required
                  />
                  <b>dias</b>
                </span>
              </label>
            </div>
            <div className="store-toggle-list">
              <label>
                <span>
                  <Sparkles size={18} />
                  <span>
                    <strong>Aceitar encomendas personalizadas</strong>
                    <small>Clientes poderão solicitar peças sob medida.</small>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={form.acceptsCustomOrders}
                  onChange={(event) =>
                    setField("acceptsCustomOrders", event.target.checked)
                  }
                />
              </label>
              <label>
                <span>
                  <PauseCircle size={18} />
                  <span>
                    <strong>Modo pausa</strong>
                    <small>
                      Sinaliza que a loja não está recebendo novos pedidos.
                    </small>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={form.vacationMode}
                  onChange={(event) =>
                    setField("vacationMode", event.target.checked)
                  }
                />
              </label>
            </div>
          </section>

          <button className="store-save-button" type="submit" disabled={saving}>
            {saving ? (
              <LoaderCircle className="seller-spin" size={18} />
            ) : (
              <Save size={18} />
            )}
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </form>

        <aside className="store-preview-card">
          <div className="store-preview-label">
            <Eye size={16} /> Prévia da loja
          </div>
          <div
            className="store-preview-cover"
            style={
              coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined
            }
          >
            {!coverUrl && <Sparkles size={28} />}
            {form.vacationMode && <span>Loja em pausa</span>}
          </div>
          <div className="store-preview-body">
            <span className="store-preview-symbol">
              <Store size={23} />
            </span>
            <h2>{form.storeName.trim() || "Nome da loja"}</h2>
            <p className="store-preview-specialty">
              {form.specialty.trim() || "Especialidade não informada"}
            </p>
            <p className="store-preview-location">
              <MapPin size={14} />{" "}
              {[store.city, store.state].filter(Boolean).join(" · ") ||
                "Localização não informada"}
            </p>
            {form.announcement.trim() && (
              <blockquote>{form.announcement.trim()}</blockquote>
            )}
            <p className="store-preview-story">
              {form.story.trim() || "A história da sua loja aparecerá aqui."}
            </p>
            <dl>
              <div>
                <dt>Produção</dt>
                <dd>Até {form.productionTimeDays || "—"} dias</dd>
              </div>
              <div>
                <dt>Encomendas</dt>
                <dd>
                  {form.vacationMode
                    ? "Pausadas"
                    : form.acceptsCustomOrders
                      ? "Disponíveis"
                      : "Indisponíveis"}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      <section className="store-product-summary">
        <div className="store-product-summary-heading">
          <div>
            <p className="seller-eyebrow">Vitrine da loja</p>
            <h2>Produtos atualizados recentemente</h2>
            <p>
              Esta visão usa somente os produtos reais vinculados à sua conta.
            </p>
          </div>
          <span>
            {overview?.ready_to_ship_products ?? 0} prontos para envio
          </span>
        </div>
        {products.length ? (
          <div className="store-owner-products">
            {products.map((product) => (
              <article key={product.id}>
                <div className="store-owner-product-image">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      loading="lazy"
                    />
                  ) : (
                    <PackageOpen size={27} />
                  )}
                  {!product.active && <span>Pausado</span>}
                </div>
                <div>
                  <small>{product.category_name || "Sem categoria"}</small>
                  <h3>{product.name}</h3>
                  <strong>{money.format(Number(product.price))}</strong>
                  <p>
                    {product.stock === null
                      ? "Estoque não controlado"
                      : product.stock > 0
                        ? `${product.stock} em estoque`
                        : "Sem estoque"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="store-products-empty">
            <PackageOpen size={36} />
            <h3>Sua loja ainda não possui produtos</h3>
            <p>
              Quando peças forem cadastradas no Catálogo, elas aparecerão aqui
              automaticamente.
            </p>
          </div>
        )}
        <Link href="/vendedor/catalogo" className="store-catalog-note">
          <Tags size={18} />
          <div>
            <strong>Cadastro e edição ficam no Catálogo</strong>
            <p>
              Minha loja apresenta sua marca e oferece uma visão geral. Abra o
              Catálogo para criar, editar, publicar ou pausar suas peças.
            </p>
          </div>
          <span>
            Abrir catálogo <ArrowRight size={14} />
          </span>
        </Link>
      </section>
    </div>
  );
}
