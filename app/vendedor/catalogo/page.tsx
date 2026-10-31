"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Edit3,
  ImagePlus,
  LoaderCircle,
  PackageCheck,
  PackageOpen,
  Plus,
  Ruler,
  Save,
  Search,
  Tags,
  Upload,
  X,
  SpriteIcon,
} from "@/components/icons";
import { toast } from "sonner";
import { playUiSound } from "@/lib/ui-sound";
import { categoryLook } from "@/lib/category-looks";
import { getSupabase } from "@/lib/supabase";
import { findBlockedTerm, moderationError } from "@/lib/moderation";
import { DescriptionEditor } from "@/components/description-editor";
import { plainSummary } from "@/lib/rich-text";
import { useSellerProfile } from "@/components/seller-shell";
import "./product-catalog.css";

type CatalogStatus = "all" | "published" | "draft" | "out_of_stock" | "ready";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  category_id: string | null;
  category_name: string | null;
  stock: number;
  ready_to_ship: boolean;
  active: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
  shipping_weight_grams: number | null;
  shipping_height_cm: number | null;
  shipping_width_cm: number | null;
  shipping_length_cm: number | null;
  shipping_package_count: number | null;
  production_time_days: number | null;
  shipping_data_complete: boolean;
};

type StoreOverview = {
  total_products: number;
  published_products: number;
  paused_products: number;
  out_of_stock_products: number;
  ready_to_ship_products: number;
  favorite_count: number;
};

type ProductForm = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  stock: string;
  weightGrams: string;
  heightCm: string;
  widthCm: string;
  lengthCm: string;
  packageCount: string;
  productionTimeDays: string;
  active: boolean;
  imageUrl: string;
};

const STORE_BUCKET = "artenos-store-assets";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const EMPTY_FORM: ProductForm = {
  name: "",
  description: "",
  price: "",
  categoryId: "",
  stock: "0",
  weightGrams: "",
  heightCm: "",
  widthCm: "",
  lengthCm: "",
  packageCount: "1",
  productionTimeDays: "",
  // Peça nova já vem para publicar; desmarque para guardar como rascunho.
  active: true,
  imageUrl: "",
};
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function storagePathFromPublicUrl(url: string | null) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${STORE_BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;
  try {
    return decodeURIComponent(
      url.slice(markerIndex + marker.length).split("?")[0],
    );
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  const expected = [
    "O nome do produto",
    "A descrição",
    "Informe um preço",
    "Informe um estoque",
    "Categoria inválida",
    "Escolha uma categoria",
    "Adicione uma imagem",
    "Produto não encontrado",
    "peso",
    "dimensões",
    "volumes",
    "prazo de produção",
  ];
  const blocked = moderationError(error);
  if (blocked) return blocked;
  const fiscal = message.match(/FISCAL:\s*(.+)/);
  if (fiscal) return fiscal[1];
  return expected.find((text) => message.includes(text))
    ? message
    : "Não foi possível salvar o produto. Confira os dados e tente novamente.";
}

export default function ProductCatalogPage() {
  const seller = useSellerProfile();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [overview, setOverview] = useState<StoreOverview | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CatalogStatus>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);

  async function loadCatalog(
    nextQuery = query,
    nextStatus: CatalogStatus = status,
  ) {
    setLoading(true);
    setLoadError("");
    try {
      const supabase = getSupabase();
      const [
        productsResponse,
        categoriesResponse,
        overviewResponse,
        shippingResponse,
      ] =
        await Promise.all([
          supabase.rpc("list_my_product_catalog", {
            p_query: nextQuery.trim() || null,
            p_status: nextStatus,
            p_limit: 100,
          }),
          supabase
            .from("storefront_categories")
            .select("id,name")
            .eq("active", true)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          supabase.rpc("get_my_store_overview"),
          supabase.rpc("list_my_product_shipping_data"),
        ]);

      if (
        productsResponse.error ||
        categoriesResponse.error ||
        overviewResponse.error ||
        shippingResponse.error
      ) {
        throw (
          productsResponse.error ||
          categoriesResponse.error ||
          overviewResponse.error ||
          shippingResponse.error
        );
      }

      const shippingByProduct = new Map(
        ((shippingResponse.data ?? []) as Array<
          Pick<
            Product,
            | "shipping_weight_grams"
            | "shipping_height_cm"
            | "shipping_width_cm"
            | "shipping_length_cm"
            | "shipping_package_count"
            | "production_time_days"
            | "shipping_data_complete"
          > & { product_id: string }
        >).map((shipping) => [shipping.product_id, shipping]),
      );
      setProducts(
        ((productsResponse.data ?? []) as Product[]).map((product) => ({
          ...product,
          shipping_weight_grams: null,
          shipping_height_cm: null,
          shipping_width_cm: null,
          shipping_length_cm: null,
          shipping_package_count: null,
          production_time_days: null,
          shipping_data_complete: false,
          ...shippingByProduct.get(product.id),
        })),
      );
      setCategories((categoriesResponse.data ?? []) as Category[]);
      setOverview(
        (Array.isArray(overviewResponse.data)
          ? overviewResponse.data[0]
          : overviewResponse.data) as StoreOverview,
      );
    } catch {
      setLoadError(
        "Não foi possível carregar seu catálogo agora. Confira sua conexão e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCatalog("", "all"); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(
    () => () => {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview],
  );

  const imageShown = useMemo(
    () => imagePreview || form.imageUrl,
    [imagePreview, form.imageUrl],
  );

  function setField<Key extends keyof ProductForm>(
    key: Key,
    value: ProductForm[Key],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function clearImageSelection() {
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
  }

  function closeForm() {
    if (saving) return;
    clearImageSelection();
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function createProduct() {
    clearImageSelection();
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function editProduct(product: Product) {
    clearImageSelection();
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description || "",
      price: String(product.price),
      categoryId: product.category_id || "",
      stock: String(product.stock ?? 0),
      weightGrams: String(product.shipping_weight_grams ?? ""),
      heightCm: String(product.shipping_height_cm ?? ""),
      widthCm: String(product.shipping_width_cm ?? ""),
      lengthCm: String(product.shipping_length_cm ?? ""),
      packageCount: String(product.shipping_package_count ?? 1),
      productionTimeDays: String(product.production_time_days ?? ""),
      active: product.active,
      imageUrl: product.image_url || "",
    });
    setFormOpen(true);
  }

  function selectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_EXTENSIONS[file.type])
      return toast.error("Escolha uma imagem JPG, PNG ou WebP.");
    if (file.size > MAX_IMAGE_BYTES)
      return toast.error("A imagem deve ter no máximo 5 MB.");
    clearImageSelection();
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!seller || saving) return;

    const price = Number(form.price);
    const stock = Number(form.stock);
    const weightGrams = Number(form.weightGrams);
    const heightCm = Number(form.heightCm);
    const widthCm = Number(form.widthCm);
    const lengthCm = Number(form.lengthCm);
    const packageCount = Number(form.packageCount);
    const productionTimeDays = Number(form.productionTimeDays);
    if (form.name.trim().length < 3)
      return toast.error("O nome precisa ter pelo menos 3 caracteres.");
    if (form.description.trim().length < 20)
      return toast.error("A descrição precisa ter pelo menos 20 caracteres.");
    if (findBlockedTerm(`${form.name} ${form.description}`))
      return toast.error("O nome ou a descrição contém termos que não são permitidos na Artenós.");
    if (!Number.isFinite(price) || price < 0.01)
      return toast.error("Informe um preço válido.");
    if (!Number.isInteger(stock) || stock < 0)
      return toast.error("Informe um estoque válido.");
    if (
      !Number.isInteger(weightGrams) ||
      weightGrams < 1 ||
      weightGrams > 30000
    )
      return toast.error("Informe um peso entre 1 e 30000 gramas.");
    if (
      [heightCm, widthCm, lengthCm].some(
        (dimension) =>
          !Number.isFinite(dimension) || dimension < 1 || dimension > 200,
      )
    )
      return toast.error("As dimensões devem estar entre 1 e 200 cm.");
    if (!Number.isInteger(packageCount) || packageCount < 1 || packageCount > 20)
      return toast.error("Informe uma quantidade entre 1 e 20 volumes.");
    if (
      form.productionTimeDays.trim() === "" ||
      !Number.isInteger(productionTimeDays) ||
      productionTimeDays < 0 ||
      productionTimeDays > 180
    )
      return toast.error("Informe um prazo de produção entre 0 e 180 dias.");
    if (form.active && !form.categoryId)
      return toast.error("Escolha uma categoria antes de publicar.");
    if (form.active && !imageFile && !form.imageUrl)
      return toast.error("Adicione uma imagem antes de publicar.");

    const supabase = getSupabase();
    const productId = editingId || crypto.randomUUID();
    const oldImagePath = storagePathFromPublicUrl(form.imageUrl);
    let uploadedPath: string | null = null;
    let finalImageUrl = form.imageUrl || null;
    let productPersisted = false;
    setSaving(true);

    try {
      if (imageFile) {
        const extension = IMAGE_EXTENSIONS[imageFile.type];
        uploadedPath = `${seller.id}/products/${productId}/image-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(STORE_BUCKET)
          .upload(uploadedPath, imageFile, {
            contentType: imageFile.type,
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) throw uploadError;
        finalImageUrl = supabase.storage
          .from(STORE_BUCKET)
          .getPublicUrl(uploadedPath).data.publicUrl;
      }

      const values = {
        p_product_id: productId,
        p_name: form.name.trim(),
        p_description: form.description.trim(),
        p_price: price,
        p_category_id: form.categoryId || null,
        p_stock: stock,
        // Calculado no banco pelo estoque; enviado só por compatibilidade.
        p_ready_to_ship: stock > 0,
        p_image_url: finalImageUrl,
        // Um produto novo nasce como rascunho para que os dados logísticos
        // sejam persistidos antes de qualquer publicação na vitrine.
        p_active: editingId ? form.active : false,
      };
      const { error } = editingId
        ? await supabase.rpc("update_my_product", values)
        : await supabase.rpc("create_my_product", values);
      if (error) throw error;
      productPersisted = true;

      const { data: shippingSaved, error: shippingError } = await supabase.rpc(
        "save_my_product_shipping_data",
        {
          p_product_id: productId,
          p_weight_grams: weightGrams,
          p_height_cm: heightCm,
          p_width_cm: widthCm,
          p_length_cm: lengthCm,
          p_package_count: packageCount,
          p_production_time_days: productionTimeDays,
        },
      );
      if (shippingError || shippingSaved !== true)
        throw shippingError ?? new Error("Não foi possível salvar os dados de frete.");

      if (!editingId && form.active) {
        const { error: publishError } = await supabase.rpc(
          "set_my_product_active",
          {
            p_product_id: productId,
            p_active: true,
          },
        );
        if (publishError) throw publishError;
      }

      if (uploadedPath && oldImagePath && oldImagePath !== uploadedPath) {
        await supabase.storage.from(STORE_BUCKET).remove([oldImagePath]);
      }

      playUiSound("success");
      if (!form.active) {
        // Rascunho não aparece para os clientes: deixa isso claro.
        toast.info("Produto salvo como rascunho.", {
          description: "Ele ainda não aparece na vitrine. Use “Publicar” no catálogo quando quiser mostrar aos clientes.",
          duration: 9000,
        });
      } else {
        toast.success(editingId ? "Produto atualizado." : "Produto criado e publicado na vitrine.");
      }
      closeFormAfterSave();
      await loadCatalog(query, status);
    } catch (error) {
      if (uploadedPath && !productPersisted)
        await supabase.storage.from(STORE_BUCKET).remove([uploadedPath]);
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function closeFormAfterSave() {
    clearImageSelection();
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function toggleProduct(product: Product) {
    if (changingStatusId) return;
    if (!product.active && !product.shipping_data_complete) {
      toast.error(
        "Preencha peso, dimensões, volumes e prazo de produção antes de publicar.",
      );
      editProduct(product);
      return;
    }
    setChangingStatusId(product.id);
    try {
      const { error } = await getSupabase().rpc("set_my_product_active", {
        p_product_id: product.id,
        p_active: !product.active,
      });
      if (error) throw error;
      playUiSound(product.active ? "removed" : "success");
      toast.success(
        product.active ? "Produto pausado." : "Produto publicado na vitrine.",
      );
      await loadCatalog(query, status);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setChangingStatusId(null);
    }
  }

  function searchCatalog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCatalog(query, status);
  }

  function changeStatus(nextStatus: CatalogStatus) {
    setStatus(nextStatus);
    void loadCatalog(query, nextStatus);
  }

  if (!seller)
    return (
      <section className="catalog-state" role="status">
        <LoaderCircle className="seller-spin" size={28} />
        <strong>Preparando seu catálogo...</strong>
      </section>
    );

  // Mesmo ícone da categoria usado na vitrine, ao lado do campo.
  const selectedCategory = categories.find((category) => category.id === form.categoryId);
  const selectedCategoryIcon = selectedCategory ? categoryLook(selectedCategory).icon : null;

  return (
    <div className="catalog-page">
      <header className="catalog-heading">
        <div>
          <p className="seller-eyebrow">Gestão de produtos</p>
          <h1>Catálogo</h1>
          <p>Cadastre e organize as peças exibidas na vitrine da Artenós.</p>
        </div>
        <button type="button" onClick={createProduct}>
          <Plus size={18} /> Criar produto
        </button>
      </header>

      <section className="catalog-overview" aria-label="Resumo do catálogo">
        <article>
          <span>
            <Tags size={18} />
          </span>
          <div>
            <strong>{overview?.total_products ?? 0}</strong>
            <small>Total cadastrado</small>
          </div>
        </article>
        <article>
          <span>
            <CheckCircle2 size={18} />
          </span>
          <div>
            <strong>{overview?.published_products ?? 0}</strong>
            <small>Publicados</small>
          </div>
        </article>
        <article>
          <span>
            <Archive size={18} />
          </span>
          <div>
            <strong>{overview?.paused_products ?? 0}</strong>
            <small>Rascunhos ou pausados</small>
          </div>
        </article>
        <article>
          <span>
            <PackageCheck size={18} />
          </span>
          <div>
            <strong>{overview?.ready_to_ship_products ?? 0}</strong>
            <small>Prontos para envio</small>
          </div>
        </article>
      </section>

      <section
        className="catalog-toolbar"
        aria-label="Pesquisa e filtros do catálogo"
      >
        <form onSubmit={searchCatalog}>
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
            placeholder="Buscar pelo nome, descrição ou categoria"
          />
          <button type="submit">Buscar</button>
        </form>
        <select
          value={status}
          onChange={(event) =>
            changeStatus(event.target.value as CatalogStatus)
          }
          aria-label="Filtrar produtos por situação"
        >
          <option value="all">Todos os produtos</option>
          <option value="published">Publicados</option>
          <option value="draft">Rascunhos e pausados</option>
          <option value="ready">Prontos para envio</option>
          <option value="out_of_stock">Sem estoque</option>
        </select>
      </section>

      {loadError && (
        <div className="catalog-error">
          <strong>Catálogo indisponível</strong>
          <p>{loadError}</p>
          <button type="button" onClick={() => loadCatalog(query, status)}>
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <section className="catalog-state" role="status">
          <LoaderCircle className="seller-spin" size={28} />
          <strong>Carregando produtos...</strong>
        </section>
      ) : !loadError && products.length === 0 ? (
        <section className="catalog-empty">
          <PackageOpen size={38} />
          <h2>Nenhum produto encontrado</h2>
          <p>
            {query || status !== "all"
              ? "Ajuste a pesquisa ou os filtros para consultar outros produtos."
              : "Crie o primeiro produto da sua loja. Ele poderá ser salvo como rascunho antes de aparecer na vitrine."}
          </p>
          {!query && status === "all" && (
            <button type="button" onClick={createProduct}>
              <Plus size={17} /> Criar primeiro produto
            </button>
          )}
        </section>
      ) : (
        !loadError && (
          <section className="catalog-grid" aria-label="Produtos cadastrados">
            {products.map((product) => (
              <article className="catalog-product" key={product.id}>
                <div className="catalog-product-image">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      loading="lazy"
                    />
                  ) : (
                    <div>
                      <ImagePlus size={30} />
                      <span>Sem imagem</span>
                    </div>
                  )}
                  <span
                    className={product.active ? "is-published" : "is-draft"}
                  >
                    {product.active ? "Publicado" : "Rascunho"}
                  </span>
                  {product.featured && <em>Destaque</em>}
                </div>
                <div className="catalog-product-body">
                  <small>{product.category_name || "Sem categoria"}</small>
                  <h2>{product.name}</h2>
                  <p>{plainSummary(product.description, 140)}</p>
                  <div className="catalog-product-data">
                    <strong>{money.format(Number(product.price))}</strong>
                    <span>
                      {product.stock > 0
                        ? `${product.stock} em estoque`
                        : "Sem estoque"}
                    </span>
                  </div>
                  <div className={product.stock > 0 ? "catalog-ready" : "catalog-made-to-order"}>
                    <PackageCheck size={14} />{" "}
                    {product.stock > 0 ? "Pronta entrega" : "Sob encomenda / esgotado"}
                  </div>
                  {!product.shipping_data_complete && (
                    <div className="catalog-shipping-missing">
                      Dados de frete pendentes
                    </div>
                  )}
                  <div className="catalog-product-actions">
                    <button type="button" onClick={() => editProduct(product)}>
                      <Edit3 size={15} /> Editar
                    </button>
                    <button
                      type="button"
                      className={product.active ? "is-pause" : "is-publish"}
                      onClick={() => toggleProduct(product)}
                      disabled={changingStatusId === product.id}
                    >
                      {changingStatusId === product.id ? (
                        <LoaderCircle className="seller-spin" size={15} />
                      ) : product.active ? (
                        <Archive size={15} />
                      ) : (
                        <CheckCircle2 size={15} />
                      )}
                      {product.active ? "Pausar" : "Publicar"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )
      )}

      {formOpen && (
        <div
          className="catalog-modal-backdrop"
          role="presentation"
        >
          <section
            className="catalog-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-form-title"
          >
            <header>
              <div>
                <p className="seller-eyebrow">
                  {editingId ? "Editar peça" : "Nova peça"}
                </p>
                <h2 id="catalog-form-title">
                  {editingId ? "Editar produto" : "Criar produto"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Fechar formulário"
                disabled={saving}
              >
                <X size={21} />
              </button>
            </header>
            <form onSubmit={saveProduct}>
              <div className="catalog-form-grid">
                <div className="catalog-form-main">
                  <label>
                    <span>Nome do produto</span>
                    <input
                      value={form.name}
                      onChange={(event) => setField("name", event.target.value)}
                      minLength={3}
                      maxLength={120}
                      placeholder="Nome que aparecerá na vitrine"
                      required
                    />
                    <small>{form.name.length}/120</small>
                  </label>
                  <DescriptionEditor
                    value={form.description}
                    onChange={(value) => setField("description", value)}
                    placeholder="Conte os materiais, medidas, técnica e detalhes da peça"
                  />
                  <div className="catalog-fields-row">
                    <label>
                      <span>Preço</span>
                      <span className="catalog-money-field">
                        <b>R$</b>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          max="99999999.99"
                          step="0.01"
                          value={form.price}
                          onChange={(event) =>
                            setField("price", event.target.value)
                          }
                          placeholder="0,00"
                          required
                        />
                      </span>
                    </label>
                    <label>
                      <span>Estoque</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="999999"
                        step="1"
                        value={form.stock}
                        onChange={(event) =>
                          setField("stock", event.target.value)
                        }
                        required
                      />
                    </label>
                  </div>
                  <label>
                    <span className="seller-category-label">
                      Categoria
                      {selectedCategoryIcon && <SpriteIcon name={selectedCategoryIcon} size={16} aria-hidden="true" />}
                    </span>
                    <select
                      value={form.categoryId}
                      onChange={(event) =>
                        setField("categoryId", event.target.value)
                      }
                    >
                      <option value="">Selecione uma categoria</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <small>
                      {categories.length
                        ? "Obrigatória para publicar na vitrine."
                        : "Nenhuma categoria disponível no momento."}
                    </small>
                  </label>
                  <section className="catalog-logistics-fields">
                    <div>
                      <Ruler size={17} />
                      <span>
                        <strong>Embalagem e postagem</strong>
                        <small>
                          Informe as medidas da embalagem pronta para envio.
                        </small>
                      </span>
                    </div>
                    <div className="catalog-fields-row is-three">
                      <label>
                        <span>Peso total</span>
                        <span className="catalog-unit-field">
                          <input
                            type="number"
                            min="1"
                            max="30000"
                            step="1"
                            inputMode="numeric"
                            value={form.weightGrams}
                            onChange={(event) =>
                              setField("weightGrams", event.target.value)
                            }
                            required
                          />
                          <b>g</b>
                        </span>
                      </label>
                      <label>
                        <span>Altura</span>
                        <span className="catalog-unit-field">
                          <input
                            type="number"
                            min="1"
                            max="200"
                            step="0.01"
                            inputMode="decimal"
                            value={form.heightCm}
                            onChange={(event) =>
                              setField("heightCm", event.target.value)
                            }
                            required
                          />
                          <b>cm</b>
                        </span>
                      </label>
                      <label>
                        <span>Largura</span>
                        <span className="catalog-unit-field">
                          <input
                            type="number"
                            min="1"
                            max="200"
                            step="0.01"
                            inputMode="decimal"
                            value={form.widthCm}
                            onChange={(event) =>
                              setField("widthCm", event.target.value)
                            }
                            required
                          />
                          <b>cm</b>
                        </span>
                      </label>
                    </div>
                    <div className="catalog-fields-row is-three">
                      <label>
                        <span>Comprimento</span>
                        <span className="catalog-unit-field">
                          <input
                            type="number"
                            min="1"
                            max="200"
                            step="0.01"
                            inputMode="decimal"
                            value={form.lengthCm}
                            onChange={(event) =>
                              setField("lengthCm", event.target.value)
                            }
                            required
                          />
                          <b>cm</b>
                        </span>
                      </label>
                      <label>
                        <span>Volumes</span>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          step="1"
                          inputMode="numeric"
                          value={form.packageCount}
                          onChange={(event) =>
                            setField("packageCount", event.target.value)
                          }
                          required
                        />
                      </label>
                      <label>
                        <span>Produção antes da postagem</span>
                        <span className="catalog-unit-field">
                          <input
                            type="number"
                            min="0"
                            max="180"
                            step="1"
                            inputMode="numeric"
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
                    <small>
                      Em produtos com mais de um volume, o peso total é
                      dividido igualmente e as mesmas dimensões são aplicadas
                      a cada volume na cotação.
                    </small>
                  </section>
                  <p className="catalog-availability-note" role="note">
                    <PackageCheck size={15} />
                    {Number(form.stock) > 0
                      ? "Com estoque, a peça aparece como Pronta entrega. Quando as unidades acabarem, ela passa sozinha para Sob encomenda (ou Esgotado, se a loja não aceitar encomendas)."
                      : "Sem estoque, a peça aparece como Sob encomenda se a loja aceitar encomendas; se não aceitar, como Esgotado. Informe o estoque para vender a pronta entrega."}
                  </p>
                  <div className="catalog-form-toggles">
                    <label>
                      <span>
                        <strong>Publicar na vitrine</strong>
                        <small>
                          Se desmarcado, o produto ficará como rascunho.
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(event) =>
                          setField("active", event.target.checked)
                        }
                      />
                    </label>
                  </div>
                </div>

                <aside className="catalog-image-field">
                  <strong>Imagem principal</strong>
                  <div className="catalog-image-preview">
                    {imageShown ? (
                      <img src={imageShown} alt="Prévia do produto" />
                    ) : (
                      <>
                        <ImagePlus size={37} />
                        <span>Nenhuma imagem selecionada</span>
                      </>
                    )}
                  </div>
                  <label>
                    <Upload size={16} />{" "}
                    {imageShown ? "Trocar imagem" : "Adicionar imagem"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={selectImage}
                      disabled={saving}
                    />
                  </label>
                  {imageFile && (
                    <button type="button" onClick={clearImageSelection}>
                      Cancelar nova imagem
                    </button>
                  )}
                  <small>
                    JPG, PNG ou WebP · até 5 MB.
                    <br />A imagem é obrigatória para publicar.
                  </small>
                </aside>
              </div>
              <footer>
                <button type="submit" disabled={saving}>
                  {saving ? (
                    <LoaderCircle className="seller-spin" size={17} />
                  ) : (
                    <Save size={17} />
                  )}
                  {saving
                    ? "Salvando..."
                    : editingId
                      ? "Salvar alterações"
                      : form.active
                        ? "Criar e publicar"
                        : "Salvar rascunho"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
