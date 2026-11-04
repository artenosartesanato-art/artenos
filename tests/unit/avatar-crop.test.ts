import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampCrop, displayScale, drawParams, fitWithin, initialCrop, originalPathFor, rotateCrop, zoomAround,
} from "../../lib/avatar-crop.ts";

// Foto paisagem 1200×800 numa área de 300 px.
const W = 1200, H = 800, S = 300;

test("zoom 1 faz o lado menor cobrir exatamente o círculo", () => {
  assert.equal(displayScale(W, H, S, initialCrop), 300 / 800);
});

test("arrastar além da borda é limitado (sem fundo vazio)", () => {
  const crop = clampCrop({ ...initialCrop, x: 999, y: 999 }, W, H, S);
  // Largura exibida 450 → sobra 75 de cada lado; altura cobre exata → y = 0.
  assert.equal(crop.x, 75);
  assert.equal(crop.y, 0);
  assert.equal(clampCrop({ ...initialCrop, x: -999 }, W, H, S).x, -75);
});

test("zoom fica entre 1 e 4", () => {
  assert.equal(clampCrop({ ...initialCrop, zoom: 0.2 }, W, H, S).zoom, 1);
  assert.equal(clampCrop({ ...initialCrop, zoom: 9 }, W, H, S).zoom, 4);
});

test("zoom mantém fixo o ponto sob o cursor", () => {
  const crop = zoomAround(initialCrop, 2, 60, -30, W, H, S);
  // O ponto (60,-30) da tela continua sobre o mesmo pixel da imagem.
  const before = { x: (60 - 0) / displayScale(W, H, S, initialCrop), y: (-30 - 0) / displayScale(W, H, S, initialCrop) };
  const after = { x: (60 - crop.x) / displayScale(W, H, S, crop), y: (-30 - crop.y) / displayScale(W, H, S, crop) };
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
});

test("girar troca largura e altura e recentraliza", () => {
  const crop = rotateCrop({ ...initialCrop, x: 50 }, W, H, S);
  assert.equal(crop.rotation, 90);
  assert.equal(crop.x, 0);
  assert.equal(displayScale(W, H, S, crop), 300 / 800);
  assert.equal(rotateCrop({ ...initialCrop, rotation: 270 }, W, H, S).rotation, 0);
});

test("parâmetros do canvas escalam da tela para 512 px", () => {
  const params = drawParams({ ...initialCrop, x: 30 }, W, H, S, 600);
  assert.equal(params.centerX, 300 + 60);
  assert.equal(params.centerY, 300);
  assert.equal(params.scale, (300 / 800) * 2);
});

test("original reduzido e caminho derivado", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.equal(originalPathFor("u/abc.webp"), "u/abc-original.webp");
  assert.equal(originalPathFor("u/abc.jpg"), "u/abc-original.webp");
});

test("formato largo (capa 3:1) e retrato (peça 4:5) cobrem a área sem sobrar fundo", async () => {
  const { clampCrop, displayScale, drawParams } = await import("../../lib/avatar-crop.ts");
  // Foto 4000×3000 numa área de 300 px de largura, capa 3:1 (300×100).
  const wide = displayScale(4000, 3000, 300, { zoom: 1, rotation: 0 }, 3);
  assert.equal(wide, 300 / 4000); // a largura manda
  // Pode mover na vertical (a foto é mais alta que a faixa), mas não na horizontal.
  const moved = clampCrop({ x: 50, y: 500, zoom: 1, rotation: 0 }, 4000, 3000, 300, 3);
  assert.equal(moved.x, 0);
  assert.equal(moved.y, (3000 * wide - 100) / 2);
  // Retrato 4:5: área 300×375; uma foto quadrada precisa cobrir a altura.
  const tall = displayScale(1000, 1000, 300, { zoom: 1, rotation: 0 }, 0.8);
  assert.equal(tall, 375 / 1000);
  // Centro do desenho no meio da saída 1200×1500.
  const params = drawParams({ x: 0, y: 0, zoom: 1, rotation: 0 }, 1000, 1000, 300, 1200, 0.8);
  assert.equal(params.centerX, 600);
  assert.equal(params.centerY, 750);
});
