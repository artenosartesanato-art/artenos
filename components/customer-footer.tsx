import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

type CustomerFooterProps = {
  userSignedIn: boolean;
  authLoading?: boolean;
};

export function CustomerFooter({
  userSignedIn,
  authLoading = false,
}: CustomerFooterProps) {
  return (
    <footer className="store-footer">
      <div className="store-container store-footer-grid">
        <div>
          <Link href="/" className="store-logo" aria-label="Artenós, início">
            <BrandLogo variant="perola" />
          </Link>
          <p>Um espaço para descobrir o valor de cada história feita à mão.</p>
        </div>
        <div>
          <h3>Explore</h3>
          <Link href="/">Início</Link>
          <Link href="/categorias">Categorias</Link>
          <Link href="/sob-encomenda">Sob encomenda</Link>
          <Link href="/favoritos">Favoritos</Link>
        </div>
        <div>
          <h3>Sua conta</h3>
          {authLoading ? (
            <span aria-live="polite">Verificando sua conta...</span>
          ) : userSignedIn ? (
            <Link href="/perfil">Meu perfil</Link>
          ) : (
            <Link href="/acesso">Entrar ou cadastrar</Link>
          )}
          <Link href="/pedidos">Pedidos</Link>
          <Link href="/mensagens">Mensagens</Link>
        </div>
        <div>
          <h3>Informações</h3>
          <Link href="/termos">Termos de Uso</Link>
          <Link href="/privacidade">Privacidade</Link>
        </div>
      </div>
      <div className="store-container store-footer-bottom">
        © {new Date().getFullYear()} Artenós. Feito com cuidado.
      </div>
    </footer>
  );
}
