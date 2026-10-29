"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  LockKeyhole,
  LogOut,
  MapPin,
  ShieldCheck,
  UserRound,
} from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { notifyProfileChanged } from "@/components/marketplace-state";
import dynamic from "next/dynamic";
import type { CroppedAvatar } from "@/components/avatar-cropper";
import { originalPathFor } from "@/lib/avatar-crop";
import "../storefront.css";
import "./profile.css";
import { endSession, rememberDevice } from "@/lib/session";
import { Dialog } from "@/components/ui/dialog";
import { AccountPrivacy } from "@/components/account-privacy";

type Profile = {
  id: string;
  account_type: "client" | "artisan";
  approval_status: "active" | "pending_review" | "assisted_review";
  full_name: string;
  email: string;
  document: string;
  phone: string;
  cep: string;
  address: string;
  address_number: string;
  city: string;
  state: string;
  store_name: string | null;
  specialty: string | null;
  story: string | null;
  terms_accepted_at: string;
  created_at: string;
  avatar_path: string | null;
};
// O editor de enquadramento só é baixado quando alguém escolhe uma foto.
const AvatarCropper = dynamic(() => import("@/components/avatar-cropper").then((module) => module.AvatarCropper), { ssr: false });

const AVATAR_BUCKET = "artenos-profile-avatars";
// A foto é recortada e reduzida no navegador antes do envio (512 px + original
// até 1600 px), então aceitamos arquivos maiores, como os de celular.
const MAX_AVATAR_BYTES = 15 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="profile-detail">
      <dt>{label}</dt>
      <dd>{value?.trim() || "Não informado"}</dd>
    </div>
  );
}

function formatDocument(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11)
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (digits.length === 14)
    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  return value;
}

function formatPhone(value: string) {
  const raw = value.replace(/\D/g, "");
  const digits = raw.startsWith("55") && raw.length >= 12 ? raw.slice(2) : raw;
  if (digits.length === 11)
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (digits.length === 10)
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return value;
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 8
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : value;
}

function formattedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Não informado"
    : dateFormatter.format(date);
}

function passwordError(code?: string) {
  if (code === "same_password")
    return "A nova senha precisa ser diferente da senha atual.";
  if (code === "weak_password")
    return "A nova senha foi considerada fraca. Escolha uma senha mais forte.";
  if (code === "invalid_credentials" || code === "reauthentication_failed")
    return "A senha atual não confere.";
  if (code === "over_request_rate_limit")
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (code === "session_not_found" || code === "bad_jwt")
    return "Sua sessão expirou. Entre novamente para trocar a senha.";
  if (code === "reauthentication_not_valid")
    return "O código de confirmação está incorreto ou expirou. Solicite outro código.";
  return "Não foi possível trocar a senha agora. Confira os dados e tente novamente.";
}

export function ProfileContent({ sellerMode = false }: { sellerMode?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [nextEmail, setNextEmail] = useState("");
  const [nextPhone, setNextPhone] = useState("");
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressForm, setAddressForm] = useState({ cep: "", address: "", address_number: "", city: "", state: "" });
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [awaitingNonce, setAwaitingNonce] = useState(false);
  const [nonce, setNonce] = useState("");
  const avatarUrlRef = useRef("");
  const [cropSource, setCropSource] = useState<{ url: string; revoke: boolean } | null>(null);
  const [confirmEverywhere, setConfirmEverywhere] = useState(false);
  const [endingAll, setEndingAll] = useState(false);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const profileRequest = useRef(0);

  useEffect(() => {
    let active = true;
    const requestCounter = profileRequest;
    const revokeAvatar = () => {
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
      avatarUrlRef.current = "";
      setAvatarUrl("");
    };
    const loadSession = async (current: User | null) => {
      const request = ++requestCounter.current;
      setUser(current);
      setAuthReady(true);
      setProfile(null);
      setProfileError("");
      setAvatarError("");
      revokeAvatar();
      if (!current) {
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id,account_type,approval_status,full_name,email,document,phone,cep,address,address_number,city,state,store_name,specialty,story,terms_accepted_at,created_at,avatar_path",
          )
          .eq("id", current.id)
          .single();
        if (!active || request !== requestCounter.current) return;
        if (error || !data) throw error || new Error("Perfil não encontrado.");
        const loaded = data as Profile;
        // Artesã aprovada edita o perfil dentro do painel da loja (mesmo
        // conteúdo, com o menu da loja ao lado).
        if (!sellerMode && loaded.account_type === "artisan" && loaded.approval_status === "active") {
          router.replace(`/vendedor/perfil${window.location.search}${window.location.hash}`);
          return;
        }
        setProfile(loaded);
        setNextEmail(current.email || loaded.email);
        setNextPhone(loaded.phone || "");
        setAddressForm({ cep: loaded.cep || "", address: loaded.address || "", address_number: loaded.address_number || "", city: loaded.city || "", state: loaded.state || "" });
        if (loaded.avatar_path) {
          const { data: image, error: imageError } = await supabase.storage
            .from(AVATAR_BUCKET)
            .download(loaded.avatar_path);
          if (!active || request !== requestCounter.current) return;
          if (imageError || !image)
            setAvatarError(
              "Não foi possível carregar sua foto agora. Recarregue a página para tentar de novo.",
            );
          else {
            const url = URL.createObjectURL(image);
            avatarUrlRef.current = url;
            setAvatarUrl(url);
          }
        }
      } catch {
        if (active && request === requestCounter.current) {
          setProfileError(
            "Não foi possível carregar seu perfil agora. Confira sua conexão e tente novamente.",
          );
        }
      } finally {
        if (active && request === requestCounter.current)
          setProfileLoading(false);
      }
    };
    try {
      const { data: listener } = getSupabase().auth.onAuthStateChange(
        (event, session) => {
          if (["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) {
            window.setTimeout(() => {
              if (active) void loadSession(session?.user || null);
            }, 0);
          }
        },
      );
      return () => {
        active = false;
        requestCounter.current++;
        listener.subscription.unsubscribe();
        if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
      };
    } catch {
      queueMicrotask(() => {
        if (active) {
          setAuthReady(true);
          setProfileError(
            "Seu perfil está temporariamente indisponível.",
          );
        }
      });
    }
  }, [router, sellerMode]);

  /** Escolheu um arquivo: valida e abre o editor de enquadramento. */
  function chooseAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user || !profile || uploading) return;
    if (!IMAGE_EXTENSIONS[file.type]) {
      toast.error("Escolha uma imagem JPG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("A foto deve ter no máximo 15 MB.");
      return;
    }
    openCropper(URL.createObjectURL(file), true);
  }

  function openCropper(url: string, revoke: boolean) {
    if (cropSource?.revoke) URL.revokeObjectURL(cropSource.url);
    setCropSource({ url, revoke });
  }

  function closeCropper() {
    if (cropSource?.revoke) URL.revokeObjectURL(cropSource.url);
    setCropSource(null);
  }

  /** Reenquadrar a foto atual: usa o original guardado (ou a própria foto, se for antiga). */
  async function adjustAvatar() {
    if (!profile?.avatar_path || loadingOriginal) return;
    setLoadingOriginal(true);
    try {
      const { data } = await getSupabase().storage.from(AVATAR_BUCKET).download(originalPathFor(profile.avatar_path));
      if (data) openCropper(URL.createObjectURL(data), true);
      else if (avatarUrl) openCropper(avatarUrl, false);
    } finally {
      setLoadingOriginal(false);
    }
  }

  async function saveAvatar({ avatar, original }: CroppedAvatar) {
    if (!user || !profile) return;
    const oldPath = profile.avatar_path;
    const id = crypto.randomUUID();
    const path = `${user.id}/${id}.${IMAGE_EXTENSIONS[avatar.type] ?? "jpg"}`;
    const originalPath = originalPathFor(path);
    setUploading(true);
    setAvatarError("");
    try {
      const supabase = getSupabase();
      const bucket = supabase.storage.from(AVATAR_BUCKET);
      const [avatarUpload, originalUpload] = await Promise.all([
        bucket.upload(path, avatar, { contentType: avatar.type, upsert: false, cacheControl: "3600" }),
        bucket.upload(originalPath, original, { contentType: original.type, upsert: false, cacheControl: "3600" }),
      ]);
      if (avatarUpload.error) throw avatarUpload.error;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_path: path, updated_at: new Date().toISOString() })
        .eq("id", user.id).select("avatar_path").single();
      if (updateError) {
        await bucket.remove([path, originalPath]);
        throw updateError;
      }
      const url = URL.createObjectURL(avatar);
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
      avatarUrlRef.current = url;
      setAvatarUrl(url);
      setProfile((previous) =>
        previous ? { ...previous, avatar_path: path } : previous,
      );
      notifyProfileChanged();
      closeCropper();
      // O original é opcional: sem ele, reenquadrar usa a própria foto.
      if (originalUpload.error) console.error("avatar original:", originalUpload.error.message);
      if (oldPath && oldPath !== path)
        await bucket.remove([oldPath, originalPathFor(oldPath)]);
      toast.success("Foto de perfil atualizada.");
    } catch {
      setAvatarError(
        "Não foi possível atualizar a foto agora. Tente novamente em instantes.",
      );
      toast.error("Não foi possível atualizar a foto.");
    } finally {
      setUploading(false);
    }
  }

  async function requestEmailChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || contactBusy) return;
    const email = nextEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Informe um e-mail válido.");
    if (email === user.email?.toLowerCase()) return toast.info("Este já é o e-mail da sua conta.");
    setContactBusy(true);
    try {
      const { data, error } = await getSupabase().auth.updateUser({ email }, {
        emailRedirectTo: `${window.location.origin}${sellerMode ? "/vendedor/perfil" : "/perfil"}`,
      });
      if (error) throw error;
      if (data.user?.email?.toLowerCase() === email) {
        notifyProfileChanged();
        toast.success("E-mail atualizado.");
      } else toast.success("Enviamos links de confirmação para os dois endereços. O e-mail atual continua valendo até você confirmar.");
    } catch {
      toast.error("Não foi possível solicitar a troca de e-mail. Verifique o endereço e tente novamente.");
    } finally { setContactBusy(false); }
  }

  async function savePhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || contactBusy) return;
    const digits = nextPhone.replace(/\D/g, "");
    const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
    if (!/^[1-9]{2}9?\d{8}$/.test(national)) return toast.error("Informe um telefone brasileiro com DDD válido.");
    if (national === profile?.phone?.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""))
      return toast.info("Este já é o telefone do seu perfil.");
    setContactBusy(true);
    try {
      const { data, error } = await getSupabase().from("profiles")
        .update({ phone: national, updated_at: new Date().toISOString() })
        .eq("id", user.id).select("phone").single();
      if (error) throw error;
      setProfile((previous) => previous ? { ...previous, phone: data.phone } : previous);
      toast.success("Telefone atualizado no perfil.");
    } catch {
      toast.error("Não foi possível salvar o telefone. Verifique se o SQL de atualização do perfil foi executado.");
    } finally { setContactBusy(false); }
  }

  async function saveAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || addressBusy) return;
    const cep = addressForm.cep.replace(/\D/g, "");
    const address = addressForm.address.trim();
    const address_number = addressForm.address_number.trim();
    const city = addressForm.city.trim();
    const state = addressForm.state.trim().toUpperCase();
    if (!/^\d{8}$/.test(cep) || !address || !address_number || !city || !/^[A-Z]{2}$/.test(state))
      return toast.error("Preencha CEP, rua, número, cidade e UF válidos.");
    setAddressBusy(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const location = await response.json();
      if (!response.ok || location.erro || location.uf !== state ||
        location.localidade?.toLocaleLowerCase("pt-BR") !== city.toLocaleLowerCase("pt-BR"))
        return toast.error("CEP, cidade e UF não correspondem. Confira o endereço.");
      const patch = { cep, address, address_number, city, state, updated_at: new Date().toISOString() };
      const { error } = await getSupabase().from("profiles").update(patch).eq("id", user.id)
        .select("cep,address,address_number,city,state").single();
      if (error) throw error;
      setProfile((previous) => previous ? { ...previous, ...patch } : previous);
      setEditingAddress(false);
      notifyProfileChanged();
      toast.success("Endereço atualizado. Novas compras usarão este endereço.");
    } catch {
      toast.error("Não foi possível validar ou salvar o endereço. Tente novamente.");
    } finally { setAddressBusy(false); }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || changingPassword) return;
    if (newPassword.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("A confirmação não corresponde à nova senha.");
      return;
    }
    if (currentPassword === newPassword) {
      toast.error("Escolha uma senha diferente da atual.");
      return;
    }
    setChangingPassword(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        current_password: currentPassword,
        ...(awaitingNonce ? { nonce: nonce.trim() } : {}),
      });
      if (error?.code === "reauthentication_needed") {
        const { error: resendError } = await supabase.auth.reauthenticate();
        if (resendError) {
          toast.error(
            "Não foi possível enviar o código de confirmação. Tente novamente mais tarde.",
          );
          return;
        }
        setAwaitingNonce(true);
        toast.info(
          "Enviamos um código de confirmação para seu e-mail ou telefone cadastrado.",
        );
        return;
      }
      if (error) {
        toast.error(passwordError(error.code));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNonce("");
      setAwaitingNonce(false);
      // Quem sabia a senha antiga perde o acesso: encerra os outros aparelhos.
      const othersError = await endSession("others");
      toast.success(othersError
        ? "Senha alterada com sucesso."
        : "Senha alterada. Por segurança, encerramos sua sessão nos outros aparelhos.");
    } catch {
      toast.error("Não foi possível conectar agora. Confira sua internet e tente novamente.");
    } finally {
      setChangingPassword(false);
    }
  }

  async function resendNonce() {
    const { error } = await getSupabase().auth.reauthenticate();
    if (error) {
      toast.error("Não foi possível reenviar o código agora.");
      return;
    }
    toast.info("Um novo código foi enviado.");
  }

  async function signOutEverywhere() {
    setEndingAll(true);
    const error = await endSession("global");
    setEndingAll(false);
    if (error) {
      toast.error("Não foi possível encerrar as sessões agora. Tente novamente.");
      return;
    }
    setConfirmEverywhere(false);
    router.replace("/acesso?motivo=todos");
  }

  async function signOut() {
    const error = await endSession("local");
    if (error) {
      toast.error("Não foi possível sair da conta agora.");
      return;
    }
    router.replace("/");
  }

  const initials =
    profile?.full_name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "";
  const statusLabel =
    profile?.approval_status === "active"
      ? "Conta ativa"
      : profile?.approval_status === "pending_review"
        ? "Em análise"
        : "Análise assistida";

  // No painel da loja o SellerShell já fornece o <main>.
  const Main = sellerMode ? "div" : "main";
  return (
    <div className={sellerMode ? "profile-page profile-page-seller" : "store-page profile-page"}>
      <Main id={sellerMode ? undefined : "conteudo"} tabIndex={sellerMode ? undefined : -1} className="store-container profile-main">
        <div className="profile-heading">
          <p className="store-eyebrow">Sua conta Artenós</p>
          <h1>Meu perfil</h1>
          <p>Seus dados de cadastro e preferências em um só lugar.</p>
        </div>
        {!authReady || profileLoading ? (
          <div className="profile-notice" role="status">
            Carregando seu perfil...
          </div>
        ) : profileError ? (
          <div className="store-error" role="alert">
            {profileError}
          </div>
        ) : !user ? (
          <div className="profile-gate">
            <UserRound size={40} />
            <h2>Entre para ver seu perfil</h2>
            <p>
              Essas informações são privadas e só aparecem para você após o
              login.
            </p>
            <Link href="/acesso">
              Entrar ou criar conta <ArrowRight size={17} />
            </Link>
          </div>
        ) : (
          profile && (
            <>
              <section
                className="profile-summary"
                aria-labelledby="profile-name"
              >
                <div className="profile-avatar-wrap">
                  <div className="profile-avatar">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={`Foto de ${profile.full_name}`}
                      />
                    ) : (
                      initials || <UserRound size={44} />
                    )}
                  </div>
                  <label className="profile-photo-button">
                    {uploading ? (
                      "Enviando foto..."
                    ) : (
                      <>
                        <Camera size={16} />{" "}
                        {profile.avatar_path ? "Trocar foto" : "Adicionar foto"}
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={chooseAvatar}
                      disabled={uploading}
                      aria-label="Selecionar foto de perfil"
                    />
                  </label>
                  {profile.avatar_path && avatarUrl && (
                    <button type="button" className="profile-photo-adjust" onClick={adjustAvatar}
                      disabled={uploading || loadingOriginal} aria-busy={loadingOriginal}>
                      {loadingOriginal ? "Abrindo…" : "Ajustar enquadramento"}
                    </button>
                  )}
                  <small>JPG, PNG ou WebP · até 15 MB</small>
                  {avatarError && (
                    <p className="profile-photo-error" role="alert">
                      {avatarError}
                    </p>
                  )}
                </div>
                <div className="profile-summary-copy">
                  <span className="profile-status">
                    <ShieldCheck size={15} /> {statusLabel}
                  </span>
                  <h2 id="profile-name">{profile.full_name}</h2>
                  <p>{user.email || profile.email}</p>
                  <span>
                    {profile.account_type === "artisan"
                      ? "Conta de artesã"
                      : "Conta de cliente"}
                  </span>
                </div>
              </section>

              <div className="profile-grid">
                <section className="profile-card">
                  <div className="profile-card-title">
                    <UserRound size={20} />
                    <h2>Dados pessoais</h2>
                  </div>
                  <dl>
                    <Detail label="Nome completo" value={profile.full_name} />
                    <Detail
                      label="E-mail"
                      value={user.email || profile.email}
                    />
                    <Detail
                      label={
                        profile.document.replace(/\D/g, "").length === 14
                          ? "CNPJ"
                          : "CPF"
                      }
                      value={formatDocument(profile.document)}
                    />
                    <Detail
                      label="Telefone"
                      value={formatPhone(profile.phone)}
                    />
                    <Detail
                      label="Tipo de conta"
                      value={
                        profile.account_type === "artisan"
                          ? "Artesã"
                          : "Cliente"
                      }
                    />
                    <Detail
                      label="Cadastro realizado em"
                      value={formattedDate(profile.created_at)}
                    />
                    <Detail
                      label="Termos aceitos em"
                      value={formattedDate(profile.terms_accepted_at)}
                    />
                  </dl>
                  <button className="profile-edit-toggle" type="button" onClick={() => setEditingContact((value) => !value)}>
                    {editingContact ? "Ocultar edição" : "Alterar e-mail ou telefone"}
                  </button>
                  {editingContact && <div className="profile-edit-forms">
                    <form onSubmit={requestEmailChange}>
                      <label>Novo e-mail
                        <input type="email" autoComplete="email" value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} required />
                      </label>
                      <button type="submit" disabled={contactBusy}>Enviar confirmação por e-mail</button>
                      <small>A troca só é concluída após confirmar os links enviados. Até lá, use o e-mail atual.</small>
                    </form>
                    <form onSubmit={savePhone}>
                      <label>Novo telefone com DDD
                        <input type="tel" autoComplete="tel" value={nextPhone} onChange={(event) => setNextPhone(event.target.value)} required />
                      </label>
                      <button type="submit" disabled={contactBusy}>Salvar telefone</button>
                      <small>Validamos o formato do número; não enviamos SMS nem usamos este telefone para login.</small>
                    </form>
                  </div>}
                </section>
                <section className="profile-card">
                  <div className="profile-card-title">
                    <MapPin size={20} />
                    <h2>Endereço cadastrado</h2>
                  </div>
                  <dl>
                    <Detail label="CEP" value={formatCep(profile.cep)} />
                    <Detail label="Endereço" value={profile.address} />
                    <Detail label="Número" value={profile.address_number} />
                    <Detail label="Cidade" value={profile.city} />
                    <Detail label="Estado" value={profile.state} />
                  </dl>
                  <button className="profile-edit-toggle" type="button" onClick={() => setEditingAddress((value) => !value)}>
                    {editingAddress ? "Ocultar edição" : "Alterar endereço"}
                  </button>
                  {editingAddress && <form className="profile-edit-forms" onSubmit={saveAddress}>
                    <label>CEP<input inputMode="numeric" value={addressForm.cep} onChange={(event) => setAddressForm((previous) => ({ ...previous, cep: event.target.value }))} required /></label>
                    <label>Rua e complemento<input value={addressForm.address} onChange={(event) => setAddressForm((previous) => ({ ...previous, address: event.target.value }))} required /></label>
                    <label>Número<input value={addressForm.address_number} onChange={(event) => setAddressForm((previous) => ({ ...previous, address_number: event.target.value }))} required /></label>
                    <label>Cidade<input value={addressForm.city} onChange={(event) => setAddressForm((previous) => ({ ...previous, city: event.target.value }))} required /></label>
                    <label>UF<input value={addressForm.state} maxLength={2} onChange={(event) => setAddressForm((previous) => ({ ...previous, state: event.target.value }))} required /></label>
                    <button type="submit" disabled={addressBusy}>{addressBusy ? "Validando..." : "Salvar endereço"}</button>
                  </form>}
                  {sellerMode && <p className="profile-card-help">Para alterar o CEP de origem do frete, acesse <Link href="/vendedor/minha-loja">Minha loja</Link>. O endereço deste perfil não altera uma origem de frete definida separadamente.</p>}
                </section>
                {profile.account_type === "artisan" && (
                  <section className="profile-card profile-card-wide">
                    <div className="profile-card-title">
                      <ShieldCheck size={20} />
                      <h2>Minha loja</h2>
                    </div>
                    <dl>
                      <Detail label="Nome da loja" value={profile.store_name} />
                      <Detail label="Especialidade" value={profile.specialty} />
                      <Detail label="História da loja" value={profile.story} />
                    </dl>
                  </section>
                )}
                <section className="profile-card profile-card-wide">
                  <div className="profile-card-title">
                    <LockKeyhole size={20} />
                    <h2>Segurança</h2>
                  </div>
                  <p className="profile-card-help">
                    Para trocar a senha, confirme sua senha atual. A nova senha
                    vale para os próximos acessos.
                  </p>
                  <form
                    className="profile-password-form"
                    onSubmit={changePassword}
                  >
                    <label>
                      Senha atual
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(event) =>
                          setCurrentPassword(event.target.value)
                        }
                        required
                      />
                    </label>
                    <label>
                      Nova senha
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Confirme a nova senha
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        required
                      />
                    </label>
                    {awaitingNonce && (
                      <div className="profile-nonce">
                        <label>
                          Código de confirmação
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={nonce}
                            onChange={(event) =>
                              setNonce(
                                event.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 8),
                              )
                            }
                            required
                          />
                        </label>
                        <button type="button" onClick={resendNonce}>
                          Reenviar código
                        </button>
                      </div>
                    )}
                    <button type="submit" disabled={changingPassword}>
                      {changingPassword
                        ? "Alterando..."
                        : awaitingNonce
                          ? "Confirmar e alterar senha"
                          : "Alterar senha"}
                    </button>
                  </form>
                </section>
              </div>
              <section className="profile-card profile-security" aria-labelledby="seguranca-titulo">
                <h2 id="seguranca-titulo"><ShieldCheck size={20} /> Segurança da conta</h2>
                <dl>
                  <div>
                    <dt>Último acesso</dt>
                    <dd>{user.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })
                      : "Não informado"}</dd>
                  </div>
                  <div>
                    <dt>Neste aparelho</dt>
                    <dd>{rememberDevice()
                      ? "Você continua conectado até sair da conta."
                      : "A sessão termina ao fechar o navegador ou após 30 min sem uso."}</dd>
                  </div>
                </dl>
                <p>Perdeu um aparelho ou entrou em um computador de outra pessoa? Encerre todas as sessões abertas.</p>
                <button type="button" className="an-btn an-btn--secondary" onClick={() => setConfirmEverywhere(true)}>
                  <LogOut size={16} /> Sair de todos os aparelhos
                </button>
              </section>
              <AccountPrivacy />
              <Dialog open={confirmEverywhere} onClose={() => { if (!endingAll) setConfirmEverywhere(false); }}
                labelledBy="sair-todos-titulo" describedBy="sair-todos-texto" className="profile-confirm-dialog">
                <h2 id="sair-todos-titulo">Sair de todos os aparelhos?</h2>
                <p id="sair-todos-texto">Todas as sessões abertas, inclusive esta, serão encerradas. Você vai precisar entrar de novo em cada aparelho.</p>
                <div className="profile-confirm-actions">
                  <button type="button" className="an-btn an-btn--secondary" onClick={() => setConfirmEverywhere(false)} disabled={endingAll}>Cancelar</button>
                  <button type="button" className="an-btn" onClick={() => void signOutEverywhere()} disabled={endingAll} aria-busy={endingAll} data-autofocus>
                    {endingAll ? "Encerrando…" : "Sair de todos"}
                  </button>
                </div>
              </Dialog>
              <button
                type="button"
                className="profile-signout"
                onClick={signOut}
              >
                <LogOut size={17} /> Sair da conta
              </button>
            </>
          )
        )}
      </Main>
      {cropSource && <AvatarCropper src={cropSource.url} onCancel={closeCropper} onSave={saveAvatar} />}
    </div>
  );
}

export default function ProfilePage() {
  return <ProfileContent />;
}
