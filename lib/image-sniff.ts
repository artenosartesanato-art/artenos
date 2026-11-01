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
