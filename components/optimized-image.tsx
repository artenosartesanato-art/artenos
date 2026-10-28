import Image from "next/image";
import { canOptimize } from "@/lib/image-optimization";

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Largura real na tela (atributo sizes), ex.: "(max-width: 600px) 50vw, 300px". */
  sizes: string;
  /** Primeira imagem visível: carrega já, com prioridade alta. */
  priority?: boolean;
  className?: string;
  quality?: 70 | 80;
};

/**
 * Imagem de peça/loja/categoria. Do Storage do Supabase → next/image (tamanho
 * certo para cada tela, AVIF/WebP, lazy). Outros endereços → <img> simples.
 */
export function OptimizedImage({ src, alt, width, height, sizes, priority = false, className, quality = 70 }: Props) {
  if (canOptimize(src)) {
    return (
      <Image src={src} alt={alt} width={width} height={height} sizes={sizes} quality={quality}
        className={className} priority={priority} fetchPriority={priority ? "high" : "auto"} />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} className={className} decoding="async"
      loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} />
  );
}
