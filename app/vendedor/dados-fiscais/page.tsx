import { redirect } from "next/navigation";

// Emissão de nota fiscal pela plataforma está pausada: a tela de dados fiscais
// saiu do painel. Links antigos voltam para o início do painel da loja.
// (A versão anterior está no histórico do git, em app/vendedor/dados-fiscais.)
export default function FiscalDataPage() {
  redirect("/vendedor");
}
