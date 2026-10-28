// Matemática do enquadramento da foto de perfil (sem DOM; testável no Node).
// Coordenadas: o centro da área de recorte é (0, 0); `x`/`y` é o deslocamento
// do centro da imagem em pixels de tela; `zoom` 1 = a imagem cobre o círculo.

export type Crop = { x: number; y: number; zoom: number; rotation: 0 | 90 | 180 | 270 };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const OUTPUT_SIZE = 512;
export const ORIGINAL_MAX_SIDE = 1600;

export const initialCrop: Crop = { x: 0, y: 0, zoom: 1, rotation: 0 };

/** Largura e altura da imagem depois de girar. */
export function rotatedSize(width: number, height: number, rotation: Crop["rotation"]) {
  return rotation % 180 === 0 ? { width, height } : { width: height, height: width };
}

/** Escala (px de tela por px da imagem) para a imagem cobrir a área no zoom dado. */
export function displayScale(width: number, height: number, stage: number, crop: Pick<Crop, "zoom" | "rotation">) {
  const size = rotatedSize(width, height, crop.rotation);
  return (stage / Math.min(size.width, size.height)) * crop.zoom;
}

/** Impede que apareça fundo vazio dentro do círculo. */
export function clampCrop(crop: Crop, width: number, height: number, stage: number): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, crop.zoom));
  const scale = displayScale(width, height, stage, { zoom, rotation: crop.rotation });
  const size = rotatedSize(width, height, crop.rotation);
  const maxX = Math.max(0, (size.width * scale - stage) / 2);
  const maxY = Math.max(0, (size.height * scale - stage) / 2);
  const limit = (value: number, max: number) => Math.min(max, Math.max(-max, value)) || 0;
  return { ...crop, zoom, x: limit(crop.x, maxX), y: limit(crop.y, maxY) };
}

/** Zoom mantendo fixo o ponto sob o cursor/dedos (`px`,`py` relativos ao centro). */
export function zoomAround(crop: Crop, nextZoom: number, px: number, py: number, width: number, height: number, stage: number) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const ratio = zoom / crop.zoom;
  return clampCrop({
    ...crop,
    zoom,
    x: px - (px - crop.x) * ratio,
    y: py - (py - crop.y) * ratio,
  }, width, height, stage);
}

/** Gira 90° no sentido horário e reencaixa. */
export function rotateCrop(crop: Crop, width: number, height: number, stage: number) {
  const rotation = ((crop.rotation + 90) % 360) as Crop["rotation"];
  return clampCrop({ ...crop, rotation, x: 0, y: 0 }, width, height, stage);
}

/**
 * Parâmetros para desenhar o recorte num canvas de `output` px:
 * translate(center) → rotate → scale → drawImage(-w/2, -h/2).
 */
export function drawParams(crop: Crop, width: number, height: number, stage: number, output = OUTPUT_SIZE) {
  const ratio = output / stage;
  return {
    centerX: output / 2 + crop.x * ratio,
    centerY: output / 2 + crop.y * ratio,
    radians: (crop.rotation * Math.PI) / 180,
    scale: displayScale(width, height, stage, crop) * ratio,
  };
}

/** Tamanho reduzido para guardar o original (lado maior até `max`). */
export function fitWithin(width: number, height: number, max = ORIGINAL_MAX_SIDE) {
  const factor = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * factor), height: Math.round(height * factor) };
}

/** Caminho do original guardado ao lado da foto recortada. */
export function originalPathFor(avatarPath: string) {
  return avatarPath.replace(/\.(webp|jpg|jpeg|png)$/i, "") + "-original.webp";
}
