"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Pencil, Plus, Sparkles, Tags } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { useAdmin } from "@/components/admin-shell";
import { AdminPageHead, Badge, LoadState, friendlyError } from "@/components/admin-ui";
import { OptimizedImage } from "@/components/optimized-image";
import { getSupabase } from "@/lib/supabase";
import { slugify } from "@/lib/admin";

type Category = {
  category_id: string; name: string; slug: string; image_url: string | null; sort_order: number; active: boolean; products_active: number;
};
type Draft = { id: string | null; name: string; slug: string; imageUrl: string; sortOrder: string; active: boolean; slugTouched: boolean };

const BUCKET = "artenos-store-assets";
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

function CategoryEditor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const { account } = useAdmin();
  const [form, setForm] = useState(draft);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pick(next: File | undefined) {
    if (!next) return;
    if (!TYPES[next.type]) { setError("Use uma foto JPG, PNG ou WebP."); return; }
    if (next.size > MAX_BYTES) { setError("A foto pode ter no máximo 5 MB."); return; }
    setError("");
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const supabase = getSupabase();
    let imageUrl = form.imageUrl.trim() || null;
    try {
      if (file) {
        // Mesma pasta por conta usada pelas lojas (regra do Storage: 1ª pasta = id de quem envia).
        const path = `${account.userId}/categorias/${form.slug || slugify(form.name)}-${crypto.randomUUID()}.${TYPES[file.type]}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error("Não foi possível enviar a foto.");
        imageUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }
      const { error: saveError } = await supabase.rpc("admin_save_category", {
        p_id: form.id, p_name: form.name, p_slug: form.slug, p_image_url: imageUrl,
        p_sort_order: Number(form.sortOrder) || 0, p_active: form.active,
      });
      if (saveError) throw saveError;
      toast.success(form.id ? "Categoria atualizada." : "Categoria criada.");
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message.startsWith("Não foi possível enviar")
        ? saveError.message : friendlyError(saveError, "Não foi possível salvar a categoria."));
    } finally {
      setSaving(false);
    }
  }

  const shownImage = preview ?? (form.imageUrl || null);
  return (
    <Dialog open onClose={onClose} labelledBy="categoria-titulo" className="adm-dialog" closeLabel="Fechar">
      <form className="adm-form" onSubmit={save} noValidate>
        <h2 id="categoria-titulo">{form.id ? "Editar categoria" : "Nova categoria"}</h2>
        <div className="adm-photo">
          {shownImage
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={shownImage} alt="" />
            : <span aria-hidden="true"><Sparkles size={26} /></span>}
          <label className="adm-btn adm-btn--ghost">
            <ImagePlus size={15} /> {shownImage ? "Trocar foto" : "Enviar foto"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="an-visually-hidden"
              onChange={(event) => pick(event.target.files?.[0])} />
          </label>
          <small>Foto real da técnica (ex.: peças de crochê). JPG, PNG ou WebP até 5 MB. Na página inicial aparece num bloco largo (cerca de 2,3 × 1), cortada pelo centro; sem foto, a categoria usa um padrão e o ícone da técnica.</small>
          {shownImage && (
            <button type="button" className="adm-link-btn" onClick={() => { setFile(null); setPreview(null); setForm({ ...form, imageUrl: "" }); }}>
              Remover foto
            </button>
          )}
        </div>
        <label className="adm-field">
          <span>Nome</span>
          <input required maxLength={60} value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value, slug: form.slugTouched ? form.slug : slugify(event.target.value) })} />
        </label>
        <label className="adm-field">
          <span>Endereço na vitrine</span>
          <input required maxLength={60} value={form.slug} aria-describedby="slug-dica"
            onChange={(event) => setForm({ ...form, slug: slugify(event.target.value), slugTouched: true })} />
          <small id="slug-dica">Letras minúsculas, números e hífens.</small>
        </label>
        <div className="adm-form-row">
          <label className="adm-field">
            <span>Ordem</span>
            <input type="number" inputMode="numeric" min={0} max={999} value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} />
          </label>
          <label className="adm-check">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Aparece na vitrine
          </label>
        </div>
        {error && <p className="adm-inline-error" role="alert">{error}</p>}
        <div className="adm-form-actions">
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="adm-btn" disabled={saving}>
            {saving && <Loader2 size={15} className="admin-spin" />} Salvar
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default function CategoriesAdminPage() {
  const [rows, setRows] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await getSupabase().rpc("admin_list_categories");
    if (loadError) setError(friendlyError(loadError, "Não foi possível carregar as categorias."));
    else setRows((data ?? []) as Category[]);
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const withoutPhoto = rows.filter((row) => row.active && !row.image_url).length;
  const nextOrder = rows.reduce((max, row) => Math.max(max, row.sort_order), 0) + 1;
  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Vitrine" title="Categorias"
        description="Os blocos de categoria da página inicial e os filtros do catálogo. Desative para tirar da vitrine sem afetar as peças."
        actions={<button type="button" className="adm-btn" onClick={() => setEditing({
          id: null, name: "", slug: "", imageUrl: "", sortOrder: String(nextOrder), active: true, slugTouched: false,
        })}><Plus size={15} /> Nova categoria</button>} />
      {withoutPhoto > 0 && (
        <p className="adm-note">{withoutPhoto} {withoutPhoto === 1 ? "categoria ativa está" : "categorias ativas estão"} sem foto e {withoutPhoto === 1 ? "aparece" : "aparecem"} com padrão e ícone na vitrine.</p>
      )}
      <LoadState loading={loading} error={error} onRetry={() => void load()}>
        {rows.length ? (
          <ul className="adm-categories">
            {rows.map((row) => (
              <li key={row.category_id} className={row.active ? "" : "is-off"}>
                <span className="adm-categories-img">
                  {row.image_url
                    ? <OptimizedImage src={row.image_url} alt="" width={120} height={120} sizes="120px" />
                    : <Sparkles size={22} aria-hidden="true" />}
                </span>
                <span className="adm-categories-copy">
                  <strong>{row.name}</strong>
                  <small>/{row.slug} · ordem {row.sort_order} · {row.products_active} {Number(row.products_active) === 1 ? "peça" : "peças"}</small>
                  <span>
                    <Badge tone={row.active ? "ok" : "muted"}>{row.active ? "Na vitrine" : "Oculta"}</Badge>
                    {!row.image_url && <Badge tone="wait">Sem foto</Badge>}
                  </span>
                </span>
                <button type="button" className="adm-icon-btn" aria-label={`Editar ${row.name}`}
                  onClick={() => setEditing({
                    id: row.category_id, name: row.name, slug: row.slug, imageUrl: row.image_url ?? "",
                    sortOrder: String(row.sort_order), active: row.active, slugTouched: true,
                  })}>
                  <Pencil size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="adm-state"><Tags size={26} /><p>Nenhuma categoria cadastrada.</p></div>
        )}
      </LoadState>
      {editing && <CategoryEditor draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}
