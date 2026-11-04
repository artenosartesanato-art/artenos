"use client";

import { useSyncExternalStore } from "react";
import { setSoundEnabled, soundEnabled, subscribeSoundPreference } from "@/lib/ui-sound";

export function useSoundPreference() {
  return useSyncExternalStore(subscribeSoundPreference, soundEnabled, () => false);
}

/** Interruptor dos sons da plataforma: ações e avisos (desligados por padrão). */
export function SoundToggle({ className = "" }: { className?: string }) {
  const enabled = useSoundPreference();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      className={`an-sound-toggle ${className}`.trim()}
      onClick={() => setSoundEnabled(!enabled)}
    >
      <span className="an-sound-toggle-track" aria-hidden="true"><span /></span>
      <span>Sons da plataforma: {enabled ? "ligados" : "desligados"}</span>
    </button>
  );
}
