import { kindFromName, sniffImage, type ImageKind } from "@/lib/image-sniff";

export const IMAGE_MIME: Record<ImageKind, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
export const IMAGE_EXT: Record<ImageKind, string> = { jpeg: "jpg", png: "png", webp: "webp", heic: "heic" };

export const HEIC_HELP =
  "Esta foto está no formato HEIC (do iPhone), que este navegador não consegue abrir. " +
  "Envie uma captura de tela da foto, ou no iPhone ative Ajustes › Câmera › Formatos › Mais compatível.";

/** Formato real do arquivo (pelos primeiros bytes; se não der, pelo tipo/nome). */
export async function detectImage(file: File): Promise<ImageKind | null> {
  try {
    const kind = sniffImage(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
    if (kind) return kind;
  } catch { /* segue pelo nome */ }
  return kindFromName(file.type, file.name);
}

/** O navegador consegue mostrar esta imagem? (HEIC só abre em aparelhos Apple.) */
export function canDisplay(url: string, timeoutMs = 10000) {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(false), timeoutMs);
    image.onload = () => { window.clearTimeout(timer); resolve(image.naturalWidth > 0); };
    image.onerror = () => { window.clearTimeout(timer); resolve(false); };
    image.src = url;
  });
}
