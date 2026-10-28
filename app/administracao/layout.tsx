import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";
import "../vendedor/seller.css";
import "./administration.css";
import "./admin-panel.css";

export const metadata: Metadata = {
  title: "Administração | Artenós",
  description: "Painel da equipe Artenós: aprovações, vendedores, pedidos, clientes e configurações.",
  robots: { index: false, follow: false },
};

export default function AdministrationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AdminShell>{children}</AdminShell>;
}
