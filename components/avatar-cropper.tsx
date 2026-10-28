"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import {
  clampCrop, drawParams, fitWithin, initialCrop, rotateCrop, rotatedSize, displayScale, zoomAround,
  MAX_ZOOM, MIN_ZOOM, OUTPUT_SIZE, type Crop,
} from "@/lib/avatar-crop";

export type CroppedAvatar = { avatar: Blob; original: Blob };

type Props = {
  /** URL da imagem a enquadrar (arquivo escolhido ou original já salvo). */
  src: string | null;
  onCancel: () => void;
  onSave: (result: CroppedAvatar) => Promise<void>;
};

/** Gera um blob WebP (ou JPEG, em navegadores sem WebP no canvas). */
function canvasBlob(canvas: HTMLCanvasElement, quality = 0.9) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((webp) => {
      if (webp && webp.type === "image/webp") return resolve(webp);
      canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error("canvas"))), "image/jpeg", quality);
    }, "image/webp", quality);
  });
}

function renderCrop(image: HTMLImageElement, crop: Crop, stage: number) {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const params = drawParams(crop, image.naturalWidth, image.naturalHeight, stage);
  ctx.translate(params.centerX, params.centerY);
  ctx.rotate(params.radians);
  ctx.scale(params.scale, params.scale);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return canvasBlob(canvas);
}

/** Original reduzido, já com a rotação aplicada, para reenquadrar depois. */
function renderOriginal(image: HTMLImageElement, rotation: Crop["rotation"]) {
  const fit = fitWithin(image.naturalWidth, image.naturalHeight);
  const size = rotatedSize(fit.width, fit.height, rotation);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(size.width / 2, size.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(image, -fit.width / 2, -fit.height / 2, fit.width, fit.height);
  return canvasBlob(canvas, 0.88);
}

export function AvatarCropper({ src, onCancel, onSave }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const [stage, setStage] = useState(300);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<Crop>(initialCrop);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Carrega a imagem e recomeça o enquadramento a cada nova foto.
  useEffect(() => {
    if (!src) return;
    let active = true;
    queueMicrotask(() => { setNatural(null); setCrop(initialCrop); setFailed(false); });
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (!active) return;
      imageRef.current = image;
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => { if (active) setFailed(true); };
    image.src = src;
    return () => { active = false; };
  }, [src]);

  // Área quadrada responsiva (cabe no celular).
  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => setStage(Math.round(element.getBoundingClientRect().width) || 300);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [src, natural]);

  const update = useCallback((next: (current: Crop) => Crop) => {
    if (!natural) return;
    setCrop((current) => clampCrop(next(current), natural.width, natural.height, stage));
  }, [natural, stage]);

  const zoomTo = useCallback((zoom: number, px = 0, py = 0) => {
    if (!natural) return;
    setCrop((current) => zoomAround(current, zoom, px, py, natural.width, natural.height, stage));
  }, [natural, stage]);

  // Roda do mouse: zoom no ponto do cursor (listener não passivo para impedir a rolagem da página).
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = element!.getBoundingClientRect();
      setCrop((current) => natural
        ? zoomAround(current, current.zoom * Math.exp(-event.deltaY * 0.0015),
          event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2,
          natural.width, natural.height, stage)
        : current);
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [natural, stage]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setDragging(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: crop.zoom };
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2 && pinch.current) {
      // Pinça: zoom no ponto médio entre os dedos.
      const [a, b] = [...pointers.current.values()];
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance;
      zoomTo(pinch.current.zoom * ratio,
        (a.x + b.x) / 2 - rect.left - rect.width / 2, (a.y + b.y) / 2 - rect.top - rect.height / 2);
      return;
    }
    update((current) => ({ ...current, x: current.x + point.x - previous.x, y: current.y + point.y - previous.y }));
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 30 : 10;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    if (event.key in moves) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      update((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomTo(crop.zoom + 0.1);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomTo(crop.zoom - 0.1);
    } else if (event.key === "0") {
      event.preventDefault();
      setCrop(initialCrop);
    }
  }

  async function save() {
    const image = imageRef.current;
    if (!image || !natural || saving) return;
    setSaving(true);
    try {
      const [avatar, original] = await Promise.all([renderCrop(image, crop, stage), renderOriginal(image, crop.rotation)]);
      await onSave({ avatar, original });
    } finally {
      setSaving(false);
    }
  }

  const scale = natural ? displayScale(natural.width, natural.height, stage, crop) : 1;
  const imageStyle = (size: number): React.CSSProperties => ({
    width: natural?.width,
    height: natural?.height,
    transform: `translate(-50%, -50%) translate(${(crop.x * size) / stage}px, ${(crop.y * size) / stage}px) rotate(${crop.rotation}deg) scale(${(scale * size) / stage})`,
  });

  return (
    <Dialog open={Boolean(src)} onClose={() => { if (!saving) onCancel(); }} labelledBy="crop-titulo"
      describedBy="crop-ajuda" className="crop-dialog" closeLabel="Cancelar">
      <h2 id="crop-titulo" className="crop-title">Ajustar foto de perfil</h2>
      <p id="crop-ajuda" className="crop-help">
        Arraste para posicionar e use o zoom para enquadrar. No teclado: setas movem, + e − aproximam, 0 recomeça.
      </p>

      <div className="crop-layout">
        <div ref={stageRef} className={`crop-stage${dragging ? " is-dragging" : ""}`} tabIndex={0}
          role="group" aria-label="Área de enquadramento da foto"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp} onKeyDown={onKeyDown}>
          {natural && src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="crop-image" src={src} alt="" draggable={false} style={imageStyle(stage)} />
          )}
          {!natural && !failed && <span className="crop-loading"><LoaderCircle size={28} className="seller-spin" /> Carregando foto…</span>}
          {failed && <span className="crop-loading">Não foi possível abrir esta imagem. Escolha outra foto.</span>}
          <span className="crop-mask" aria-hidden="true" />
          <span className="crop-grid" aria-hidden="true" />
        </div>

        <div className="crop-side">
          <p className="crop-preview-label">Como vai aparecer</p>
          <div className="crop-previews" aria-hidden="true">
            {[80, 40].map((size) => (
              <span key={size} className="crop-preview" style={{ width: size, height: size }}>
                {natural && src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="crop-image" src={src} alt="" style={imageStyle(size)} />
                )}
              </span>
            ))}
          </div>

          <label className="crop-zoom">
            <span>Zoom</span>
            <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={crop.zoom}
              onChange={(event) => zoomTo(Number(event.target.value))} disabled={!natural}
              aria-valuetext={`${Math.round(crop.zoom * 100)}%`} />
          </label>
          <div className="crop-tools">
            <button type="button" className="an-btn an-btn--secondary an-btn--sm" disabled={!natural}
              onClick={() => natural && setCrop((current) => rotateCrop(current, natural.width, natural.height, stage))}>
              <RefreshCw size={15} /> Girar
            </button>
            <button type="button" className="an-btn an-btn--secondary an-btn--sm" disabled={!natural}
              onClick={() => setCrop((current) => ({ ...initialCrop, rotation: current.rotation }))}>
              Centralizar
            </button>
          </div>
        </div>
      </div>

      <div className="crop-actions">
        <button type="button" className="an-btn an-btn--secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="button" className="an-btn" onClick={save} disabled={!natural || saving} aria-busy={saving}>
          {saving ? "Salvando…" : "Salvar foto"}
        </button>
      </div>
    </Dialog>
  );
}
