// Descobre o formato da imagem pelos primeiros bytes do arquivo. Alguns
// celulares (Android/Google Fotos, navegadores dentro de apps) enviam a foto
// sem o tipo ou com um tipo genérico; o conteúdo do arquivo não engana.
// Sem dependências (testável no Node).

export type ImageKind = "jpeg" | "png" | "webp" | "heic";

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif"]);

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "png";
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(8, 12))) return "heic";
  return null;
}

/** Pelo tipo informado ou pela extensão do nome (quando não há bytes reconhecíveis). */
export function kindFromName(type: string, name: string): ImageKind | null {
  const value = `${type} ${name}`.toLowerCase();
  if (/image\/jpe?g|\.jpe?g\b/.test(value)) return "jpeg";
  if (/image\/png|\.png\b/.test(value)) return "png";
  if (/image\/webp|\.webp\b/.test(value)) return "webp";
  if (/image\/hei[cf]|\.hei[cf]\b/.test(value)) return "heic";
  return null;
}

// ---------------------------------------------------------------------------
// Leitura de cabeçalhos para o otimizador (lib/image-optimizer.ts). Tudo puro,
// sem DOM: só olha os bytes do arquivo.

/** Formatos que o otimizador reconhece na entrada. */
export type InputFormat = ImageKind | "gif" | "svg";

/** Como `sniffImage`, mas também reconhece GIF e SVG. */
export function sniffFormat(bytes: Uint8Array, type = "", name = ""): InputFormat | null {
  const kind = sniffImage(bytes);
  if (kind) return kind;
  if (bytes.length >= 6) {
    const head = String.fromCharCode(...bytes.slice(0, 6));
    if (head === "GIF87a" || head === "GIF89a") return "gif";
  }
  if (looksLikeSvg(bytes)) return "svg";
  const value = `${type} ${name}`.toLowerCase();
  if (/image\/gif|\.gif\b/.test(value)) return "gif";
  if (/image\/svg|\.svg\b/.test(value)) return "svg";
  return kindFromName(type, name);
}

function looksLikeSvg(bytes: Uint8Array) {
  // Texto: pula BOM, espaços, <?xml ...?>, comentários e <!DOCTYPE>.
  const text = new TextDecoder().decode(bytes.slice(0, 2048)).replace(/^﻿/, "");
  const cleaned = text.replace(/<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/gi, "").trimStart();
  return /^<svg[\s>]/i.test(cleaned);
}

/** GIF com mais de um quadro (animado). Percorre os blocos do arquivo. */
export function isAnimatedGif(bytes: Uint8Array) {
  if (bytes.length < 13) return false;
  let offset = 13;
  const flags = bytes[10];
  if (flags & 0x80) offset += 3 * 2 ** ((flags & 0x07) + 1);
  let frames = 0;
  const skipSubBlocks = () => {
    while (offset < bytes.length) {
      const size = bytes[offset++];
      if (size === 0) return;
      offset += size;
    }
  };
  while (offset < bytes.length) {
    const block = bytes[offset++];
    if (block === 0x3b) break; // fim do arquivo
    if (block === 0x21) { offset++; skipSubBlocks(); continue; } // extensão
    if (block !== 0x2c) break; // bloco inválido
    if (++frames > 1) return true;
    const local = bytes[offset + 8];
    offset += 9;
    if (local & 0x80) offset += 3 * 2 ** ((local & 0x07) + 1);
    offset++; // tamanho mínimo do código LZW
    skipSubBlocks();
  }
  return false;
}

export type ImageHeader = {
  /** Largura e altura como estão gravadas (antes de aplicar a orientação EXIF). */
  width: number;
  height: number;
  /** Orientação EXIF (1 = normal; 5–8 trocam largura e altura). */
  orientation: number;
  /** O arquivo traz EXIF/XMP (podem incluir GPS, modelo do aparelho...). */
  hasMetadata: boolean;
};

const u16 = (b: Uint8Array, i: number, little = false) => little ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1];
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32 = (b: Uint8Array, i: number, little = false) =>
  little ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0 : ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const ascii = (b: Uint8Array, start: number, length: number) => String.fromCharCode(...b.slice(start, start + length));

function exifOrientation(b: Uint8Array, start: number, end: number) {
  // start aponta para "Exif\0\0"; depois vem o cabeçalho TIFF.
  const tiff = start + 6;
  if (tiff + 8 > end) return 1;
  const little = ascii(b, tiff, 2) === "II";
  const ifd = tiff + u32(b, tiff + 4, little);
  if (ifd + 2 > end) return 1;
  const count = u16(b, ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    if (u16(b, entry, little) === 0x0112) {
      const value = u16(b, entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function jpegHeader(b: Uint8Array): ImageHeader | null {
  let offset = 2;
  let orientation = 1;
  let hasMetadata = false;
  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) { offset++; continue; }
    const marker = b[offset + 1];
    if (marker === 0xff) { offset++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) break; // fim / início dos dados da imagem
    const length = u16(b, offset + 2);
    const start = offset + 4;
    const end = Math.min(b.length, offset + 2 + length);
    if (marker === 0xe1) {
      if (ascii(b, start, 6) === "Exif\0\0") { hasMetadata = true; orientation = exifOrientation(b, start, end); }
      else if (ascii(b, start, 28) === "http://ns.adobe.com/xap/1.0/") hasMetadata = true;
    }
    // SOF0–SOF15, exceto DHT (C4), JPG (C8) e DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && start + 5 <= b.length) {
      return { height: u16(b, start + 1), width: u16(b, start + 3), orientation, hasMetadata };
    }
    offset += 2 + length;
  }
  return null;
}

function pngHeader(b: Uint8Array): ImageHeader | null {
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  let hasMetadata = false;
  let offset = 8;
  while (offset + 8 <= b.length) {
    const length = u32(b, offset);
    const type = ascii(b, offset + 4, 4);
    if (type === "eXIf") hasMetadata = true;
    if (type === "iTXt" && ascii(b, offset + 8, 17) === "XML:com.adobe.xmp") hasMetadata = true;
    if (type === "IDAT" || type === "IEND") break;
    offset += 12 + length;
  }
  return { width: u32(b, 16), height: u32(b, 20), orientation: 1, hasMetadata };
}

function webpHeader(b: Uint8Array): ImageHeader | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X") {
    const flags = b[20];
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, orientation: 1, hasMetadata: Boolean(flags & 0x0c) };
  }
  if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return { width: u16(b, 26, true) & 0x3fff, height: u16(b, 28, true) & 0x3fff, orientation: 1, hasMetadata: false };
  }
  if (chunk === "VP8L" && b[20] === 0x2f) {
    const bits = u32(b, 21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, orientation: 1, hasMetadata: false };
  }
  return null;
}

/**
 * Dimensões, orientação EXIF e presença de metadados, lidas do cabeçalho
 * (sem decodificar a imagem). Para JPEG, passe os primeiros ~256 KB: o EXIF
 * vem antes do tamanho. Devolve null se não reconhecer.
 */
export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  try {
    const kind = sniffFormat(bytes);
    if (kind === "jpeg") return jpegHeader(bytes);
    if (kind === "png") return pngHeader(bytes);
    if (kind === "webp") return webpHeader(bytes);
    if (kind === "gif") return { width: u16(bytes, 6, true), height: u16(bytes, 8, true), orientation: 1, hasMetadata: false };
  } catch { /* cabeçalho truncado */ }
  return null;
}

/** Tamanho já com a orientação aplicada (5–8 = foto deitada no arquivo). */
export function orientedSize(header: Pick<ImageHeader, "width" | "height" | "orientation">) {
  return header.orientation >= 5 ? { width: header.height, height: header.width } : { width: header.width, height: header.height };
}
