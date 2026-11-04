// Web Worker do otimizador: comprime fora da thread da página (a tela não
// trava). Só usa createImageBitmap + OffscreenCanvas; se algo faltar, avisa a
// página para fazer o trabalho lá (lib/image-optimizer.ts).

import { ImageOptimizationError, runOptimization, type ResolvedOptions } from "./image-optimizer-core.ts";

export type WorkerRequest = { id: number; input: Blob | ImageBitmap; options: ResolvedOptions };
export type WorkerResponse =
  | { id: number; ok: true; result: import("./image-optimizer-core.ts").OptimizedImage }
  | { id: number; ok: false; code: ImageOptimizationError["code"]; detail?: string; retryOnPage: boolean };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

scope.onmessage = async (event) => {
  const { id, input, options } = event.data;
  try {
    if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") {
      scope.postMessage({ id, ok: false, code: "encode", detail: "worker sem OffscreenCanvas", retryOnPage: true });
      return;
    }
    const result = await runOptimization(input, options);
    scope.postMessage({ id, ok: true, result });
  } catch (error) {
    const known = error instanceof ImageOptimizationError;
    // Validações (tamanho, formato) valem também na página; falha de leitura/encode tenta lá.
    const retryOnPage = !known || error.code === "decode" || error.code === "encode";
    scope.postMessage({
      id, ok: false, code: known ? error.code : "encode",
      detail: known ? error.detail : error instanceof Error ? error.message : String(error), retryOnPage,
    });
  } finally {
    if (input instanceof ImageBitmap) input.close();
  }
};
