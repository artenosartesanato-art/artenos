import { test } from "node:test";
import assert from "node:assert/strict";
import { kindFromName, sniffImage } from "../../lib/image-sniff.ts";

const bytes = (...values: (number | string)[]) => new Uint8Array(values.flatMap((v) => typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v]));

test("reconhece a foto pelo conteúdo, mesmo sem tipo", () => {
  assert.equal(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0)), "jpeg");
  assert.equal(sniffImage(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a)), "png");
  assert.equal(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WEBP")), "webp");
  assert.equal(sniffImage(bytes(0, 0, 0, 0x18, "ftypheic")), "heic");
  assert.equal(sniffImage(bytes(0, 0, 0, 0x18, "ftypmif1")), "heic");
  assert.equal(sniffImage(bytes("%PDF-1.7")), null);
});

test("tipo pelo nome quando necessário", () => {
  assert.equal(kindFromName("", "IMG_0001.HEIC"), "heic");
  assert.equal(kindFromName("", "foto.jpeg"), "jpeg");
  assert.equal(kindFromName("image/heif", ""), "heic");
  assert.equal(kindFromName("", "documento.pdf"), null);
});
