// Tipos e opções de variação permitidos (cadastro da peça). Sem dependências
// (testável no Node). As MESMAS regras são conferidas no banco
// (variation_option_check, 20261116_variacoes_padronizadas.sql).
//
// O vendedor não escreve o tipo: escolhe da lista. As opções saem de listas
// fechadas (Cor, Material, letras de tamanho) ou são montadas com números
// (medida, numeração, comprimento, quantidade). Só Estampa, Modelo e Aroma
// aceitam texto livre, curto, com o filtro de termos e a revisão da equipe.

export const VARIATION_TYPES = ["Cor", "Tamanho", "Comprimento", "Quantidade", "Material", "Estampa", "Modelo", "Aroma"] as const;
export type VariationType = (typeof VARIATION_TYPES)[number];

export type VariationKind = "color" | "material" | "size" | "length" | "quantity" | "free";

export const TYPE_KIND: Record<VariationType, VariationKind> = {
  Cor: "color", Tamanho: "size", Comprimento: "length", Quantidade: "quantity",
  Material: "material", Estampa: "free", Modelo: "free", Aroma: "free",
};

export const TYPE_HINT: Record<VariationType, string> = {
  Cor: "Marque as cores da paleta.",
  Tamanho: "Marque as letras ou adicione uma medida (largura × altura) ou numeração.",
  Comprimento: "Digite o comprimento em centímetros.",
  Quantidade: "Digite quantas unidades vêm em cada opção (ex.: 4 vira “4 unidades”).",
  Material: "Marque os materiais da lista.",
  Estampa: "Escreva o nome da estampa (até 20 letras). A equipe Artenós revisa os nomes.",
  Modelo: "Escreva o nome do modelo (até 20 letras). A equipe Artenós revisa os nomes.",
  Aroma: "Escreva o aroma (até 20 letras). A equipe Artenós revisa os nomes.",
};

/** Paleta fechada (nome exibido + amostra usada no cadastro e na vitrine). */
export const COLORS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: "Branco", hex: "#ffffff" }, { name: "Off-white", hex: "#f4efe4" }, { name: "Bege", hex: "#d9c3a0" },
  { name: "Cru", hex: "#e8dcc4" }, { name: "Caramelo", hex: "#b4773f" }, { name: "Marrom", hex: "#6b4429" },
  { name: "Preto", hex: "#1f1b19" }, { name: "Cinza", hex: "#8c8c8c" }, { name: "Azul", hex: "#3f6fb5" },
  { name: "Azul-claro", hex: "#9cc3e6" }, { name: "Azul-marinho", hex: "#1f2f55" }, { name: "Verde", hex: "#3f8a4f" },
  { name: "Verde-musgo", hex: "#5d6b3a" }, { name: "Amarelo", hex: "#f1c93b" }, { name: "Mostarda", hex: "#c9a227" },
  { name: "Laranja", hex: "#e57b2e" }, { name: "Terracota", hex: "#b2593b" }, { name: "Vermelho", hex: "#c62f2f" },
  { name: "Vinho", hex: "#6e1f2e" }, { name: "Rosa", hex: "#e48fa6" }, { name: "Lilás", hex: "#b59ad6" },
  { name: "Roxo", hex: "#6b3f8f" }, { name: "Dourado", hex: "#c8a24a" }, { name: "Prateado", hex: "#b8bcc2" },
  { name: "Colorido", hex: "conic-gradient(#e57b2e,#f1c93b,#3f8a4f,#3f6fb5,#b59ad6,#e57b2e)" },
];

export const MATERIALS = [
  "Algodão", "Linho", "Lã", "Barbante", "Seda", "Couro", "Madeira", "Bambu", "Fibra natural", "Palha",
  "Cerâmica", "Porcelana", "Argila", "Vidro", "Metal", "Prata", "Resina", "Papel", "Tecido", "Pedra",
] as const;

export const SIZE_LETTERS = ["PP", "P", "M", "G", "GG", "XG", "Único"] as const;

export const FREE_TEXT_MAX = 20;
const MEASURE_MAX = 999;

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** Chave de comparação de nomes de lista: sem acento, maiúscula, hífen ou espaço. */
const listKey = (value: string) => fold(value).replace(/[-\s]/g, "");
/** Nomes que já circulavam antes da paleta fechada. */
const COLOR_ALIASES: Record<string, string> = { natural: "Cru", offwhite: "Off-white", multicolor: "Colorido", colorida: "Colorido" };
const clean = (value: string) => String(value ?? "").replace(/\s+/g, " ").trim();
const decimal = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ","));

export function isVariationType(name: string): name is VariationType {
  return (VARIATION_TYPES as readonly string[]).includes(name);
}

/** Nome antigo (digitado antes da lista fechada) → tipo da lista, ou null. */
export function canonicalType(name: string): VariationType | null {
  const key = fold(name);
  const aliases: Record<string, VariationType> = {
    cor: "Cor", cores: "Cor", tamanho: "Tamanho", tamanhos: "Tamanho", numeracao: "Tamanho", medida: "Tamanho", medidas: "Tamanho",
    comprimento: "Comprimento", quantidade: "Quantidade", kit: "Quantidade", kits: "Quantidade", unidades: "Quantidade", pacote: "Quantidade",
    material: "Material", materiais: "Material", estampa: "Estampa", estampas: "Estampa", estilo: "Modelo", modelo: "Modelo", modelos: "Modelo",
    aroma: "Aroma", aromas: "Aroma", fragrancia: "Aroma", essencia: "Aroma",
  };
  return aliases[key] ?? null;
}

export function quantityOption(units: number) {
  return units === 1 ? "1 unidade" : `${units} unidades`;
}

export function lengthOption(cm: number) {
  return `${decimal(cm)} cm`;
}

export function measureOption(width: number, height: number) {
  return `${decimal(width)} × ${decimal(height)} cm`;
}

const validMeasure = (value: number) => Number.isFinite(value) && value > 0 && value <= MEASURE_MAX && Math.round(value * 10) === value * 10;

/** Número digitado no cadastro (aceita vírgula); null se inválido. */
export function measureFrom(raw: string) {
  const value = Number(String(raw ?? "").replace(",", ".").trim());
  return validMeasure(value) ? value : null;
}

export function quantityFrom(raw: string) {
  const value = Number(String(raw ?? "").trim());
  return Number.isInteger(value) && value >= 1 && value <= 9999 ? value : null;
}

const NUMBER = "(\\d{1,3}(?:,\\d)?)";
const LENGTH_RE = new RegExp(`^${NUMBER} cm$`);
const MEASURE_RE = new RegExp(`^${NUMBER} × ${NUMBER} cm$`);
const QUANTITY_RE = /^([1-9]\d{0,3}) unidades?$/;
const NUMBER_SIZE_RE = /^([1-9]\d?)$/;

/**
 * Confere uma opção para o tipo. Devolve a opção no formato oficial (ex.:
 * "azul" → "Azul") ou a mensagem de erro.
 */
export function checkOption(type: string, raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const option = clean(raw);
  if (!isVariationType(type)) return { ok: false, message: "Escolha um tipo de variação da lista." };
  if (!option) return { ok: false, message: "Escolha ou digite a opção." };
  const fail = (message: string) => ({ ok: false as const, message });
  switch (TYPE_KIND[type]) {
    case "color": {
      const alias = COLOR_ALIASES[listKey(option)];
      const color = COLORS.find((item) => listKey(item.name) === (alias ? listKey(alias) : listKey(option)));
      return color ? { ok: true, value: color.name } : fail(`“${option}” não está na paleta de cores.`);
    }
    case "material": {
      const material = MATERIALS.find((item) => listKey(item) === listKey(option));
      return material ? { ok: true, value: material } : fail(`“${option}” não está na lista de materiais.`);
    }
    case "size": {
      const letter = SIZE_LETTERS.find((item) => fold(item) === fold(option));
      if (letter) return { ok: true, value: letter };
      if (NUMBER_SIZE_RE.test(option)) return { ok: true, value: String(Number(option)) };
      const measure = option.replace(/\s*[x×]\s*/i, " × ").replace(/\s*cm$/i, " cm");
      const match = measure.match(MEASURE_RE);
      if (match && validMeasure(Number(match[1].replace(",", "."))) && validMeasure(Number(match[2].replace(",", "."))))
        return { ok: true, value: measure };
      return fail(`“${option}” não é um tamanho válido. Use PP a XG, Único, uma numeração (ex.: 38) ou uma medida (ex.: 30 × 40 cm).`);
    }
    case "length": {
      const match = option.replace(/\s*cm$/i, " cm").match(LENGTH_RE);
      return match && validMeasure(Number(match[1].replace(",", ".")))
        ? { ok: true, value: option.replace(/\s*cm$/i, " cm") }
        : fail(`“${option}” não é um comprimento válido (ex.: 45 cm).`);
    }
    case "quantity": {
      const match = option.match(QUANTITY_RE);
      if (!match) return fail(`“${option}” não é uma quantidade válida (ex.: 4 unidades).`);
      return { ok: true, value: quantityOption(Number(match[1])) };
    }
    case "free":
      if (option.length > FREE_TEXT_MAX) return fail(`Use até ${FREE_TEXT_MAX} caracteres.`);
      // Mesma classe de caracteres do banco: letras latinas (com acento), números e pontuação simples.
      if (!/^[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 '.&/-]*$/.test(option)) return fail("Use só letras, números e espaços.");
      return { ok: true, value: option };
  }
}

export function colorHex(name: string) {
  return COLORS.find((item) => listKey(item.name) === listKey(name))?.hex ?? null;
}

const rgb = (hex: string) => {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
};

/**
 * Cor escolhida no seletor (#rrggbb) → nome da paleta mais parecido. Assim o
 * vendedor escolhe a cor "no olho" e a opção continua com um nome da lista.
 */
export function nearestColor(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const [r, g, b] = rgb(hex);
  let best: { name: string; hex: string } | null = null;
  let bestDistance = Infinity;
  for (const color of COLORS) {
    if (!color.hex.startsWith("#")) continue; // "Colorido" não é uma cor só
    const [cr, cg, cb] = rgb(color.hex);
    // Distância ponderada (mais perto do que o olho percebe que a euclidiana simples).
    const mean = (r + cr) / 2;
    const distance = (2 + mean / 256) * (r - cr) ** 2 + 4 * (g - cg) ** 2 + (2 + (255 - mean) / 256) * (b - cb) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = color; }
  }
  return best;
}
