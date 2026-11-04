import { kindFromName, sniffImage, type ImageKind } from "@/lib/image-sniff";
import { convertHeicToJpeg } from "@/lib/image-optimizer";

export const IMAGE_MIME: Record<ImageKind, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
export const IMAGE_EXT: Record<ImageKind, string> = { jpeg: "jpg", png: "png", webp: "webp", heic: "heic" };

export const HEIC_HELP =
  "Não conseguimos abrir esta foto HEIC (do iPhone) neste navegador. " +
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

export type PreparedImage = { blob: Blob; width: number; height: number; source: string };

const EDIT_MAX_SIDE = 2048;

/** Algum pixel transparente? (Lê em faixas para não pesar na memória.) */
function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const rows = Math.max(1, Math.floor(262144 / width));
  for (let y = 0; y < height; y += rows) {
    const data = ctx.getImageData(0, y, width, Math.min(rows, height - y)).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  }
  return false;
}

/**
 * Cópia local para o editor (nunca é enviada). JPEG 0.92; PNG só quando a
 * imagem tem transparência (logos), para não virar fundo preto.
 */
function drawToBlob(source: CanvasImageSource, width: number, height: number, mayHaveAlpha: boolean) {
  const scale = Math.min(1, EDIT_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: mayHaveAlpha });
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  let transparent = false;
  try { transparent = mayHaveAlpha && hasTransparency(ctx, canvas.width, canvas.height); } catch { /* segue em JPEG */ }
  return new Promise<{ blob: Blob; width: number; height: number } | null>((resolve) => {
    canvas.toBlob((blob) => {
      const result = blob ? { blob, width: canvas.width, height: canvas.height } : null;
      canvas.width = canvas.height = 0;
      resolve(result);
    }, transparent ? "image/png" : "image/jpeg", 0.92);
  });
}

function loadImage(url: string, timeoutMs = 15000) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    image.onload = () => { window.clearTimeout(timer); resolve(image.naturalWidth > 0 ? image : null); };
    image.onerror = () => { window.clearTimeout(timer); resolve(null); };
    image.src = url;
  });
}

/**
 * Abre a foto num tamanho próprio para enquadrar (até 2048 px), já na posição
 * certa. Fotos de celulares com câmeras de 50–200 MP às vezes não abrem
 * inteiras no navegador do celular (falta de memória): por isso tenta, nesta
 * ordem, abrir já reduzida, abrir inteira e, por último, pela tag <img>.
 * Devolve null se nenhum jeito funcionar.
 */
export async function prepareForEditing(file: File, reasons: string[] = [], convertedFromHeic = false): Promise<PreparedImage | null> {
  const kind = await detectImage(file);
  const alpha = kind === "png" || kind === "webp";
  const attempts: [string, () => Promise<{ blob: Blob; width: number; height: number } | null>][] = [];
  if (typeof createImageBitmap === "function") {
    attempts.push(["bitmap-reduzido", async () => {
      // Decodifica já reduzida (pouca memória). A largura é limitada; a altura acompanha.
      const bitmap = await createImageBitmap(file, { resizeWidth: EDIT_MAX_SIDE, resizeQuality: "high", imageOrientation: "from-image" });
      try {
        // Foto pequena foi ampliada: refaz sem ampliar.
        if (bitmap.width === EDIT_MAX_SIDE) {
          const full = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
          if (full && full.width < EDIT_MAX_SIDE) { try { return await drawToBlob(full, full.width, full.height, alpha); } finally { full.close(); } }
          full?.close();
        }
        return await drawToBlob(bitmap, bitmap.width, bitmap.height, alpha);
      } finally { bitmap.close(); }
    }]);
    attempts.push(["bitmap", async () => {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      try { return await drawToBlob(bitmap, bitmap.width, bitmap.height, alpha); } finally { bitmap.close(); }
    }]);
  }
  attempts.push(["img", async () => {
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      return image ? await drawToBlob(image, image.naturalWidth, image.naturalHeight, alpha) : null;
    } finally { URL.revokeObjectURL(url); }
  }]);
  // Duas rodadas: no Android a primeira decodificação às vezes falha logo após a escolha.
  for (const [source, attempt] of [...attempts, ...attempts.map(([name, run]) => [`${name}-2`, run] as const)]) {
    try {
      const result = await attempt();
      if (result && result.width > 1 && result.height > 1) return { ...result, source };
      reasons.push(`${source}: sem imagem`);
    } catch (error) {
      reasons.push(`${source}: ${error instanceof Error ? error.name || error.message : "erro"}`);
    }
  }
  // HEIC fora do Safari: converte para JPEG (heic2any, baixado só agora) e tenta de novo.
  if (kind === "heic" && !convertedFromHeic) {
    const jpeg = await convertHeicToJpeg(file);
    if (jpeg) return prepareForEditing(new File([jpeg], "foto.jpg", { type: "image/jpeg" }), reasons, true);
    reasons.push("heic2any: falhou");
  }
  return null;
}

/** Texto curto com os dados da foto, para o suporte entender o caso. */
export function describeFile(file: File, kind: string | null) {
  const mb = (file.size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `Arquivo: ${file.name || "sem nome"} · ${kind ?? "formato desconhecido"} · ${file.type || "sem tipo"} · ${mb} MB`;
}

export class PickedFileError extends Error {
  constructor(public readonly file: File, public readonly reason: string) {
    super(`Não conseguimos ler esta foto no aparelho (${reason}).`);
  }
}

/**
 * Lê a foto escolhida para a memória ANTES de limpar o campo de arquivo.
 * No Chrome do Android, a galeria/seletor de fotos entrega só uma permissão
 * de leitura temporária; limpar o campo antes (ou esperar) pode invalidar o
 * arquivo e a foto "não abre" — no computador isso não acontece.
 */
export async function readPickedFile(input: HTMLInputElement): Promise<File | null> {
  const picked = input.files?.[0];
  if (!picked) return null;
  try {
    // Alguns Android falham na primeira leitura logo após a escolha: tenta de novo.
    let data: ArrayBuffer;
    try {
      data = await picked.arrayBuffer();
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      data = await picked.arrayBuffer();
    }
    return new File([data], picked.name || "foto", { type: picked.type, lastModified: picked.lastModified });
  } catch (error) {
    const reason = error instanceof Error ? error.name || error.message : "erro de leitura";
    throw new PickedFileError(picked, reason);
  } finally {
    input.value = "";
  }
}
