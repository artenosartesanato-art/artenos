import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_PRESETS, ImageOptimizationError, extensionFor, fitLongSide, halvingSteps, qualitySchedule,
  resolveOptions, scaleFor, shouldKeepOriginal, inspectInput,
} from "../../lib/image-optimizer-core.ts";
import { isAnimatedGif, orientedSize, readImageHeader, sniffFormat } from "../../lib/image-sniff.ts";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v]));
const be16 = (n: number) => [n >> 8, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

/** JPEG mínimo: SOI, APP1 Exif com orientação (opcional), SOF0 com o tamanho. */
function jpeg(width: number, height: number, orientation?: number) {
  const parts: number[] = [0xff, 0xd8];
  if (orientation) {
    // TIFF big-endian: "MM", 42, IFD em 8, 1 entrada (0x0112, SHORT, 1, valor).
    const tiff = [..."MM".split("").map((c) => c.charCodeAt(0)), 0, 42, ...be32(8), ...be16(1),
      ...be16(0x0112), ...be16(3), ...be32(1), ...be16(orientation), 0, 0, ...be32(0)];
    const payload = [..."Exif".split("").map((c) => c.charCodeAt(0)), 0, 0, ...tiff];
    parts.push(0xff, 0xe1, ...be16(payload.length + 2), ...payload);
  }
  parts.push(0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  parts.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return new Uint8Array(parts);
}

function png(width: number, height: number) {
  return bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), "IHDR", ...be32(width), ...be32(height), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...be32(0), "IEND", 0, 0, 0, 0);
}

function gif(frames: number) {
  const frame = [0x21, 0xf9, 4, 0, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0];
  return bytes("GIF89a", 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255, ...Array.from({ length: frames }, () => frame).flat(), 0x3b);
}

test("presets e opções configuráveis", () => {
  assert.deepEqual(IMAGE_PRESETS.avatar, { maxLongSide: 512, targetBytes: 80 * 1024 });
  assert.deepEqual(IMAGE_PRESETS.thumbnail, { maxLongSide: 640, targetBytes: 100 * 1024 });
  assert.deepEqual(IMAGE_PRESETS.content, { maxLongSide: 1600, targetBytes: 400 * 1024 });
  assert.deepEqual(IMAGE_PRESETS.cover, { maxLongSide: 2000, targetBytes: 600 * 1024 });
  const resolved = resolveOptions({ preset: "avatar", targetBytes: 50_000, maxLongSide: undefined });
  assert.equal(resolved.maxLongSide, 512);
  assert.equal(resolved.targetBytes, 50_000);
  assert.equal(resolved.initialQuality, 0.82);
  assert.equal(resolved.minQuality, 0.7);
  assert.equal(resolveOptions().preset, "content");
});

test("nunca amplia e mantém a proporção", () => {
  assert.equal(scaleFor(800, 600, 1600), 1);
  assert.deepEqual(fitLongSide(4032, 3024, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitLongSide(3024, 4032, 512), { width: 384, height: 512 });
  assert.deepEqual(fitLongSide(300, 200, 2000), { width: 300, height: 200 });
});

test("reduz em etapas de metade quando a redução passa de 2×", () => {
  assert.deepEqual(halvingSteps(4000, 3000, 1600, 1200), [{ width: 2000, height: 1500 }, { width: 1600, height: 1200 }]);
  assert.deepEqual(halvingSteps(4000, 3000, 500, 375), [
    { width: 2000, height: 1500 }, { width: 1000, height: 750 }, { width: 500, height: 375 },
  ]);
  assert.deepEqual(halvingSteps(1800, 600, 1800, 600), [{ width: 1800, height: 600 }]);
});

test("qualidade de 0.82 até o piso 0.70, em passos de 0.04", () => {
  assert.deepEqual(qualitySchedule(0.82, 0.7, 0.04), [0.82, 0.78, 0.74, 0.7]);
  assert.deepEqual(qualitySchedule(0.9, 0.75, 0.1), [0.9, 0.8, 0.75]);
});

test("extensão pelo tipo final", () => {
  assert.equal(extensionFor("image/webp"), "webp");
  assert.equal(extensionFor("image/jpeg"), "jpg");
  assert.equal(extensionFor("image/png"), "png");
  assert.equal(extensionFor("image/gif"), "gif");
});

test("lê tamanho e orientação EXIF do cabeçalho JPEG", () => {
  const rotated = readImageHeader(jpeg(4032, 3024, 6));
  assert.deepEqual(rotated, { width: 4032, height: 3024, orientation: 6, hasMetadata: true });
  assert.deepEqual(orientedSize(rotated!), { width: 3024, height: 4032 });
  assert.deepEqual(readImageHeader(jpeg(800, 600)), { width: 800, height: 600, orientation: 1, hasMetadata: false });
  assert.deepEqual(readImageHeader(png(640, 480)), { width: 640, height: 480, orientation: 1, hasMetadata: false });
  assert.equal(readImageHeader(bytes("%PDF-1.7")), null);
});

test("GIF animado, SVG e arquivos que não são imagem", () => {
  assert.equal(sniffFormat(gif(1)), "gif");
  assert.equal(isAnimatedGif(gif(1)), false);
  assert.equal(isAnimatedGif(gif(3)), true);
  assert.equal(sniffFormat(bytes('<?xml version="1.0"?>\n<!-- x --><svg xmlns="http://www.w3.org/2000/svg"></svg>')), "svg");
  assert.equal(sniffFormat(bytes("%PDF-1.7"), "application/pdf", "doc.pdf"), null);
});

test("não piorar: original menor só se já estiver no tamanho e sem EXIF", () => {
  const options = { maxLongSide: 1600, maxPassthroughBytes: 5 * 1024 * 1024 };
  const clean = { width: 800, height: 600, orientation: 1, hasMetadata: false };
  assert.equal(shouldKeepOriginal({ format: "jpeg", size: 40_000, header: clean, optimizedSize: 52_000 }, options), true);
  assert.equal(shouldKeepOriginal({ format: "jpeg", size: 60_000, header: clean, optimizedSize: 52_000 }, options), false);
  assert.equal(shouldKeepOriginal({ format: "jpeg", size: 40_000, header: { ...clean, hasMetadata: true }, optimizedSize: 52_000 }, options), false);
  assert.equal(shouldKeepOriginal({ format: "jpeg", size: 40_000, header: { ...clean, width: 2000 }, optimizedSize: 52_000 }, options), false);
  assert.equal(shouldKeepOriginal({ format: "heic", size: 40_000, header: clean, optimizedSize: 52_000 }, options), false);
});

test("validação da entrada com mensagens em português", async () => {
  const options = resolveOptions({ preset: "content" });
  await assert.rejects(inspectInput(new Blob([bytes("%PDF-1.7")], { type: "application/pdf" }), options),
    (error: unknown) => error instanceof ImageOptimizationError && error.code === "unsupported" && /não é uma imagem/.test(error.message));
  await assert.rejects(inspectInput(new Blob([jpeg(10000, 8000)]), options),
    (error: unknown) => error instanceof ImageOptimizationError && error.code === "too-many-pixels" && /50 megapixels/.test(error.message));
  await assert.rejects(inspectInput(new Blob([jpeg(100, 100)]), { ...options, maxInputBytes: 10 }),
    (error: unknown) => error instanceof ImageOptimizationError && error.code === "too-large");
  await assert.rejects(inspectInput(new Blob([gif(2)]), { ...options, allowPassthrough: false }),
    (error: unknown) => error instanceof ImageOptimizationError && error.code === "not-allowed");
  const animated = await inspectInput(new Blob([gif(2)]), options);
  assert.equal(animated.passthrough, true);
  const still = await inspectInput(new Blob([gif(1)]), options);
  assert.equal(still.passthrough, false);
});
