"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, LogOut, Save, ShieldCheck, UserRound } from "@/components/icons";
import { useAdmin } from "@/components/admin-shell";
import { AdminPageHead } from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { endSession } from "@/lib/session";
import { validateNewPassword } from "@/lib/registration-validation";
import { ADMIN_ROLE_LABEL } from "@/lib/admin";

export default function AdminProfilePage() {
  const { account, updateName } = useAdmin();
  const [name, setName] = useState(account.name);
  const [savingName, setSavingName] = useState(false);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [savingPassword, setSavingPassword] = useState(false);
  const [endingOthers, setEndingOthers] = useState(false);

  async function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2 || clean.length > 80) {
      toast.error("Informe um nome de 2 a 80 caracteres.");
      return;
    }
    setSavingName(true);
    const { error } = await getSupabase().auth.updateUser({ data: { full_name: clean } });
    setSavingName(false);
    if (error) {
      toast.error("Não foi possível salvar o nome.");
      return;
    }
    updateName(clean);
    toast.success("Nome atualizado.");
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = { ...validateNewPassword({ password, confirmPassword }) };
    if (!current) errors.current = "Informe a senha atual.";
    else if (current === password) errors.password = "A nova senha precisa ser diferente da atual.";
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;
    setSavingPassword(true);
    try {
      const supabase = getSupabase();
      // Confirma a senha atual antes de trocar (quem achar o computador aberto não troca a senha).
      const { error: checkError } = await supabase.auth.signInWithPassword({ email: account.email, password: current });
      if (checkError) {
        setPasswordErrors({ current: "Senha atual incorreta." });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setCurrent("");
      setPassword("");
      setConfirmPassword("");
      toast.success("Senha alterada. Use a nova senha no próximo acesso.");
    } catch {
      toast.error("Não foi possível alterar a senha agora.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function endOthers() {
    if (!window.confirm("Encerrar sua sessão em todos os outros aparelhos? Este continua conectado.")) return;
    setEndingOthers(true);
    const error = await endSession("others");
    setEndingOthers(false);
    if (error) toast.error("Não foi possível encerrar as outras sessões.");
    else toast.success("Sessões dos outros aparelhos encerradas.");
  }

  const field = (key: string) => passwordErrors[key]
    ? { "aria-invalid": true as const, "aria-describedby": `senha-${key}-erro` } : {};

  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Sua conta" title="Meu perfil" description="Seus dados de acesso ao painel administrativo." />
      <div className="adm-grid-2">
        <section className="adm-card adm-profile" aria-labelledby="perfil-titulo">
          <span className="adm-profile-avatar" aria-hidden="true"><UserRound size={28} /></span>
          <div>
            <h2 id="perfil-titulo">{account.name || "Sem nome definido"}</h2>
            <p>{account.email}</p>
            <p><ShieldCheck size={14} /> {ADMIN_ROLE_LABEL[account.role]}
              {account.role === "owner" ? " · acesso total" : " · aprovações e acompanhamento"}</p>
          </div>
        </section>

        <form className="adm-card adm-form" onSubmit={saveName}>
          <h2><UserRound size={18} /> Nome de exibição</h2>
          <label className="adm-field">
            <span>Como aparece no painel e no histórico</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" />
          </label>
          <label className="adm-field">
            <span>E-mail de acesso</span>
            <input value={account.email} readOnly aria-readonly="true" />
          </label>
          <button type="submit" className="adm-btn" disabled={savingName || name.trim() === account.name}>
            {savingName ? <Loader2 size={15} className="admin-spin" /> : <Save size={15} />} Salvar nome
          </button>
        </form>

        <form className="adm-card adm-form" onSubmit={savePassword} noValidate>
          <h2><KeyRound size={18} /> Trocar senha</h2>
          <label className="adm-field">
            <span>Senha atual</span>
            <input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" {...field("current")} />
            {passwordErrors.current && <small className="adm-field-error" id="senha-current-erro">{passwordErrors.current}</small>}
          </label>
          <label className="adm-field">
            <span>Nova senha</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" {...field("password")} />
            {passwordErrors.password
              ? <small className="adm-field-error" id="senha-password-erro">{passwordErrors.password}</small>
              : <small>Pelo menos 8 caracteres.</small>}
          </label>
          <label className="adm-field">
            <span>Confirme a nova senha</span>
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" {...field("confirmPassword")} />
            {passwordErrors.confirmPassword && <small className="adm-field-error" id="senha-confirmPassword-erro">{passwordErrors.confirmPassword}</small>}
          </label>
          <button type="submit" className="adm-btn" disabled={savingPassword}>
            {savingPassword && <Loader2 size={15} className="admin-spin" />} Trocar senha
          </button>
        </form>

        <section className="adm-card adm-form" aria-labelledby="sessoes-titulo">
          <h2 id="sessoes-titulo"><LogOut size={18} /> Sessões</h2>
          <p className="adm-note">Por segurança, o painel encerra sozinho após 15 minutos sem uso.</p>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => void endOthers()} disabled={endingOthers}>
            {endingOthers && <Loader2 size={15} className="admin-spin" />} Sair dos outros aparelhos
          </button>
        </section>
      </div>
    </div>
  );
}
