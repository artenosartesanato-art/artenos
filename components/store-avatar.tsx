"use client";

import { useEffect, useState } from "react";
import { cachedStoreLogo, loadStoreLogo } from "@/lib/store-logos";

/**
 * Foto de perfil da loja; sem foto, as iniciais (como antes). `className` é a
 * mesma classe do círculo de iniciais de cada tela, então o tamanho não muda.
 */
export function StoreAvatar({ artisanId, initials, className }: { artisanId: string | null | undefined; initials: string; className: string }) {
  const [url, setUrl] = useState<string | null | undefined>(() => (artisanId ? cachedStoreLogo(artisanId) : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!artisanId) return;
    let active = true;
    void loadStoreLogo(artisanId).then((value) => { if (active) { setUrl(value); setFailed(false); } });
    return () => { active = false; };
  }, [artisanId]);

  const showPhoto = Boolean(url) && !failed;
  return (
    <span className={`${className}${showPhoto ? " has-store-logo" : ""}`} aria-hidden="true">
      {showPhoto
        // eslint-disable-next-line @next/next/no-img-element -- foto pequena do Storage, já no tamanho do círculo
        ? <img className="store-logo-img" src={url!} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : initials}
    </span>
  );
}
