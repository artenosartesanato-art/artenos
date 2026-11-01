"use client";

import dynamic from "next/dynamic";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import type { CropFormat, CroppedAvatar } from "@/components/avatar-cropper";
import { HEIC_HELP, PickedFileError, describeFile, detectImage, prepareForEditing, readPickedFile } from "@/lib/image-file";

// O editor só é baixado quando alguém escolhe uma foto.
const ImageCropper = dynamic(() => import("@/components/avatar-cropper").then((module) => module.AvatarCropper), { ssr: false });

/**
 * Escolher foto → abrir já reduzida → enquadrar → salvar. Usado na foto e na
 * capa da loja e nas fotos das peças (a foto de perfil tem o próprio fluxo).
 * `onDone` recebe a foto enquadrada e o original (para reenquadrar depois).
 */
export function useImageCropFlow(format: CropFormat, onDone: (result: CroppedAvatar) => Promise<void>, maxBytes = 40 * 1024 * 1024) {
  const [src, setSrc] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const srcRef = useRef<string | null>(null);

  function open(blob: Blob) {
    if (srcRef.current) URL.revokeObjectURL(srcRef.current);
    const url = URL.createObjectURL(blob);
    srcRef.current = url;
    setSrc(url);
  }

  function close() {
    if (srcRef.current) URL.revokeObjectURL(srcRef.current);
    srcRef.current = null;
    setSrc(null);
  }

  /** onChange do campo de arquivo. */
  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (preparing) { input.value = ""; return; }
    if ((input.files?.[0]?.size ?? 0) > maxBytes) {
      input.value = "";
      toast.error(`A foto deve ter no máximo ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      return;
    }
    setPreparing(true);
    try {
      const file = await readPickedFile(input);
      if (!file) return;
      const kind = await detectImage(file);
      if (!kind) { toast.error(`Este arquivo não é uma foto. (${describeFile(file, kind)})`); return; }
      const reasons: string[] = [];
      const prepared = await prepareForEditing(file, reasons);
      if (!prepared) {
        toast.error(kind === "heic" ? HEIC_HELP : `Não conseguimos abrir esta foto neste aparelho. Tente outra foto ou uma captura de tela dela. (${describeFile(file, kind)})`);
        return;
      }
      open(prepared.blob);
    } catch (error) {
      toast.error(error instanceof PickedFileError ? `O celular não liberou a leitura desta foto. Tente escolher de novo (${error.reason}).` : "Não foi possível abrir a foto.");
    } finally {
      setPreparing(false);
    }
  }

  /** Reenquadrar uma foto que já está salva (original guardado ou a própria foto). */
  async function adjust(urls: string[]) {
    setPreparing(true);
    try {
      for (const url of urls) {
        const response = await fetch(url, { cache: "no-store" }).catch(() => null);
        if (response?.ok) { open(await response.blob()); return; }
      }
      toast.error("Não foi possível abrir a foto salva. Envie a foto de novo.");
    } finally {
      setPreparing(false);
    }
  }

  const element = src ? (
    <ImageCropper src={src} format={format} onCancel={close}
      onSave={async (result) => { await onDone(result); close(); }} />
  ) : null;

  return { pick, adjust, reopen: open, element, preparing, cropping: Boolean(src) };
}
