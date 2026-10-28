"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileSearch,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "@/components/icons";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { useMarketplace } from "@/components/marketplace-state";
import "./pending-access.css";
import { endSession } from "@/lib/session";

type Profile = {
  account_type: "client" | "artisan";
  approval_status: "active" | "pending_review" | "assisted_review";
  full_name: string;
  email: string | null;
  store_name: string | null;
};

type Application = {
  id: string;
  application_number: number;
  status:
    | "pending_review"
    | "under_review"
    | "changes_requested"
    | "approved"
    | "rejected"
    | "suspended";
  submission_type: "standard" | "assisted";
  decision_reason: string | null;
  submitted_at: string;
  review_started_at: string | null;
  changes_requested_at: string | null;
  decided_at: string | null;
  updated_at: string;
};

type AuditEntry = {
  id: string;
  action: string;
  status_to: string | null;
  public_note: string | null;
  created_at: string;
};

type PageState = "loading" | "ready" | "error";

const statusContent: Record<
  Application["status"],
  { title: string; description: string }
> = {
  pending_review: {
    title: "Cadastro recebido",
    description: "Sua solicitação está na fila de análise da equipe Artenós.",
  },
  under_review: {
    title: "Cadastro em análise",
    description:
      "A equipe já iniciou a conferência das informações da sua loja.",
  },
  changes_requested: {
    title: "Precisamos de algumas informações",
    description:
      "Consulte a observação abaixo e atualize seu perfil para continuar a análise.",
  },
  approved: {
    title: "Cadastro aprovado",
    description:
      "Sua conta de artesão foi aprovada e os recursos de vendedor estão sendo liberados.",
  },
  rejected: {
    title: "Cadastro não aprovado",
    description: "A decisão e as orientações disponíveis aparecem abaixo.",
  },
  suspended: {
    title: "Acesso de vendedor suspenso",
    description:
      "Os recursos de venda estão temporariamente indisponíveis para esta conta.",
  },
};

const actionLabels: Record<string, string> = {
  submitted: "Cadastro enviado para análise",
  backfilled: "Cadastro incluído no processo de análise",
  assigned: "Análise encaminhada para a equipe",
  review_started: "Análise iniciada",
  changes_requested: "Alterações solicitadas",
  approved: "Cadastro aprovado",
  rejected: "Cadastro não aprovado",
  suspended: "Acesso de vendedor suspenso",
  reactivated: "Acesso de vendedor reativado",
  resubmitted: "Cadastro reenviado para análise",
  status_changed: "Situação do cadastro atualizada",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : dateFormatter.format(date);
}

export default function PendingArtisanAccessPage() {
  const { displayName, avatarUrl } = useMarketplace();
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  const loadAccessStatus = useCallback(async () => {
    setPageState("loading");
    setErrorMessage("");

    try {
      const supabase = getSupabase();
      const { data: authData, error: authError } =
        await supabase.auth.getUser();
      if (authError || !authData.user) {
        router.replace("/acesso");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("account_type,approval_status,full_name,email,store_name")
        .eq("id", authData.user.id)
        .single();

      if (profileError || !profileData)
        throw profileError || new Error("Perfil não encontrado.");
      const currentProfile = profileData as Profile;

      if (
        currentProfile.account_type !== "artisan" ||
        currentProfile.approval_status === "active"
      ) {
        router.replace("/");
        return;
      }

      setProfile(currentProfile);

      const { data: applicationData, error: applicationError } = await supabase
        .from("artisan_applications")
        .select(
          "id,application_number,status,submission_type,decision_reason,submitted_at,review_started_at,changes_requested_at,decided_at,updated_at",
        )
        .eq("artisan_id", authData.user.id)
        .maybeSingle();

      if (applicationError) throw applicationError;
      const currentApplication = applicationData as Application | null;
      setApplication(currentApplication);

      if (currentApplication) {
        const { data: auditData, error: auditError } = await supabase
          .from("artisan_application_audit")
          .select("id,action,status_to,public_note,created_at")
          .eq("application_id", currentApplication.id)
          .order("created_at", { ascending: false });

        if (auditError) throw auditError;
        setAudit((auditData || []) as AuditEntry[]);
      } else {
        setAudit([]);
      }

      setPageState("ready");
    } catch {
      setErrorMessage(
        "Não foi possível consultar a análise agora. Atualize a página ou tente novamente em alguns minutos.",
      );
      setPageState("error");
    }
  }, [router]);

  useEffect(() => {
    queueMicrotask(() => void loadAccessStatus());
  }, [loadAccessStatus]);

  const visualStatus = application?.status || "pending_review";
  const content = statusContent[visualStatus];
  const firstName = useMemo(
    () => profile?.full_name.trim().split(/\s+/)[0] || "artesão",
    [profile],
  );

  async function signOut() {
    const error = await endSession("local");
    if (error) {
      toast.error("Não foi possível sair da conta agora.");
      return;
    }
    router.replace("/acesso?motivo=saiu");
  }

  return (
    <div className="pending-page">
      <div className="pending-header">
        <div className="pending-header-actions">
          <Link href="/perfil">
            {avatarUrl ? <img className="pending-header-avatar" src={avatarUrl} alt="" /> : <UserRound size={17} />}
            {displayName || "Minha conta"}
          </Link>
          <button type="button" onClick={signOut}>
            <LogOut size={17} /> Sair
          </button>
        </div>
      </div>

      <main id="conteudo" tabIndex={-1} className="pending-main">
        {pageState === "loading" && (
          <section className="pending-feedback" aria-live="polite">
            <RefreshCw className="pending-spin" size={28} />
            <p>Consultando a situação do seu cadastro...</p>
          </section>
        )}

        {pageState === "error" && (
          <section
            className="pending-feedback pending-feedback-error"
            role="alert"
          >
            <FileSearch size={32} />
            <h1>Não conseguimos carregar sua análise</h1>
            <p>{errorMessage}</p>
            <button type="button" onClick={() => void loadAccessStatus()}>
              <RefreshCw size={17} /> Tentar novamente
            </button>
          </section>
        )}

        {pageState === "ready" && profile && (
          <>
            <section className="pending-hero">
              <div className="pending-hero-icon">
                <Clock3 size={30} />
              </div>
              <p className="pending-eyebrow">Área de acompanhamento</p>
              <h1>
                Olá, {firstName}. {content.title}.
              </h1>
              <p>{content.description}</p>
              <div className="pending-status-row">
                <span>
                  <ShieldCheck size={16} /> Acesso protegido
                </span>
                {application && (
                  <span>Solicitação #{application.application_number}</span>
                )}
                <span>
                  {application?.submission_type === "assisted" ||
                  profile.approval_status === "assisted_review"
                    ? "Cadastro assistido"
                    : "Cadastro padrão"}
                </span>
              </div>
            </section>

            {application?.decision_reason && (
              <section
                className="pending-note"
                aria-labelledby="pending-note-title"
              >
                <h2 id="pending-note-title">Orientação da equipe</h2>
                <p>{application.decision_reason}</p>
              </section>
            )}

            <div className="pending-grid">
              <section className="pending-card">
                <div className="pending-card-heading">
                  <FileSearch size={21} />
                  <div>
                    <span>Situação atual</span>
                    <h2>{content.title}</h2>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Loja</dt>
                    <dd>
                      {profile.store_name || "Nome da loja não informado"}
                    </dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>
                      {profile.email || "E-mail protegido pela autenticação"}
                    </dd>
                  </div>
                  {application && (
                    <div>
                      <dt>Enviado em</dt>
                      <dd>{formatDate(application.submitted_at)}</dd>
                    </div>
                  )}
                  {application?.review_started_at && (
                    <div>
                      <dt>Análise iniciada em</dt>
                      <dd>{formatDate(application.review_started_at)}</dd>
                    </div>
                  )}
                  {application?.updated_at && (
                    <div>
                      <dt>Última atualização</dt>
                      <dd>{formatDate(application.updated_at)}</dd>
                    </div>
                  )}
                </dl>
                <Link className="pending-profile-link" href="/perfil">
                  Revisar meus dados <ArrowRight size={17} />
                </Link>
              </section>

              <section className="pending-card">
                <div className="pending-card-heading">
                  <ShieldCheck size={21} />
                  <div>
                    <span>Enquanto isso</span>
                    <h2>O que está disponível</h2>
                  </div>
                </div>
                <ul className="pending-permissions">
                  <li>
                    <CheckCircle2 size={18} /> Consultar o andamento da
                    solicitação
                  </li>
                  <li>
                    <CheckCircle2 size={18} /> Atualizar perfil, foto e senha
                  </li>
                  <li>
                    <CheckCircle2 size={18} /> Navegar pelas peças da Artenós
                  </li>
                </ul>
                <p className="pending-restriction">
                  A publicação de produtos e os recursos de vendedor serão
                  liberados somente depois da aprovação.
                </p>
                <Link className="pending-secondary-link" href="/">
                  Visitar a vitrine
                </Link>
              </section>
            </div>

            <section
              className="pending-timeline"
              aria-labelledby="pending-timeline-title"
            >
              <div className="pending-section-heading">
                <p className="pending-eyebrow">
                  Atualizações da equipe Artenós
                </p>
                <h2 id="pending-timeline-title">Histórico da solicitação</h2>
              </div>
              {audit.length > 0 ? (
                <ol>
                  {audit.map((entry) => (
                    <li key={entry.id}>
                      <span className="pending-timeline-dot" />
                      <div>
                        <strong>
                          {actionLabels[entry.action] || "Situação atualizada"}
                        </strong>
                        {entry.public_note && <p>{entry.public_note}</p>}
                        <time dateTime={entry.created_at}>
                          {formatDate(entry.created_at)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="pending-empty">
                  O histórico aparecerá aqui conforme a equipe atualizar sua
                  solicitação.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
