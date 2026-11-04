import { Crop } from "@/components/icons";

/** Botão "Ajustar enquadramento" (mesmo visual em todas as fotos). */
export function AdjustFramingButton({ onClick, disabled, busy = false, className = "" }: {
  onClick: () => void; disabled?: boolean; busy?: boolean; className?: string;
}) {
  return (
    <button type="button" className={`adjust-framing-btn ${className}`.trim()} onClick={onClick}
      disabled={disabled || busy} aria-busy={busy || undefined}>
      <Crop size={15} aria-hidden="true" />
      {busy ? "Abrindo…" : "Ajustar enquadramento"}
    </button>
  );
}
