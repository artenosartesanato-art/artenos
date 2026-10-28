// Sons de interface sintetizados com Web Audio: sem arquivos de áudio, sem
// licenças de terceiros. Desligados por padrão e tocados só após uma ação da
// pessoa. Qualquer falha é silenciosa e nunca interrompe a ação principal.

export type UiSound = "added" | "removed" | "error";

const STORAGE_KEY = "artenos:sons-interface";
const CHANGE_EVENT = "artenos:sound-preference";
let context: AudioContext | null = null;
let lastPlayedAt = 0;

export function soundEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Armazenamento bloqueado: a preferência vale só nesta visita.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: enabled }));
  if (enabled) playUiSound("added", { force: true });
}

export function subscribeSoundPreference(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

// Notas suaves (Hz), duração (s) e volume baixo: um "plim" de madeira.
const PATTERNS: Record<UiSound, { notes: number[]; gap: number; length: number; type: OscillatorType; volume: number }> = {
  added: { notes: [659.25, 987.77], gap: 0.075, length: 0.22, type: "sine", volume: 0.07 },
  removed: { notes: [587.33, 440], gap: 0.07, length: 0.18, type: "sine", volume: 0.05 },
  error: { notes: [311.13, 293.66], gap: 0.09, length: 0.2, type: "triangle", volume: 0.045 },
};

export function playUiSound(sound: UiSound, options: { force?: boolean } = {}) {
  if (typeof window === "undefined") return;
  if (!options.force && !soundEnabled()) return;
  const now = performance.now();
  if (now - lastPlayedAt < 250) return; // evita sobreposição
  lastPlayedAt = now;
  try {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    context ??= new AudioCtor();
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const pattern = PATTERNS[sound];
    const start = context.currentTime + 0.01;
    pattern.notes.forEach((frequency, index) => {
      const ctx = context!;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = start + index * pattern.gap;
      oscillator.type = pattern.type;
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(pattern.volume, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + pattern.length);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + pattern.length + 0.02);
    });
  } catch {
    // Navegador sem áudio ou bloqueado: a interface segue normalmente.
  }
}
