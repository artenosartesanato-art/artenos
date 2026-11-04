// Sons da plataforma sintetizados com Web Audio: sem arquivos de áudio, sem
// licenças de terceiros (por isso não usamos o som do WhatsApp/iPhone, que tem
// direitos; o de mensagem segue o mesmo estilo: dois toques curtos e claros).
// Um único interruptor ("Sons da plataforma", desligado por padrão) vale para
// as ações e para os avisos. Qualquer falha é silenciosa.

export type UiSound = "added" | "removed" | "error" | "favorite" | "purchase" | "sent" | "success" | "tap";

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

// Notas (Hz), intervalo e duração (s) e volume baixo. `bell` soma a oitava
// (timbre de sino); `glide` faz a nota deslizar até a frequência indicada.
const PATTERNS: Record<UiSound, Pattern> = {
  added: { notes: [659.25, 987.77], gap: 0.075, length: 0.22, type: "sine", volume: 0.07, bell: true },
  removed: { notes: [587.33, 440], gap: 0.07, length: 0.18, type: "sine", volume: 0.05 },
  error: { notes: [311.13, 293.66], gap: 0.09, length: 0.2, type: "triangle", volume: 0.045 },
  favorite: { notes: [880, 1174.66], gap: 0.06, length: 0.2, type: "sine", volume: 0.065, bell: true },
  purchase: { notes: [523.25, 659.25, 783.99, 1046.5], gap: 0.07, length: 0.3, type: "sine", volume: 0.065, bell: true },
  sent: { notes: [620], gap: 0, length: 0.16, type: "sine", volume: 0.06, glide: 1240 },
  success: { notes: [659.25, 880], gap: 0.09, length: 0.26, type: "sine", volume: 0.065, bell: true },
  tap: { notes: [1400], gap: 0, length: 0.05, type: "sine", volume: 0.03 },
};

function audioContext() {
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  context ??= new AudioCtor();
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  return context;
}

type Pattern = { notes: number[]; gap: number; length: number; type: OscillatorType; volume: number; bell?: boolean; glide?: number };

function playPattern(pattern: Pattern) {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    const start = ctx.currentTime + 0.01;
    pattern.notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = start + index * pattern.gap;
      oscillator.type = pattern.type;
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(pattern.volume, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + pattern.length);
      if (pattern.glide) oscillator.frequency.exponentialRampToValueAtTime(pattern.glide, at + pattern.length * 0.8);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + pattern.length + 0.02);
      if (pattern.bell) {
        // Oitava acima, mais baixa e mais curta: brilho de sino.
        const overtone = ctx.createOscillator();
        const overtoneGain = ctx.createGain();
        overtone.type = "sine";
        overtone.frequency.setValueAtTime(frequency * 2, at);
        overtoneGain.gain.setValueAtTime(0.0001, at);
        overtoneGain.gain.exponentialRampToValueAtTime(pattern.volume * 0.3, at + 0.008);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, at + pattern.length * 0.6);
        overtone.connect(overtoneGain).connect(ctx.destination);
        overtone.start(at);
        overtone.stop(at + pattern.length);
      }
    });
  } catch {
    // Navegador sem áudio ou bloqueado: a interface segue normalmente.
  }
}

export function playUiSound(sound: UiSound, options: { force?: boolean } = {}) {
  if (typeof window === "undefined") return;
  if (!options.force && !soundEnabled()) return;
  const now = performance.now();
  if (now - lastPlayedAt < 250) return; // evita sobreposição
  lastPlayedAt = now;
  playPattern(PATTERNS[sound]);
}

/* Sons de aviso (mensagem nova, pedido atualizado) ----------------------------
   Seguem o mesmo interruptor "Sons da plataforma". Navegadores só liberam
   áudio depois do primeiro clique ou tecla na página; unlockAudio() é chamado
   nesse momento. */

export type NotificationSound = "message" | "update" | "soft";

let lastNotifiedAt = 0;

const NOTIFY_PATTERNS: Record<NotificationSound, Pattern> = {
  // Mensagem nova: dois toques curtos e claros, subindo (estilo app de mensagem).
  message: { notes: [1318.51, 1760], gap: 0.085, length: 0.28, type: "sine", volume: 0.11, bell: true },
  // Atualização de pedido/encomenda: acorde de três notas, mais calmo.
  update: { notes: [523.25, 659.25, 783.99], gap: 0.11, length: 0.32, type: "sine", volume: 0.07, bell: true },
  // Mensagem na conversa que já está aberta: um toque discreto.
  soft: { notes: [1174.66], gap: 0, length: 0.16, type: "sine", volume: 0.05, bell: true },
};

export const notificationSoundEnabled = soundEnabled;
export const setNotificationSoundEnabled = setSoundEnabled;
export const subscribeNotificationSoundPreference = subscribeSoundPreference;

export function unlockAudio() {
  if (typeof window === "undefined") return;
  try { audioContext(); } catch { /* sem áudio */ }
}

export function playNotificationSound(sound: NotificationSound) {
  if (typeof window === "undefined" || !notificationSoundEnabled()) return;
  const now = performance.now();
  if (now - lastNotifiedAt < 600) return; // várias chegando juntas: um som só
  lastNotifiedAt = now;
  playPattern(NOTIFY_PATTERNS[sound]);
}
