"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, LoaderCircle, Trash2 } from "@/components/icons";
import { CROP_FORMATS } from "@/components/avatar-cropper";
import { AdjustFramingButton } from "@/components/adjust-framing-button";
import { useImageCropFlow } from "@/components/image-crop-flow";
import { extensionFor } from "@/lib/image-optimizer";
import { MAX_PRODUCT_PHOTOS } from "@/lib/product-variations";

/** Uma foto da peça: já salva (url) ou nova, ainda só no navegador (file). */
export type PhotoSlot = {
  id: string;
  url: string | null;
  file: File | null;
  preview: string | null;
  /** Original antes do recorte, para reenquadrar sem perder qualidade. */
  source: Blob | null;
};

const formatBytes = (bytes: number) => (bytes >= 1024 * 1024
  ? `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export const photoSrc = (photo: PhotoSlot) => photo.preview || photo.url || "";

export function photosFromUrls(urls: Array<string | null | undefined>): PhotoSlot[] {
  return Array.from(new Set(urls.filter((url): url is string => Boolean(url))))
    .slice(0, MAX_PRODUCT_PHOTOS)
    .map((url) => ({ id: crypto.randomUUID(), url, file: null, preview: null, source: null }));
}

export function releasePhotos(photos: readonly PhotoSlot[]) {
  for (const photo of photos) if (photo.preview?.startsWith("blob:")) URL.revokeObjectURL(photo.preview);
}

/**
 * Até 3 fotos por peça. A primeira é a capa (vitrine, carrinho e pedidos);
 * as outras aparecem na galeria do detalhe da peça. Cada foto passa pelo
 * mesmo enquadramento 4:5 e otimização das demais imagens da Artenós.
 */
export function ProductPhotosField({ photos, onChange, disabled = false }: {
  photos: readonly PhotoSlot[];
  onChange: (next: PhotoSlot[]) => void;
  disabled?: boolean;
}) {
  // Qual foto o editor está preenchendo: índice existente ou uma nova (-1).
  const target = useRef(-1);
  const [addingNew, setAddingNew] = useState(true);
  const latest = useRef(photos);
  useEffect(() => { latest.current = photos; }, [photos]);

  const crop = useImageCropFlow(CROP_FORMATS.product, async ({ avatar, original }) => {
    const current = [...latest.current];
    const slot: PhotoSlot = {
      id: crypto.randomUUID(),
      url: null,
      file: new File([avatar], `foto.${extensionFor(avatar.type)}`, { type: avatar.type }),
      preview: URL.createObjectURL(avatar),
      source: original,
    };
    const index = target.current;
    if (index >= 0 && current[index]) {
      const previous = current[index];
      if (previous.preview?.startsWith("blob:")) URL.revokeObjectURL(previous.preview);
      // Mantém o id: as variações que apontam para esta foto continuam ligadas.
      current[index] = { ...slot, id: previous.id };
    } else if (current.length < MAX_PRODUCT_PHOTOS) {
      current.push(slot);
    }
    onChange(current);
  });

  const busy = disabled || crop.preparing;
  const full = photos.length >= MAX_PRODUCT_PHOTOS;

  function remove(index: number) {
    const photo = photos[index];
    if (photo?.preview?.startsWith("blob:")) URL.revokeObjectURL(photo.preview);
    onChange(photos.filter((_, position) => position !== index));
  }

  function move(index: number, offset: -1 | 1) {
    const next = [...photos];
    const to = index + offset;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  }

  function reframe(index: number) {
    const photo = photos[index];
    if (!photo) return;
    target.current = index;
    setAddingNew(false);
    if (photo.source) crop.reopen(photo.source);
    else void crop.adjust([photoSrc(photo)]);
  }

  return (
    <aside className="catalog-image-field" aria-labelledby="catalog-photos-title">
      <div className="catalog-photos-heading">
        <strong id="catalog-photos-title">Fotos da peça</strong>
        <span className="catalog-photos-count" aria-label={`${photos.length} de ${MAX_PRODUCT_PHOTOS} fotos`}>
          {photos.length}/{MAX_PRODUCT_PHOTOS}
        </span>
      </div>
      <ol className="catalog-photos">
        {photos.map((photo, index) => (
          <li key={photo.id} className={index === 0 ? "is-cover" : undefined}>
            <div className="catalog-photo-frame">
              <img src={photoSrc(photo)} alt={index === 0 ? "Foto de capa da peça" : `Foto ${index + 1} da peça`} />
              {index === 0 && <span className="catalog-photo-badge">Capa</span>}
              {photo.file && (
                // Comprimida no navegador antes do envio (lib/image-optimizer.ts).
                <span className="catalog-photo-size" title="Foto comprimida antes do envio, sem perda visível de qualidade">
                  Otimizada · {formatBytes(photo.file.size)}
                </span>
              )}
            </div>
            <div className="catalog-photo-actions">
              <button type="button" onClick={() => move(index, -1)} disabled={busy || index === 0}
                aria-label={index === 1 ? "Usar como capa" : "Mover para a esquerda"} title={index === 1 ? "Usar como capa" : "Mover para a esquerda"}>
                <ArrowLeft size={14} />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={busy || index === photos.length - 1}
                aria-label="Mover para a direita" title="Mover para a direita">
                <ArrowRight size={14} />
              </button>
              <button type="button" className="is-danger" onClick={() => remove(index)} disabled={busy}
                aria-label={`Remover foto ${index + 1}`} title="Remover foto">
                <Trash2 size={14} />
              </button>
            </div>
            <AdjustFramingButton className="catalog-photo-reframe" disabled={busy} onClick={() => reframe(index)} />
          </li>
        ))}
        {!full && (
          <li className="catalog-photo-add">
            <label className={busy ? "is-disabled" : undefined}>
              {crop.preparing && addingNew ? <LoaderCircle className="seller-spin" size={24} /> : <ImagePlus size={24} />}
              <span>{crop.preparing && addingNew ? "Abrindo..." : photos.length ? "Adicionar foto" : "Adicionar capa"}</span>
              <input type="file" accept="image/*" disabled={busy}
                onChange={(event) => { target.current = -1; setAddingNew(true); void crop.pick(event); }} />
            </label>
          </li>
        )}
      </ol>
      <small>
        Até {MAX_PRODUCT_PHOTOS} fotos · a primeira é a capa da vitrine. Mostre a peça de frente, um detalhe e ela em uso.
        <br />JPG, PNG, WebP ou foto do celular · você enquadra e a foto é comprimida antes do envio, sem perder qualidade. A capa é obrigatória para publicar.
      </small>
      {crop.element}
    </aside>
  );
}
