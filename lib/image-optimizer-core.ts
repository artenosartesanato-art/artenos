// Núcleo do otimizador de imagens: presets, regras e o laço de compressão.
// Roda igual na página e dentro do Web Worker (lib/image-optimizer.worker.ts):
// não usa `document` nem `window`, exceto no canvas de reserva (quando não há
// OffscreenCanvas). As funções puras do topo são testadas no Node.
// A API pública fica em lib/image-optimizer.ts.

import { orientedSize, readImageHeader, sniffFormat, isAnimatedGif, type ImageHeader, type InputFormat } from "./image-sniff.ts";

export type ImagePreset = "avatar" | "thumbnail" | "content" | "cover";

/** Lado maior (px) e tamanho-alvo (bytes) de cada uso. */
export const IMAGE_PRESETS: Record<ImagePreset, { maxLongSide: number; targetBytes: number }> = {
  avatar: { maxLongSide: 512, targetBytes: 80 * 1024 },
  thumbnail: { maxLongSide: 640, targetBytes: 100 * 1024 },
  content: { maxLongSide: 1600, targetBytes: 400 * 1024 },
  cover: { maxLongSide: 2000, targetBytes: 600 * 1024 },
};

export type OptimizeOptions = {
  /** Uso da imagem (padrão "content"). Os campos abaixo sobrepõem o preset. */
  preset?: ImagePreset;
  maxLongSide?: number;
  targetBytes?: number;
  /** Qualidade inicial (0–1). Padrão 0.82. */
  initialQuality?: number;
  /** Piso de qualidade: abaixo disso aparecem artefatos. Padrão 0.70. */
  minQuality?: number;
  qualityStep?: number;
  /** Quantas vezes reduzir a dimensão em 10% se o piso não bastar. Padrão 3. */
  maxDownscales?: number;
  downscaleFactor?: number;
  /** Limites da entrada (fotos absurdas travam celulares). */
  maxInputBytes?: number;
  maxInputMegapixels?: number;
  /**
   * GIF animado e SVG seguem sem canvas (true) ou são recusados (false).
   * Padrão true. Os uploads atuais do site usam false: os buckets só aceitam
   * JPEG/PNG/WebP, e SVG em bucket público pode carregar scripts.
   */
  allowPassthrough?: boolean;
  /** Tamanho máximo do que segue sem otimizar (GIF/SVG ou o original menor). */
  maxPassthroughBytes?: number;
  /** Usar Web Worker quando o navegador permitir. Padrão true. */
  useWorker?: boolean;
};

export type ResolvedOptions = Required<Omit<OptimizeOptions, "preset">> & { preset: ImagePreset };

export const DEFAULT_OPTIONS = {
  initialQuality: 0.82,
  minQuality: 0.7,
  qualityStep: 0.04,
  maxDownscales: 3,
  downscaleFactor: 0.9,
  maxInputBytes: 40 * 1024 * 1024,
  maxInputMegapixels: 50,
  allowPassthrough: true,
  // Igual ao limite dos buckets (2 MB): o que segue sem otimizar nunca é recusado no upload.
  maxPassthroughBytes: 2 * 1024 * 1024,
  useWorker: true,
};

export function resolveOptions(options: OptimizeOptions = {}): ResolvedOptions {
  const preset = options.preset ?? "content";
  const defined = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
  const resolved = { ...DEFAULT_OPTIONS, ...IMAGE_PRESETS[preset], ...defined, preset } as ResolvedOptions;
  resolved.minQuality = Math.min(resolved.minQuality, resolved.initialQuality);
  return resolved;
}

export type OptimizedImage = {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  optimizedSize: number;
  mimeType: string;
  extension: string;
  /** Qualidade usada no último encode (null quando o arquivo seguiu sem re-encode). */
  quality: number | null;
  /** "optimized": re-encode; "original": o original era menor; "passthrough": GIF animado/SVG. */
  strategy: "optimized" | "original" | "passthrough";
};

export type OptimizeErrorCode = "too-large" | "too-many-pixels" | "unsupported" | "not-allowed" | "decode" | "encode";

const ERROR_MESSAGES: Record<OptimizeErrorCode, string> = {
  "too-large": "Esta foto é grande demais (mais de {mb} MB). Escolha outra foto ou uma captura de tela dela.",
  "too-many-pixels": "Esta foto tem resolução alta demais para abrir neste aparelho (mais de {mp} megapixels). Escolha outra foto ou uma captura de tela dela.",
  unsupported: "Este arquivo não é uma imagem aceita. Envie uma foto JPG, PNG, WebP ou do iPhone (HEIC).",
  "not-allowed": "Este formato não é aceito aqui. Envie uma foto JPG, PNG, WebP ou do iPhone (HEIC).",
  decode: "Não conseguimos abrir esta foto neste aparelho. Tente outra foto ou uma captura de tela dela.",
  encode: "Não conseguimos otimizar esta foto neste aparelho. Tente novamente ou escolha outra foto.",
};

/** Erro com mensagem pronta para mostrar (em português). */
export class ImageOptimizationError extends Error {
  readonly code: OptimizeErrorCode;
  /** Detalhe técnico (para o console/suporte; não mostrar ao usuário). */
  detail?: string;
  constructor(code: OptimizeErrorCode, options: Partial<ResolvedOptions> = {}, detail?: string) {
    super(ERROR_MESSAGES[code]
      .replace("{mb}", String(Math.round((options.maxInputBytes ?? DEFAULT_OPTIONS.maxInputBytes) / 1024 / 1024)))
      .replace("{mp}", String(options.maxInputMegapixels ?? DEFAULT_OPTIONS.maxInputMegapixels)));
    this.name = "ImageOptimizationError";
    this.code = code;
    if (detail) this.detail = detail;
  }
}

// ------------------------------------------------------------- funções puras

/** Escala para caber no lado maior, sem nunca ampliar. */
export function scaleFor(width: number, height: number, maxLongSide: number) {
  return Math.min(1, maxLongSide / Math.max(width, height));
}

export function fitLongSide(width: number, height: number, maxLongSide: number) {
  const scale = scaleFor(width, height, maxLongSide);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Tamanhos intermediários para reduzir pela metade a cada passo (evita o
 * serrilhado quando a redução é maior que 2×). O último é o destino.
 */
export function halvingSteps(fromWidth: number, fromHeight: number, toWidth: number, toHeight: number) {
  const steps: { width: number; height: number }[] = [];
  let width = fromWidth;
  let height = fromHeight;
  while (width / 2 > toWidth && height / 2 > toHeight) {
    width = Math.round(width / 2);
    height = Math.round(height / 2);
    steps.push({ width, height });
  }
  steps.push({ width: toWidth, height: toHeight });
  return steps;
}

/** 0.82, 0.78, 0.74, 0.70 (com os valores padrão). */
export function qualitySchedule(initial: number, min: number, step: number) {
  const values: number[] = [];
  for (let quality = initial; quality >= min - 1e-9; quality -= step) values.push(Math.round(quality * 100) / 100);
  if (!values.length || values[values.length - 1] > min) values.push(min);
  return values;
}

const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/svg+xml": "svg",
};
const FORMAT_MIME: Record<InputFormat, string> = {
  jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", gif: "image/gif", svg: "image/svg+xml",
};

export function extensionFor(mimeType: string) {
  return EXTENSIONS[mimeType] ?? "jpg";
}

/** Cache de 1 ano: cada arquivo tem nome único, então nunca muda. */
export const IMAGE_CACHE_CONTROL = "31536000";

/** Nome único para o Storage (nunca reaproveita o nome original). */
export function uniqueImageName(prefix: string, mimeType: string) {
  return `${prefix}${crypto.randomUUID()}.${extensionFor(mimeType)}`;
}

/**
 * Regra "não piorar": envia o original quando o otimizado ficou maior, desde
 * que já esteja no tamanho do preset, seja JPEG/PNG/WebP e não traga EXIF/XMP
 * (GPS, aparelho) nem rotação pendente.
 */
export function shouldKeepOriginal(input: {
  format: InputFormat; size: number; header: ImageHeader | null; optimizedSize: number;
}, options: Pick<ResolvedOptions, "maxLongSide" | "maxPassthroughBytes">) {
  const { format, size, header, optimizedSize } = input;
  if (format !== "jpeg" && format !== "png" && format !== "webp") return false;
  if (!header || header.hasMetadata || header.orientation !== 1) return false;
  if (Math.max(header.width, header.height) > options.maxLongSide) return false;
  return size <= optimizedSize && size <= options.maxPassthroughBytes;
}

// ---------------------------------------------------------- análise do arquivo

export type InspectedInput = {
  format: InputFormat;
  header: ImageHeader | null;
  /** Largura/altura já orientadas (null se o cabeçalho não foi lido). */
  oriented: { width: number; height: number } | null;
  /** GIF animado/SVG: segue sem canvas. */
  passthrough: boolean;
};

/** Valida tamanho, tipo e resolução antes de decodificar. */
export async function inspectInput(blob: Blob, options: ResolvedOptions): Promise<InspectedInput> {
  if (blob.size > options.maxInputBytes) throw new ImageOptimizationError("too-large", options);
  const name = blob instanceof File ? blob.name : "";
  const head = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
  const format = sniffFormat(head, blob.type, name);
  if (!format) throw new ImageOptimizationError("unsupported", options, blob.type || name);
  let passthrough = format === "svg";
  if (format === "gif") passthrough = isAnimatedGif(new Uint8Array(await blob.arrayBuffer()));
  if (passthrough && !options.allowPassthrough) throw new ImageOptimizationError("not-allowed", options, format);
  if (passthrough && blob.size > options.maxPassthroughBytes) {
    throw new ImageOptimizationError("too-large", { ...options, maxInputBytes: options.maxPassthroughBytes });
  }
  const header = readImageHeader(head);
  const oriented = header ? orientedSize(header) : null;
  if (oriented && oriented.width * oriented.height > options.maxInputMegapixels * 1_000_000) {
    throw new ImageOptimizationError("too-many-pixels", options);
  }
  return { format, header, oriented, passthrough };
}

export function passthroughResult(blob: Blob, format: InputFormat, header: ImageHeader | null): OptimizedImage {
  const mimeType = FORMAT_MIME[format];
  return {
    blob: blob.type === mimeType ? blob : new Blob([blob], { type: mimeType }),
    width: header?.width ?? 0, height: header?.height ?? 0,
    originalSize: blob.size, optimizedSize: blob.size,
    mimeType, extension: extensionFor(mimeType), quality: null, strategy: "passthrough",
  };
}

// ------------------------------------------------------------------- canvas

type Surface = OffscreenCanvas | HTMLCanvasElement;
type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
export type DrawableSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

function createSurface(width: number, height: number): { surface: Surface; ctx: Context2D } {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const surface = new OffscreenCanvas(width, height);
      const ctx = surface.getContext("2d");
      // Safari < 16.4 tem OffscreenCanvas sem 2D/convertToBlob.
      if (ctx && typeof surface.convertToBlob === "function") return { surface, ctx };
    } catch { /* usa o canvas comum */ }
  }
  if (typeof document === "undefined") throw new ImageOptimizationError("encode", {}, "sem canvas no worker");
  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = height;
  const ctx = surface.getContext("2d");
  if (!ctx) throw new ImageOptimizationError("encode", {}, "canvas 2d indisponível");
  return { surface, ctx };
}

/** Libera a memória do canvas (importante em celulares fracos). */
function release(surface: Surface) {
  surface.width = 0;
  surface.height = 0;
}

function encode(surface: Surface, type: string, quality: number): Promise<Blob> {
  if ("convertToBlob" in surface) return surface.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    surface.toBlob((blob) => (blob ? resolve(blob) : reject(new ImageOptimizationError("encode", {}, "toBlob vazio"))), type, quality);
  });
}

export function sourceSize(source: DrawableSource) {
  if ("naturalWidth" in source) return { width: source.naturalWidth, height: source.naturalHeight };
  return { width: source.width, height: source.height };
}

/** Desenha reduzindo em etapas (metade por vez) com suavização alta. */
function render(source: DrawableSource, width: number, height: number, background: string | null): Surface {
  const from = sourceSize(source);
  let current: DrawableSource = source;
  let previous: Surface | null = null;
  const steps = halvingSteps(from.width, from.height, width, height);
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const { surface, ctx } = createSurface(step.width, step.height);
    if (index === steps.length - 1 && background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, step.width, step.height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, step.width, step.height);
    if (previous) release(previous);
    previous = surface;
    current = surface;
  }
  return previous as Surface;
}

// O navegador sabe gerar WebP? (Safari devolve PNG.) Descoberto no 1º encode.
let webpSupported: boolean | null = null;

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Laço de compressão: qualidade de 0.82 até o piso (0.70) em passos de 0.04;
 * se ainda passar do alvo, reduz a dimensão em 10% (até 3 vezes). Nunca
 * amplia. Prefere WebP; sem suporte, JPEG com fundo branco.
 */
export async function compress(source: DrawableSource, options: ResolvedOptions, originalSize: number) {
  const natural = sourceSize(source);
  if (!natural.width || !natural.height) throw new ImageOptimizationError("decode", options, "imagem vazia");
  const base = fitLongSide(natural.width, natural.height, options.maxLongSide);
  const qualities = qualitySchedule(options.initialQuality, options.minQuality, options.qualityStep);
  let best: { blob: Blob; width: number; height: number; quality: number } | null = null;

  for (let attempt = 0; attempt <= options.maxDownscales; attempt++) {
    const factor = options.downscaleFactor ** attempt;
    const width = Math.max(1, Math.round(base.width * factor));
    const height = Math.max(1, Math.round(base.height * factor));
    let mime = webpSupported === false ? "image/jpeg" : "image/webp";
    let surface = render(source, width, height, mime === "image/jpeg" ? "#fff" : null);
    try {
      for (const quality of qualities) {
        let blob = await encode(surface, mime, quality);
        if (mime === "image/webp" && blob.type !== "image/webp") {
          // Sem WebP (Safari): refaz em JPEG, com fundo branco no lugar da transparência.
          webpSupported = false;
          mime = "image/jpeg";
          release(surface);
          surface = render(source, width, height, "#fff");
          blob = await encode(surface, mime, quality);
        } else if (mime === "image/webp") webpSupported = true;
        if (blob.type !== mime) throw new ImageOptimizationError("encode", options, `saiu ${blob.type || "sem tipo"}`);
        best = { blob, width, height, quality };
        if (blob.size <= options.targetBytes) return { ...best, originalSize };
        await yieldToUi();
      }
    } finally {
      release(surface);
    }
    if (width <= 1 || height <= 1) break;
  }
  if (!best) throw new ImageOptimizationError("encode", options);
  // Acima do alvo mesmo no piso: fica com o último (nunca abaixo do piso de qualidade).
  return { ...best, originalSize };
}

export function toResult(compressed: Awaited<ReturnType<typeof compress>>): OptimizedImage {
  const mimeType = compressed.blob.type;
  return {
    blob: compressed.blob, width: compressed.width, height: compressed.height,
    originalSize: compressed.originalSize, optimizedSize: compressed.blob.size,
    mimeType, extension: extensionFor(mimeType), quality: compressed.quality, strategy: "optimized",
  };
}

// ------------------------------------------------------------- decodificação

/**
 * Decodifica com createImageBitmap aplicando a orientação EXIF e, quando
 * possível, já reduzida (menos memória e redução de alta qualidade). Confere
 * o resultado: navegadores que ignoram as opções caem no canvas em etapas.
 * Devolve null se o navegador não conseguir (ex.: HEIC fora do Safari).
 */
export async function decodeBitmap(blob: Blob, oriented: { width: number; height: number } | null, maxLongSide: number) {
  if (typeof createImageBitmap !== "function") return null;
  const attempts: ImageBitmapOptions[] = [];
  if (oriented && scaleFor(oriented.width, oriented.height, maxLongSide) < 1) {
    const target = fitLongSide(oriented.width, oriented.height, maxLongSide);
    // Só a largura: a altura acompanha a proporção, mesmo que o navegador oriente depois.
    attempts.push({ imageOrientation: "from-image", resizeWidth: target.width, resizeQuality: "high" });
  }
  attempts.push({ imageOrientation: "from-image" });
  // Navegadores antigos recusam "from-image" (TypeError); o padrão deles já segue o EXIF.
  attempts.push({});
  for (const options of attempts) {
    try {
      const bitmap = await createImageBitmap(blob, options);
      if (bitmap.width > 0 && bitmap.height > 0) {
        if (options.resizeWidth && oriented) {
          const target = fitLongSide(oriented.width, oriented.height, maxLongSide);
          // Redimensionou do jeito errado (orientação trocada ou opção ignorada para menos): tenta sem resize.
          const longSide = Math.max(bitmap.width, bitmap.height);
          if (longSide < Math.max(target.width, target.height) * 0.98) { bitmap.close(); continue; }
        }
        return bitmap;
      }
      bitmap.close();
    } catch { /* tenta a próxima forma */ }
  }
  return null;
}

// ------------------------------------------------------------------ fluxo

export type DecodedSource = { source: DrawableSource; dispose: () => void };
/** Decodificação de reserva (só na página: <img> e HEIC). */
export type FallbackDecoder = (blob: Blob, inspected: InspectedInput) => Promise<DecodedSource | null>;

/** Fluxo completo (página ou worker). `input` já desenhado (canvas/bitmap) pula as validações de arquivo. */
export async function runOptimization(input: Blob | DrawableSource, options: ResolvedOptions, fallback?: FallbackDecoder): Promise<OptimizedImage> {
  if (!(input instanceof Blob)) return toResult(await compress(input, options, 0));

  const inspected = await inspectInput(input, options);
  if (inspected.passthrough) return passthroughResult(input, inspected.format, inspected.header);

  let decoded: DecodedSource | null = null;
  const bitmap = await decodeBitmap(input, inspected.oriented, options.maxLongSide);
  if (bitmap) decoded = { source: bitmap, dispose: () => bitmap.close() };
  else if (fallback) decoded = await fallback(input, inspected);
  if (!decoded) throw new ImageOptimizationError("decode", options, inspected.format);

  try {
    if (!inspected.oriented) {
      const size = sourceSize(decoded.source);
      if (size.width * size.height > options.maxInputMegapixels * 1_000_000) throw new ImageOptimizationError("too-many-pixels", options);
    }
    const result = toResult(await compress(decoded.source, options, input.size));
    if (shouldKeepOriginal({ format: inspected.format, size: input.size, header: inspected.header, optimizedSize: result.optimizedSize }, options)) {
      const mimeType = FORMAT_MIME[inspected.format];
      return {
        blob: input.type === mimeType ? input : new Blob([input], { type: mimeType }),
        width: inspected.header!.width, height: inspected.header!.height,
        originalSize: input.size, optimizedSize: input.size,
        mimeType, extension: extensionFor(mimeType), quality: null, strategy: "original",
      };
    }
    return result;
  } finally {
    decoded.dispose();
  }
}
