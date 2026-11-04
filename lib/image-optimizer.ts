"use client";

// Otimizador de imagens: TODA foto enviada ao Supabase Storage passa por aqui
// antes do upload (o original bruto nunca é enviado). Redimensiona para o uso
// (avatar, miniatura, conteúdo, capa), respeita a orientação do celular,
// gera WebP (ou JPEG onde não há WebP, como no Safari) e ajusta a qualidade
// até caber no alvo. Remove EXIF/GPS ao re-codificar.
//
//   const optimized = await optimizeImage(file, { preset: "content" });
//   await bucket.upload(uniqueImageName("pasta/", optimized.mimeType), optimized.blob, imageUploadOptions(optimized));
//
// Regras e presets: lib/image-optimizer-core.ts.

import {
  IMAGE_CACHE_CONTROL, ImageOptimizationError, decodeBitmap, resolveOptions, runOptimization,
  type DecodedSource, type FallbackDecoder, type OptimizeOptions, type OptimizedImage, type ResolvedOptions,
} from "@/lib/image-optimizer-core";
import type { WorkerRequest, WorkerResponse } from "@/lib/image-optimizer.worker";

export {
  IMAGE_CACHE_CONTROL, IMAGE_PRESETS, ImageOptimizationError, extensionFor, uniqueImageName,
  type ImagePreset, type OptimizeOptions, type OptimizedImage,
} from "@/lib/image-optimizer-core";

/** Opções de upload: tipo certo e cache de 1 ano (nome único = nunca muda). */
export function imageUploadOptions(image: Pick<OptimizedImage, "mimeType">) {
  return { contentType: image.mimeType, cacheControl: IMAGE_CACHE_CONTROL, upsert: false };
}

export type OptimizerInput = Blob | HTMLCanvasElement | ImageBitmap;

// ------------------------------------------------------------- HEIC (iPhone)

/**
 * Converte HEIC/HEIF para JPEG com a biblioteca heic2any, baixada só quando
 * preciso (é grande). O Safari abre HEIC sozinho; Chrome/Firefox/Android não.
 */
export async function convertHeicToJpeg(blob: Blob): Promise<Blob | null> {
  try {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob, toType: "image/jpeg", quality: 0.92 });
    const first = Array.isArray(converted) ? converted[0] : converted;
    return first && first.size > 0 ? first : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------- decodificação de reserva

function loadImage(blob: Blob, timeoutMs = 20000) {
  return new Promise<DecodedSource | null>((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const finish = (value: DecodedSource | null) => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    image.decoding = "async";
    // Navegadores atuais aplicam a orientação EXIF no <img> (image-orientation: from-image).
    image.onload = () => finish(image.naturalWidth > 0 ? { source: image, dispose: () => { image.src = ""; } } : null);
    image.onerror = () => finish(null);
    image.src = url;
  });
}

const decodeOnPage: FallbackDecoder = async (blob, inspected) => {
  const viaImg = await loadImage(blob);
  if (viaImg) return viaImg;
  if (inspected.format !== "heic") return null;
  const jpeg = await convertHeicToJpeg(blob);
  if (!jpeg) return null;
  const bitmap = await decodeBitmap(jpeg, null, Infinity);
  return bitmap ? { source: bitmap, dispose: () => bitmap.close() } : loadImage(jpeg);
};

// ------------------------------------------------------------------- worker

type Pending = { resolve: (value: OptimizedImage) => void; reject: (error: unknown) => void; timer: number; options: ResolvedOptions };

let worker: Worker | null = null;
let workerBroken = false;
let idleTimer = 0;
let nextId = 1;
const pending = new Map<number, Pending>();

/** Falha do worker (não carregou, travou...): a página faz o trabalho. */
class WorkerUnavailable extends Error {}

function failAll(reason: string) {
  for (const [id, job] of pending) {
    window.clearTimeout(job.timer);
    job.reject(new WorkerUnavailable(reason));
    pending.delete(id);
  }
}

function stopWorker() {
  worker?.terminate();
  worker = null;
}

function getWorker() {
  if (workerBroken || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./image-optimizer.worker.ts", import.meta.url), { type: "module" });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    window.clearTimeout(job.timer);
    if (message.ok) job.resolve(message.result);
    else if (message.retryOnPage) job.reject(new WorkerUnavailable(message.detail ?? message.code));
    else job.reject(new ImageOptimizationError(message.code, job.options, message.detail));
  };
  worker.onerror = (event) => {
    event.preventDefault();
    workerBroken = true;
    stopWorker();
    failAll("erro no worker");
  };
  return worker;
}

async function optimizeInWorker(input: OptimizerInput, options: ResolvedOptions): Promise<OptimizedImage> {
  const target = getWorker();
  if (!target) throw new WorkerUnavailable("sem worker");
  // Canvas não atravessa para o worker: vira um ImageBitmap (cópia rápida, transferida).
  const payload: Blob | ImageBitmap = input instanceof Blob ? input : await createImageBitmap(input);
  window.clearTimeout(idleTimer);
  return new Promise<OptimizedImage>((resolve, reject) => {
    const id = nextId++;
    const timer = window.setTimeout(() => {
      pending.delete(id);
      // Travou: descarta este worker e segue na página.
      stopWorker();
      failAll("tempo esgotado");
      reject(new WorkerUnavailable("tempo esgotado"));
    }, 60000);
    pending.set(id, { resolve, reject, timer, options });
    const message: WorkerRequest = { id, input: payload, options };
    try {
      target.postMessage(message, payload instanceof Blob ? [] : [payload]);
    } catch (error) {
      pending.delete(id);
      window.clearTimeout(timer);
      if (!(payload instanceof Blob)) payload.close();
      reject(new WorkerUnavailable(error instanceof Error ? error.message : "postMessage"));
    }
  }).finally(() => {
    // Sem uso por 20 s: libera a memória do worker.
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => { if (!pending.size) stopWorker(); }, 20000);
  });
}

// ------------------------------------------------------------------ público

const development = process.env.NODE_ENV !== "production";
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * Otimiza uma imagem no navegador antes do upload. Aceita o arquivo escolhido
 * (File/Blob) ou um canvas/bitmap já desenhado (ex.: o recorte do editor).
 * Lança ImageOptimizationError com mensagem em português; nesse caso NÃO
 * envie o original.
 */
export async function optimizeImage(input: OptimizerInput, options: OptimizeOptions = {}): Promise<OptimizedImage> {
  const resolved = resolveOptions(options);
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  let where = "worker";
  let result: OptimizedImage;
  try {
    if (!resolved.useWorker) throw new WorkerUnavailable("desligado");
    result = await optimizeInWorker(input, resolved);
  } catch (error) {
    if (!(error instanceof WorkerUnavailable)) throw error;
    where = "página";
    try {
      result = await runOptimization(input, resolved, decodeOnPage);
    } catch (pageError) {
      if (development) console.warn("[imageOptimizer] falhou:", pageError);
      throw pageError instanceof ImageOptimizationError ? pageError : new ImageOptimizationError("encode", resolved, String(pageError));
    }
  }
  if (input instanceof Blob) result.originalSize = input.size;
  if (development) {
    const elapsed = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - started);
    const saved = result.originalSize ? ` (−${Math.max(0, Math.round((1 - result.optimizedSize / result.originalSize) * 100))}%)` : "";
    console.info(
      `[imageOptimizer] ${resolved.preset}: ${result.originalSize ? kb(result.originalSize) : "canvas"} → ${kb(result.optimizedSize)}${saved}` +
      ` · ${result.width}×${result.height} · ${result.mimeType} · qualidade ${result.quality ?? "original"} · ${result.strategy} · ${where} · ${elapsed} ms`,
    );
  }
  return result;
}

/** Mensagem amigável para qualquer erro do otimizador. */
export function optimizationErrorMessage(error: unknown) {
  return error instanceof ImageOptimizationError
    ? error.message
    : "Não conseguimos otimizar esta foto. Tente novamente ou escolha outra foto.";
}
