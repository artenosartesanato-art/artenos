"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Camera, LoaderCircle, Trash2 } from "@/components/icons";
import { getSupabase } from "@/lib/supabase";
import { STORE_ASSETS_BUCKET, rememberStoreLogo, storeAssetUrl } from "@/lib/store-logos";
import { HEIC_HELP, IMAGE_EXT, IMAGE_MIME, PickedFileError, detectImage, readPickedFile } from "@/lib/image-file";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Foto de perfil da loja (Minha loja): aparece no lugar das iniciais em todo o site. */
export function StoreLogoEditor({ artisanId, initials }: { artisanId: string; initials: string }) {
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let active = true;
    void getSupabase().rpc("get_my_store_logo").then(({ data, error }) => {
      if (!active) return;
      if (error) setAvailable(false);
      else setPath((data as string | null) ?? null);
    });
    return () => { active = false; };
  }, []);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    if (busy) {
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
    if (file.size > MAX_LOGO_BYTES) return toast.error("A foto deve ter no máximo 2 MB.");
    const contentType = IMAGE_MIME[kind];
    const newPath = `${artisanId}/logo-${crypto.randomUUID()}.${IMAGE_EXT[kind]}`;
    const oldPath = path;
    setBusy(true);
    try {
      const supabase = getSupabase();
      const { error: uploadError } = await supabase.storage.from(STORE_ASSETS_BUCKET)
        .upload(newPath, file, { contentType, cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { error: saveError } = await supabase.rpc("set_my_store_logo", { p_logo_path: newPath });
      if (saveError) {
        await supabase.storage.from(STORE_ASSETS_BUCKET).remove([newPath]);
        throw saveError;
      }
      setPath(newPath);
      rememberStoreLogo(artisanId, newPath);
      if (oldPath) await supabase.storage.from(STORE_ASSETS_BUCKET).remove([oldPath]);
      toast.success("Foto da loja atualizada.");
    } catch {
      toast.error("Não foi possível enviar a foto. Use JPG, PNG ou WebP e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!path || busy || !window.confirm("Remover a foto de perfil da loja?")) return;
    const oldPath = path;
    setBusy(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.rpc("set_my_store_logo", { p_logo_path: null });
      if (error) throw error;
      setPath(null);
      rememberStoreLogo(artisanId, null);
      await supabase.storage.from(STORE_ASSETS_BUCKET).remove([oldPath]);
      toast.success("Foto removida. A loja volta a mostrar as iniciais.");
    } catch {
      toast.error("Não foi possível remover a foto.");
    } finally {
      setBusy(false);
    }
  }

  const url = storeAssetUrl(path);
  return (
    <section className="store-cover-card store-logo-card">
      <div className="store-logo-preview">
        {/* eslint-disable-next-line @next/next/no-img-element -- prévia da foto enviada */}
        {url ? <img src={url} alt="Foto de perfil da loja" /> : <span aria-hidden="true">{initials}</span>}
      </div>
      <div>
        <h2>Foto de perfil da loja</h2>
        <p>
          {available
            ? "Aparece no círculo da loja: na página da loja, na lista de lojas e no detalhe das peças. Use o logo ou uma foto sua, quadrada."
            : "A foto de perfil da loja ainda não está disponível. Tente de novo mais tarde."}
        </p>
        <div className="store-cover-actions">
          <label>
            {busy ? <LoaderCircle className="seller-spin" size={16} /> : <Camera size={16} />}
            {busy ? "Enviando..." : url ? "Trocar foto" : "Adicionar foto"}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy || !available} />
          </label>
          {url && (
            <button type="button" onClick={remove} disabled={busy}>
              <Trash2 size={15} /> Remover
            </button>
          )}
        </div>
        <small>JPG, PNG ou WebP · até 2 MB</small>
      </div>
    </section>
  );
}
