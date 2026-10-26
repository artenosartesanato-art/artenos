import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  variant?: "marrom" | "perola";
  priority?: boolean;
};

export function BrandLogo({
  className = "",
  variant = "marrom",
  priority = false,
}: BrandLogoProps) {
  return (
    <span className={`brand-wordmark brand-wordmark-${variant} ${className}`.trim()}>
      <Image
        src={`/brand/artenos-novelo-${variant}.svg`}
        alt="Artenós"
        width={692}
        height={174}
        priority={priority}
        unoptimized
      />
      <small>feito à mão, encontrado aqui</small>
    </span>
  );
}

