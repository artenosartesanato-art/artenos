// Texto rico simples das descrições: parágrafos (linha em branco), **negrito**
// e listas (linhas começando com "- " ou "1. "). Guardado como texto puro e
// renderizado como elementos React, sem HTML: nada do que a loja escreve vira
// marcação no navegador.

export const DESCRIPTION_MAX_LENGTH = 2000;
export const NOTES_MAX_LENGTH = 500;

export type Inline = { text: string; bold: boolean };
export type Block =
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

const BULLET = /^\s*[-•*]\s+/;
const NUMBER = /^\s*\d{1,2}[.)]\s+/;

export function parseInline(text: string): Inline[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean);
  return parts.map((part) => part.startsWith("**") && part.endsWith("**") && part.length > 4
    ? { text: part.slice(2, -2), bold: true }
    : { text: part, bold: false });
}

export function parseRichText(source: string | null | undefined): Block[] {
  const blocks: Block[] = [];
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  let paragraph: Inline[][] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph });
    if (list) blocks.push({ type: "list", ...list });
    paragraph = [];
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const ordered = NUMBER.test(line);
    if (ordered || BULLET.test(line)) {
      if (paragraph.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(parseInline(line.replace(ordered ? NUMBER : BULLET, "")));
      continue;
    }
    if (list) flush();
    paragraph.push(parseInline(line.trim()));
  }
  flush();
  return blocks;
}

/** Texto corrido sem marcações, para o resumo no card, no carrinho e no checkout. */
export function plainSummary(source: string | null | undefined, max = 160): string {
  const text = String(source ?? "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET, "").replace(NUMBER, "").trim())
    .filter(Boolean)
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).trimEnd()}…`;
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inlineHtml = (parts: Inline[]) => parts.map((part) => part.bold ? `<b>${escapeHtml(part.text)}</b>` : escapeHtml(part.text)).join("");

/** Texto salvo → HTML do editor visual (escapado: nada do texto vira marcação). */
export function richTextToHtml(source: string | null | undefined): string {
  return parseRichText(source).map((block) => block.type === "paragraph"
    ? `<p>${block.lines.map(inlineHtml).join("<br>")}</p>`
    : `<${block.ordered ? "ol" : "ul"}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${block.ordered ? "ol" : "ul"}>`,
  ).join("");
}

const inlineText = (parts: Inline[]) => {
  // Junta pedaços vizinhos com o mesmo estilo e tira negrito vazio.
  const merged: Inline[] = [];
  for (const part of parts) {
    if (!part.text) continue;
    const last = merged[merged.length - 1];
    if (last && last.bold === part.bold) last.text += part.text;
    else merged.push({ ...part });
  }
  return merged.map((part) => {
    if (!part.bold || !part.text.trim()) return part.text;
    // Espaços ficam fora do ** (senão a marcação não fecha certo).
    const [, lead, core, tail] = part.text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    return `${lead}**${core}**${tail}`;
  }).join("").replace(/[ \t]+$/g, "");
};

/** Blocos lidos do editor visual → texto salvo (o mesmo formato de sempre). */
export function blocksToRichText(blocks: Block[]): string {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const lines = block.lines.map(inlineText);
      if (!lines.some((line) => line.trim())) continue;
      out.push(lines.join("\n").trim());
    } else {
      const items = block.items.map(inlineText).map((item) => item.trim()).filter(Boolean);
      if (items.length) out.push(items.map((item, index) => (block.ordered ? `${index + 1}. ` : "- ") + item).join("\n"));
    }
  }
  return out.join("\n\n");
}
