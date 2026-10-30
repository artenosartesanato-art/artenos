"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, LoaderCircle, Trash2 } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { endSession } from "@/lib/session";
import { DELETION_GRACE_DAYS, deletionDateFrom, formatDeletionDate } from "@/lib/account-deletion";
import { siteConfig } from "@/lib/site-config";

async function authHeader() {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw new Error("Sua sessão expirou. Entre novamente.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}

/** "Privacidade e dados" em Minha conta: baixar os dados e excluir a conta (LGPD, art. 18). */
export function AccountPrivacy() {
  const [exporting, setExporting] = useState<"xlsx" | "json" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  // Data mostrada no modal: 30 dias a partir de quando ele foi aberto.
  const [finalDate, setFinalDate] = useState("");

  async function exportData(format: "xlsx" | "json") {
    setExporting(format);
    try {
      // A escolha de cookies fica só neste navegador: vai junto para constar na planilha.
      let consent = "";
      try { consent = window.localStorage.getItem("artenos:cookies") ?? ""; } catch { /* sem armazenamento */ }
      const response = await fetch(`/api/conta/exportar${format === "json" ? "?formato=json" : ""}`, {
        headers: { ...(await authHeader()), ...(consent && consent.length < 300 ? { "X-Cookie-Consent": consent } : {}) },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Não foi possível gerar o arquivo agora.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const named = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1];
      link.download = named ?? `artenos-meus-dados.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(format === "xlsx" ? "Planilha com seus dados baixada." : "Arquivo JSON com seus dados baixado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o arquivo agora.");
    } finally {
      setExporting(null);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError("");
    setBlockers([]);
    try {
      const response = await fetch("/api/conta/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; blockers?: string[]; scheduledAt?: string };
      if (response.status === 409 && body.blockers?.length) {
        setBlockers(body.blockers);
        setDeleting(false);
        return;
      }
      if (!response.ok) throw new Error(body.error || "Não foi possível excluir a conta agora.");
      // A sessão já foi encerrada no servidor (todos os aparelhos); limpa esta aba.
      await endSession("local").catch(() => null);
      // Recarga completa de propósito: zera o estado da conta que acabou de sair.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/?conta=desativada&ate=${encodeURIComponent(body.scheduledAt ?? "")}`);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Não foi possível excluir a conta agora.");
      setDeleting(false);
    }
  }

  return (
    <section className="profile-card profile-privacy" aria-labelledby="privacidade-titulo">
      <h2 id="privacidade-titulo">Privacidade e dados</h2>
      <p>Você pode baixar uma cópia dos seus dados ou excluir sua conta. Saiba mais na <a href="/privacidade">Política de Privacidade</a>.</p>
      <div className="profile-privacy-actions">
        <button type="button" className="an-btn an-btn--secondary" onClick={() => void exportData("xlsx")} disabled={exporting !== null}
          aria-busy={exporting === "xlsx"}>
          {exporting === "xlsx" ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
          {exporting === "xlsx" ? "Gerando planilha…" : "Baixar meus dados"}
        </button>
        <button type="button" className="an-btn an-btn--danger" onClick={() => {
          setConfirmText(""); setDeleteError(""); setBlockers([]);
          setFinalDate(formatDeletionDate(deletionDateFrom(new Date())));
          setConfirmOpen(true);
        }}>
          <Trash2 size={16} /> Excluir minha conta
        </button>
      </div>
      <p className="profile-privacy-json">
        Precisa levar os dados para outro serviço?{" "}
        <button type="button" className="link-button" onClick={() => void exportData("json")} disabled={exporting !== null}>
          {exporting === "json" ? "Gerando…" : "Baixar em formato JSON"}
        </button>
      </p>
      <Dialog open={confirmOpen} onClose={() => { if (!deleting) setConfirmOpen(false); }} labelledBy="excluir-conta-titulo" closeButton>
        <div className="profile-delete-dialog">
          <h2 id="excluir-conta-titulo">Excluir sua conta?</h2>
          <p>Ao confirmar, sua conta é <strong>desativada na hora</strong> e fica guardada por {DELETION_GRACE_DAYS} dias. Depois disso, ela é <strong>excluída definitivamente</strong> e não pode mais ser recuperada.</p>
          <p className="profile-delete-date">Sua conta será excluída definitivamente em <strong>{finalDate}</strong>.</p>
          <p>Para reativar dentro desses {DELETION_GRACE_DAYS} dias, envie um e-mail para {siteConfig.supportEmail ? <strong>{siteConfig.supportEmail}</strong> : "o atendimento da Artenós"}.</p>
          <p>Na exclusão definitiva, seu nome, documento, contatos, endereço, favoritos, carrinho e avisos são apagados ou anonimizados. Lojas têm as peças retiradas da vitrine já ao confirmar.</p>
          <p>Pedidos, pagamentos e notas fiscais ficam guardados pelo prazo exigido por lei, sem os seus dados de contato. Não é possível excluir com pedidos em andamento ou repasses pendentes.</p>
          {blockers.length > 0 && (
            <div className="an-alert an-alert--error profile-delete-blockers" role="alert">
              <strong>Antes de excluir, resolva:</strong>
              <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
            </div>
          )}
          <label className="an-field">
            <span>Para confirmar, digite EXCLUIR</span>
            <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" data-autofocus />
          </label>
          {deleteError && <p className="an-field-error" role="alert">{deleteError}</p>}
          <div className="profile-delete-actions">
            <button type="button" className="an-btn an-btn--ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>Cancelar</button>
            <button type="button" className="an-btn an-btn--danger" onClick={() => void deleteAccount()}
              disabled={deleting || confirmText !== "EXCLUIR"} aria-busy={deleting}>
              {deleting && <LoaderCircle size={16} className="spin" />} Excluir minha conta
            </button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
