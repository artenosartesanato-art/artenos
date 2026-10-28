"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHead } from "@/components/admin-ui";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileSearch,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserRoundCheck,
} from "@/components/icons";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { useAdmin } from "@/components/admin-shell";

type ApplicationStatus =
  | "pending_review"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "suspended";
type AdminAction =
  | "start_review"
  | "request_changes"
  | "approve"
  | "reject"
  | "suspend"
  | "reactivate";

type ApplicationSummary = {
  application_id: string;
  application_number: number;
  status: ApplicationStatus;
  submission_type: "standard" | "assisted";
  assigned_admin_id: string | null;
  artisan_id: string;
  full_name: string;
  email: string;
  store_name: string | null;
  specialty: string | null;
  city: string;
  state: string;
  submitted_at: string;
  updated_at: string;
  total_count: number;
};

type ApplicationDetail = {
  application_id: string;
  application_number: number;
  application_status: ApplicationStatus;
  submission_type: "standard" | "assisted";
  assigned_admin_id: string | null;
  decision_reason: string | null;
  submitted_at: string;
  review_started_at: string | null;
  changes_requested_at: string | null;
  decided_at: string | null;
  application_updated_at: string;
  artisan_id: string;
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
  profile_created_at: string;
  profile_updated_at: string;
};

type AuditEntry = {
  id: string;
  action: string;
  status_from: string | null;
  status_to: string | null;
  public_note: string | null;
  internal_note: string | null;
  actor_name: string;
  created_at: string;
};

type StatusCount = { status: ApplicationStatus; total: number };

const PAGE_SIZE = 30;
const statuses: Array<{ value: "all" | ApplicationStatus; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "pending_review", label: "Pendentes" },
  { value: "under_review", label: "Em análise" },
  { value: "changes_requested", label: "Aguardando correção" },
  { value: "approved", label: "Aprovadas" },
  { value: "rejected", label: "Recusadas" },
  { value: "suspended", label: "Suspensas" },
];

const statusLabels: Record<ApplicationStatus, string> = {
  pending_review: "Pendente",
  under_review: "Em análise",
  changes_requested: "Correção solicitada",
  approved: "Aprovada",
  rejected: "Recusada",
  suspended: "Suspensa",
};

const actionLabels: Record<string, string> = {
  submitted: "Cadastro enviado",
  backfilled: "Cadastro incluído",
  assigned: "Responsável definido",
  review_started: "Análise iniciada",
  changes_requested: "Correções solicitadas",
  approved: "Cadastro aprovado",
  rejected: "Cadastro recusado",
  suspended: "Conta suspensa",
  reactivated: "Conta reativada",
  resubmitted: "Cadastro reenviado",
  status_changed: "Situação atualizada",
};

const actionContent: Record<
  AdminAction,
  { label: string; confirmation: string; success: string }
> = {
  start_review: {
    label: "Iniciar análise",
    confirmation: "Deseja assumir e iniciar a análise deste cadastro?",
    success: "Análise iniciada.",
  },
  request_changes: {
    label: "Solicitar correções",
    confirmation: "Enviar a orientação ao artesão e solicitar correções?",
    success: "Correções solicitadas.",
  },
  approve: {
    label: "Aprovar cadastro",
    confirmation: "Aprovar este artesão e liberar os recursos de vendedor?",
    success: "Cadastro aprovado e recursos de vendedor liberados.",
  },
  reject: {
    label: "Recusar cadastro",
    confirmation:
      "Recusar este cadastro? O motivo informado ficará visível para o artesão.",
    success: "Cadastro recusado.",
  },
  suspend: {
    label: "Suspender vendedor",
    confirmation: "Suspender os recursos de vendedor desta conta?",
    success: "Recursos de vendedor suspensos.",
  },
  reactivate: {
    label: "Reativar vendedor",
    confirmation: "Reativar os recursos de vendedor desta conta?",
    success: "Recursos de vendedor reativados.",
  },
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string | null) {
  if (!value) return "Não registrado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : dateFormatter.format(date);
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
  const digits = value.replace(/\D/g, "");
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

function availableActions(status: ApplicationStatus): AdminAction[] {
  if (status === "approved") return ["suspend"];
  if (status === "suspended") return ["reactivate"];
  if (status === "under_review")
    return ["request_changes", "approve", "reject"];
  if (status === "pending_review")
    return ["start_review", "request_changes", "approve", "reject"];
  if (status === "changes_requested")
    return ["start_review", "approve", "reject"];
  return ["start_review", "approve"];
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="admin-detail-item">
      <dt>{label}</dt>
      <dd>{value?.trim() || "Não informado"}</dd>
    </div>
  );
}

export default function ApprovalsPage() {
  const { refreshWaiting } = useAdmin();
  const [statusFilter, setStatusFilter] = useState<"all" | ApplicationStatus>(
    "pending_review",
  );
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [counts, setCounts] = useState<StatusCount[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [publicNote, setPublicNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [actionLoading, setActionLoading] = useState<AdminAction | null>(null);
  const loadApplications = useCallback(async () => {
    setListLoading(true);
    try {
      const supabase = getSupabase();
      const [listResult, countResult] = await Promise.all([
        supabase.rpc("list_admin_artisan_applications", {
          p_status: statusFilter === "all" ? null : statusFilter,
          p_query: query || null,
          p_limit: PAGE_SIZE,
          p_offset: offset,
        }),
        supabase.rpc("get_admin_application_counts"),
      ]);

      if (listResult.error) throw listResult.error;
      if (countResult.error) throw countResult.error;
      const rows = (listResult.data || []) as ApplicationSummary[];
      setApplications(rows);
      setTotal(Number(rows[0]?.total_count || 0));
      setCounts((countResult.data || []) as StatusCount[]);
    } catch {
      toast.error("Não foi possível carregar as solicitações administrativas.");
    } finally {
      setListLoading(false);
    }
  }, [offset, query, statusFilter]);

  const openApplication = useCallback(async (applicationId: string) => {
    setSelectedId(applicationId);
    setDetailLoading(true);
    setPublicNote("");
    setInternalNote("");
    try {
      const supabase = getSupabase();
      const [detailResult, auditResult] = await Promise.all([
        supabase
          .rpc("get_admin_artisan_application", {
            p_application_id: applicationId,
          })
          .single(),
        supabase.rpc("list_admin_application_audit", {
          p_application_id: applicationId,
        }),
      ]);
      if (detailResult.error || !detailResult.data)
        throw detailResult.error || new Error("Solicitação não encontrada.");
      if (auditResult.error) throw auditResult.error;
      setDetail(detailResult.data as ApplicationDetail);
      setAudit((auditResult.data || []) as AuditEntry[]);
    } catch {
      setDetail(null);
      setAudit([]);
      toast.error("Não foi possível abrir os detalhes desta solicitação.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadApplications());
  }, [loadApplications]);

  const countMap = useMemo(
    () => new Map(counts.map((item) => [item.status, Number(item.total)])),
    [counts],
  );
  const totalAll = useMemo(
    () => counts.reduce((sum, item) => sum + Number(item.total), 0),
    [counts],
  );
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setSelectedId(null);
    setDetail(null);
    setQuery(searchInput.trim().slice(0, 100));
  }

  function chooseStatus(status: "all" | ApplicationStatus) {
    setStatusFilter(status);
    setOffset(0);
    setSelectedId(null);
    setDetail(null);
  }

  async function runAction(action: AdminAction) {
    if (!detail || actionLoading) return;
    if (
      ["request_changes", "reject", "suspend"].includes(action) &&
      !publicNote.trim()
    ) {
      toast.error("Informe a orientação que ficará visível para o artesão.");
      return;
    }
    if (!window.confirm(actionContent[action].confirmation)) return;

    setActionLoading(action);
    try {
      const { error } = await getSupabase().rpc(
        "admin_manage_artisan_application",
        {
          p_application_id: detail.application_id,
          p_action: action,
          p_public_note: publicNote.trim() || null,
          p_internal_note: internalNote.trim() || null,
        },
      );
      if (error) throw error;
      toast.success(actionContent[action].success);
      refreshWaiting();
      await Promise.all([
        openApplication(detail.application_id),
        loadApplications(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message.includes("orientação pública")
          ? "Informe uma orientação pública para esta decisão."
          : message.includes("não é permitida")
            ? "Esta ação não é permitida para a situação atual. Atualize a lista."
            : "Não foi possível registrar a decisão.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="adm-page admin-main admin-approvals">
        <AdminPageHead eyebrow="Operação" title="Aprovação de lojas"
          description="Analise os cadastros de artesãs e mantenha um histórico verificável de cada decisão."
          actions={
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => void loadApplications()} disabled={listLoading}>
              <RefreshCw className={listLoading ? "admin-spin" : ""} size={15} /> Atualizar
            </button>
          } />

        <section
          className="admin-overview"
          aria-label="Resumo das solicitações"
        >
          <div>
            <Clock3 size={20} />
            <span>Pendentes</span>
            <strong>{countMap.get("pending_review") || 0}</strong>
          </div>
          <div>
            <FileSearch size={20} />
            <span>Em análise</span>
            <strong>{countMap.get("under_review") || 0}</strong>
          </div>
          <div>
            <MessageSquareWarning size={20} />
            <span>Correções</span>
            <strong>{countMap.get("changes_requested") || 0}</strong>
          </div>
          <div>
            <CheckCircle2 size={20} />
            <span>Aprovadas</span>
            <strong>{countMap.get("approved") || 0}</strong>
          </div>
        </section>

        <section className="admin-workspace">
          <aside className="admin-queue">
            <form className="admin-search" onSubmit={submitSearch}>
              <Search size={17} />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Nome, loja, e-mail ou documento"
                aria-label="Buscar solicitações"
              />
              <button type="submit">Buscar</button>
            </form>

            <div className="admin-filters" aria-label="Filtrar solicitações">
              {statuses.map((status) => (
                <button
                  key={status.value}
                  type="button"
                  className={statusFilter === status.value ? "active" : ""}
                  onClick={() => chooseStatus(status.value)}
                >
                  {status.label}
                  <span>
                    {status.value === "all"
                      ? totalAll
                      : countMap.get(status.value) || 0}
                  </span>
                </button>
              ))}
            </div>

            <div className="admin-list" aria-busy={listLoading}>
              {listLoading ? (
                <div className="admin-list-feedback">
                  <Loader2 className="admin-spin" size={24} /> Carregando
                  solicitações...
                </div>
              ) : applications.length ? (
                applications.map((application) => (
                  <button
                    key={application.application_id}
                    type="button"
                    className={`admin-application ${selectedId === application.application_id ? "selected" : ""}`}
                    onClick={() =>
                      void openApplication(application.application_id)
                    }
                  >
                    <div className="admin-application-top">
                      <span
                        className={`admin-status status-${application.status}`}
                      >
                        {statusLabels[application.status]}
                      </span>
                      <small>#{application.application_number}</small>
                    </div>
                    <strong>
                      {application.store_name || application.full_name}
                    </strong>
                    <p>{application.full_name}</p>
                    <div>
                      <span>
                        {application.city}/{application.state}
                      </span>
                      <time>{formatDate(application.submitted_at)}</time>
                    </div>
                    <ChevronRight size={17} />
                  </button>
                ))
              ) : (
                <div className="admin-list-feedback">
                  <FileSearch size={29} />
                  <strong>Nenhuma solicitação encontrada</strong>
                  <p>Altere o filtro ou faça uma nova busca.</p>
                </div>
              )}
            </div>

            {total > PAGE_SIZE && (
              <div className="admin-pagination">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Anterior
                </button>
                <span>
                  {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Próxima
                </button>
              </div>
            )}
          </aside>

          <section className="admin-review">
            {!selectedId && (
              <div className="admin-empty-detail">
                <FileCheck2 size={43} />
                <h2>Selecione uma solicitação</h2>
                <p>
                  Os dados cadastrais, o histórico e as ações aparecerão aqui.
                </p>
              </div>
            )}
            {selectedId && detailLoading && (
              <div className="admin-empty-detail">
                <Loader2 className="admin-spin" size={32} />
                <p>Carregando os dados do cadastro...</p>
              </div>
            )}
            {selectedId && !detailLoading && !detail && (
              <div className="admin-empty-detail">
                <AlertTriangle size={36} />
                <h2>Detalhes indisponíveis</h2>
                <button
                  type="button"
                  onClick={() => void openApplication(selectedId)}
                >
                  Tentar novamente
                </button>
              </div>
            )}
            {detail && !detailLoading && (
              <div className="admin-detail">
                <div className="admin-detail-header">
                  <div>
                    <span
                      className={`admin-status status-${detail.application_status}`}
                    >
                      {statusLabels[detail.application_status]}
                    </span>
                    <p>Solicitação #{detail.application_number}</p>
                    <h2>{detail.store_name || detail.full_name}</h2>
                    <small>
                      {detail.submission_type === "assisted"
                        ? "Cadastro assistido"
                        : "Cadastro padrão"}{" "}
                      · enviado em {formatDate(detail.submitted_at)}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setDetail(null);
                    }}
                    aria-label="Fechar detalhes"
                  >
                    <ArrowLeft size={18} />
                  </button>
                </div>

                {detail.decision_reason && (
                  <div className="admin-current-note">
                    <strong>Orientação pública atual</strong>
                    <p>{detail.decision_reason}</p>
                  </div>
                )}

                <div className="admin-detail-sections">
                  <section>
                    <h3>
                      <Store size={18} /> Informações da loja
                    </h3>
                    <dl>
                      <DetailItem
                        label="Nome da loja"
                        value={detail.store_name}
                      />
                      <DetailItem
                        label="Especialidade"
                        value={detail.specialty}
                      />
                      <DetailItem label="História" value={detail.story} />
                    </dl>
                  </section>
                  <section>
                    <h3>
                      <UserRoundCheck size={18} /> Responsável
                    </h3>
                    <dl>
                      <DetailItem
                        label="Nome completo"
                        value={detail.full_name}
                      />
                      <DetailItem label="E-mail" value={detail.email} />
                      <DetailItem
                        label={
                          detail.document.replace(/\D/g, "").length === 14
                            ? "CNPJ"
                            : "CPF"
                        }
                        value={formatDocument(detail.document)}
                      />
                      <DetailItem
                        label="Telefone"
                        value={formatPhone(detail.phone)}
                      />
                    </dl>
                  </section>
                  <section>
                    <h3>
                      <ShieldCheck size={18} /> Endereço e cadastro
                    </h3>
                    <dl>
                      <DetailItem label="CEP" value={formatCep(detail.cep)} />
                      <DetailItem
                        label="Endereço"
                        value={`${detail.address}, ${detail.address_number}`}
                      />
                      <DetailItem
                        label="Cidade/UF"
                        value={`${detail.city}/${detail.state}`}
                      />
                      <DetailItem
                        label="Termos aceitos"
                        value={formatDate(detail.terms_accepted_at)}
                      />
                      <DetailItem
                        label="Cadastro criado"
                        value={formatDate(detail.profile_created_at)}
                      />
                    </dl>
                  </section>
                </div>

                <section className="admin-decision">
                  <div>
                    <p>Registrar decisão</p>
                    <h3>Ação administrativa</h3>
                    <span>
                      A orientação pública será exibida ao artesão. A nota
                      interna fica visível apenas para administradores.
                    </span>
                  </div>
                  <label>
                    Orientação para o artesão
                    <textarea
                      value={publicNote}
                      onChange={(event) => setPublicNote(event.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="Obrigatória para solicitar correções, recusar ou suspender."
                    />
                  </label>
                  <label>
                    Nota interna
                    <textarea
                      value={internalNote}
                      onChange={(event) => setInternalNote(event.target.value)}
                      maxLength={4000}
                      rows={2}
                      placeholder="Opcional. Não será exibida ao artesão."
                    />
                  </label>
                  <div className="admin-actions">
                    {availableActions(detail.application_status).map(
                      (action) => (
                        <button
                          key={action}
                          type="button"
                          className={`action-${action}`}
                          disabled={actionLoading !== null}
                          onClick={() => void runAction(action)}
                        >
                          {actionLoading === action && (
                            <Loader2 className="admin-spin" size={16} />
                          )}
                          {actionContent[action].label}
                        </button>
                      ),
                    )}
                  </div>
                </section>

                <section className="admin-audit">
                  <div>
                    <p>Registro permanente</p>
                    <h3>Histórico da solicitação</h3>
                  </div>
                  {audit.length ? (
                    <ol>
                      {audit.map((entry) => (
                        <li key={entry.id}>
                          <span className="admin-audit-dot" />
                          <div>
                            <strong>
                              {actionLabels[entry.action] ||
                                "Situação atualizada"}
                            </strong>
                            <small>
                              {entry.actor_name} ·{" "}
                              {formatDate(entry.created_at)}
                            </small>
                            {entry.public_note && (
                              <p>
                                <b>Visível ao artesão:</b> {entry.public_note}
                              </p>
                            )}
                            {entry.internal_note && (
                              <p className="admin-internal-note">
                                <b>Nota interna:</b> {entry.internal_note}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="admin-no-audit">Nenhum evento registrado.</p>
                  )}
                </section>
              </div>
            )}
          </section>
        </section>
    </div>
  );
}
