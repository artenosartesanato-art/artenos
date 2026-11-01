"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, LoaderCircle, Trash2 } from "@/components/icons";
import { getSupabase } from "@/lib/supabase";
import { STORE_ASSETS_BUCKET, rememberStoreLogo, storeAssetUrl } from "@/lib/store-logos";
import { CROP_FORMATS } from "@/components/avatar-cropper";
import { AdjustFramingButton } from "@/components/adjust-framing-button";
import { useImageCropFlow } from "@/components/image-crop-flow";
import { originalPathFor } from "@/lib/avatar-crop";

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

  // Escolher → enquadrar em círculo → enviar a foto recortada (e o original, para reenquadrar).
  const crop = useImageCropFlow(CROP_FORMATS.storeLogo, async ({ avatar, original }) => {
    const extension = avatar.type === "image/webp" ? "webp" : "jpg";
    const newPath = `${artisanId}/logo-${crypto.randomUUID()}.${extension}`;
    const oldPath = path;
    setBusy(true);
    try {
      const supabase = getSupabase();
      const bucket = supabase.storage.from(STORE_ASSETS_BUCKET);
      const { error: uploadError } = await bucket.upload(newPath, avatar, { contentType: avatar.type, cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { error: saveError } = await supabase.rpc("set_my_store_logo", { p_logo_path: newPath });
      if (saveError) {
        await bucket.remove([newPath]);
        throw saveError;
      }
      // O original é opcional: sem ele, reenquadrar usa a própria foto.
      await bucket.upload(originalPathFor(newPath), original, { contentType: original.type, cacheControl: "3600", upsert: true }).catch(() => null);
      setPath(newPath);
      rememberStoreLogo(artisanId, newPath);
      if (oldPath) await bucket.remove([oldPath, originalPathFor(oldPath)]);
      toast.success("Foto da loja atualizada.");
    } catch {
      toast.error("Não foi possível enviar a foto. Tente novamente.");
    } finally {
      setBusy(false);
    }
  });

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
      await supabase.storage.from(STORE_ASSETS_BUCKET).remove([oldPath, originalPathFor(oldPath)]);
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
            {busy || crop.preparing ? <LoaderCircle className="seller-spin" size={16} /> : <Camera size={16} />}
            {busy ? "Enviando..." : crop.preparing ? "Abrindo..." : url ? "Trocar foto" : "Adicionar foto"}
            <input type="file" accept="image/*" onChange={(event) => void crop.pick(event)} disabled={busy || crop.preparing || !available} />
          </label>
          {url && path && (
            <AdjustFramingButton disabled={busy || crop.preparing}
              onClick={() => void crop.adjust([storeAssetUrl(originalPathFor(path))!, url])} />
          )}
          {url && (
            <button type="button" onClick={remove} disabled={busy}>
              <Trash2 size={15} /> Remover
            </button>
          )}
        </div>
        <small>JPG, PNG, WebP ou foto do celular · você enquadra antes de salvar</small>
      </div>
      {crop.element}
    </section>
  );
}
