"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Check,
  ChevronLeft,
  MessageCircle,
  PackageOpen,
  Reply,
  Search,
  Send,
  Sparkles,
  Store,
  X,
} from "@/components/icons";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { getMessageSuggestions, messageTopics, type MessageTopic } from "@/lib/message-suggestions";
import { clearProductInquiry, pendingProductInquiry, validProductId } from "@/lib/product-inquiry-intent";
import { accessHref } from "@/lib/navigation";
import { useNotifications } from "@/components/notifications";
import { formatClock, formatListTime, groupChat, initials } from "@/lib/message-format";

type Order = { id: string; product_name: string; created_at: string };
const topicLabel = (value: MessageTopic) =>
  messageTopics.find((topic) => topic.value === value)?.label ?? "Geral";
type Conversation = {
  conversation_id: string;
  order_id: string | null;
  product_id: string | null;
  product_name: string;
  other_name: string;
  my_role: "client" | "artisan";
  kind: "pedido" | "encomenda" | "produto";
  last_message_at: string;
  artisan_id: string;
  artisan_name: string | null;
  store_name: string | null;
  product_image_url: string | null;
};
type Message = {
  id: string;
  sender_id: string;
  body: string;
  topic: MessageTopic;
  reply_to_id: string | null;
  created_at: string;
};
type ListFilter = "todas" | Conversation["kind"];
const LIST_FILTERS: { value: ListFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "produto", label: "Peças" },
  { value: "pedido", label: "Pedidos" },
  { value: "encomenda", label: "Encomendas" },
];
const KIND_LABEL: Record<Conversation["kind"], string> = {
  produto: "Pergunta sobre a peça",
  pedido: "Pedido",
  encomenda: "Sob encomenda",
};

/** Nome de quem está do outro lado da conversa. */
function partnerName(conversation: Conversation, sellerMode: boolean) {
  return sellerMode
    ? conversation.other_name || "Cliente"
    : conversation.store_name || conversation.artisan_name || conversation.other_name || "Loja";
}

function Avatar({ conversation, sellerMode, size = "md" }: {
  conversation: Conversation; sellerMode: boolean; size?: "md" | "lg";
}) {
  // A foto da peça identifica o assunto; sem foto, as iniciais de quem responde.
  return (
    <span className={`chat-avatar chat-avatar--${size}`} aria-hidden="true">
      {conversation.product_image_url
        ? <Image src={conversation.product_image_url} alt="" width={48} height={48} unoptimized />
        : <span>{initials(partnerName(conversation, sellerMode))}</span>}
    </span>
  );
}

export function MessagesWorkspace({
  sellerMode = false,
}: {
  sellerMode?: boolean;
}) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState("Carregando...");
  const [orders, setOrders] = useState<Order[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState<MessageTopic>("geral");
  const [topicFilter, setTopicFilter] = useState<MessageTopic | "todos">("todos");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [listFilter, setListFilter] = useState<ListFilter>("todas");
  const [listQuery, setListQuery] = useState("");
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const [openError, setOpenError] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [signInHref, setSignInHref] = useState(() => accessHref(sellerMode ? "/vendedor/mensagens" : "/mensagens"));
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsToggleRef = useRef<HTMLButtonElement>(null);
  const productEntryRef = useRef<string | null>(null);
  const notifications = useNotifications();
  const setActiveRef = notifications?.setActiveRef;
  const unreadByConversation = notifications?.unreadByRef;

  // Mensagens que chegam depois do carregamento (enviadas ou em tempo real)
  // ganham a animação de entrada; o histórico carregado aparece sem animar.
  const addMessage = useCallback((msg: Message) => {
    setFreshIds((previous) => new Set(previous).add(msg.id));
    setMessages((previous) =>
      previous.some((message) => message.id === msg.id)
        ? previous
        : [...previous, msg],
    );
  }, []);

  const refreshAll = useCallback(
    async (currentUser: User) => {
      const supabase = getSupabase();
      const [ordersRes, contextRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, product_name, created_at")
          .eq(sellerMode ? "artisan_id" : "client_id", currentUser.id)
          .order("created_at", { ascending: false }),
        supabase.rpc("list_my_conversations_v3"),
      ]);
      const listRes = contextRes.error?.code === "PGRST202"
        ? await supabase.rpc("list_my_conversations_v2")
        : contextRes;

      if (ordersRes.error) {
        setStatus("Não foi possível carregar seus pedidos agora. Tente novamente em instantes.");
        return null;
      }
      if (listRes.error) {
        setStatus("Não foi possível carregar suas conversas agora. Tente novamente em instantes.");
        return null;
      }

      const expectedRole: Conversation["my_role"] = sellerMode
        ? "artisan"
        : "client";
      const roleConversations = ((listRes.data ?? []) as Conversation[])
        .filter((conversation) => conversation.my_role === expectedRole)
        .map((conversation) => ({
          ...conversation,
          artisan_id: conversation.artisan_id ?? "",
          artisan_name: conversation.artisan_name ?? null,
          store_name: conversation.store_name ??
            (conversation.my_role === "client" ? conversation.other_name : null),
          product_image_url: conversation.product_image_url ?? null,
        }));
      const withChat = new Set(
        roleConversations.flatMap((conversation) =>
          conversation.order_id ? [conversation.order_id] : [],
        ),
      );
      setOrders(
        ((ordersRes.data ?? []) as Order[]).filter(
          (order) => !withChat.has(order.id),
        ),
      );
      setConversations(roleConversations);
      return roleConversations;
    },
    [sellerMode],
  );

  useEffect(() => {
    let active = true;
    async function init() {
      let supabase: ReturnType<typeof getSupabase>;
      try {
        supabase = getSupabase();
      } catch {
        setStatus("As mensagens estão temporariamente indisponíveis.");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const params = new URLSearchParams(search);
      const requestedProduct = !sellerMode ? params.get("produto") : null;
      const validProduct = validProductId(requestedProduct)
        ? requestedProduct
        : !requestedProduct && !sellerMode ? pendingProductInquiry() : null;
      if (!data.session) {
        setUser(null);
        setCurrent(null);
        if (validProduct) {
          clearProductInquiry();
          setSignInHref(accessHref(`/mensagens?produto=${validProduct}`));
        }
        setStatus(
          "Você precisa estar logado. Faça login e volte para esta página.",
        );
        return;
      }

      setUser(data.session.user);
      setCurrent(null);
      setOpenError("");
      setStatus(validProduct ? "Abrindo a conversa sobre esta peça…" : "");
      let requestedConversation = params.get("conversa");
      let productError = "";
      if (validProduct) {
        const { data: conversationId, error } = await supabase.rpc(
          "start_product_conversation",
          { p_product_id: validProduct },
        );
        clearProductInquiry();
        if (!active) return;
        if (error) {
          // Só repassa os avisos escritos para quem usa (raise exception da
          // função); erros técnicos do banco viram uma mensagem neutra.
          const known = ["Faça login", "Produto indisponível", "própria loja", "Não foi possível abrir"];
          productError = known.some((text) => error.message.includes(text))
            ? error.message
            : "Não conseguimos abrir esta conversa agora. Tente novamente em instantes.";
          if (productError !== error.message) console.error("start_product_conversation:", error.message);
        }
        else requestedConversation = conversationId as string;
      }
      const list = await refreshAll(data.session.user);
      if (!active) return;
      const requested = list?.find((conversation) =>
        conversation.conversation_id === requestedConversation &&
        (!validProduct || conversation.product_id === validProduct),
      ) ?? (validProduct
        ? list?.find((conversation) => conversation.product_id === validProduct)
        : null);
      if (requested) {
        productEntryRef.current = validProduct && requested.kind === "produto"
          ? requested.conversation_id
          : null;
        setCurrent(requested);
        setStatus("");
      } else if (validProduct) {
        const reason = productError || "A conversa desta peça não apareceu na sua conta. Tente novamente.";
        setOpenError(reason);
        setStatus("Não foi possível abrir a conversa sobre o produto.");
      }
    }

    void init();
    return () => { active = false; };
  }, [refreshAll, sellerMode, search]);

  useEffect(() => {
    if (!current) return;
    const activeConversation = current;
    const supabase = getSupabase();
    let active = true;

    async function loadMessages(conversationId: string) {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, topic, reply_to_id, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!active) return;
      if (error)
        return setStatus("Não foi possível carregar as mensagens desta conversa. Tente novamente.");

      const loaded = (data ?? []) as Message[];
      if (loaded.length === 0 && productEntryRef.current === conversationId) {
        setText(`Olá! Gostaria de saber mais sobre ${activeConversation.product_name}.`);
      }
      if (productEntryRef.current === conversationId) productEntryRef.current = null;
      setMessages((previous) => {
        const ids = new Set(loaded.map((message) => message.id));
        return [
          ...loaded,
          ...previous.filter((message) => !ids.has(message.id)),
        ];
      });
    }

    queueMicrotask(() => {
      if (!active) return;
      setMessages([]);
      setText("");
      setReplyTo(null);
      setTopic(current.kind === "produto" ? "produto" : "geral");
      setTopicFilter("todos");
      setSuggestionsOpen(false);
    });
    void loadMessages(current.conversation_id);

    const channel = supabase
      .channel("chat-" + current.conversation_id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${current.conversation_id}`,
        },
        (payload) => addMessage(payload.new as Message),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [current, addMessage]);

  // Chegou mensagem em outra conversa: reordena a lista (horário e contador).
  const unreadTotal = notifications?.unread ?? 0;
  useEffect(() => {
    if (user && unreadTotal > 0) queueMicrotask(() => void refreshAll(user));
  }, [unreadTotal, user, refreshAll]);

  // Conversa aberta: os avisos dela são lidos e novas mensagens tocam só um som discreto.
  useEffect(() => {
    if (!setActiveRef) return;
    setActiveRef(current?.conversation_id ?? null);
    return () => setActiveRef(null);
  }, [current, setActiveRef]);

  useEffect(() => {
    // Rola só o histórico: scrollIntoView também rolava a página e deixava o
    // cabeçalho fixo por cima da conversa.
    const thread = threadRef.current;
    if (thread && messages.length > 0) thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Campo cresce com o texto até 6 linhas, como nos apps de conversa.
  useEffect(() => {
    const field = textRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 152)}px`;
  }, [text]);

  const visibleConversations = useMemo(() => {
    const query = listQuery.trim().toLocaleLowerCase("pt-BR");
    return conversations.filter((conversation) =>
      (listFilter === "todas" || conversation.kind === listFilter) &&
      (!query || `${conversation.product_name} ${partnerName(conversation, sellerMode)}`
        .toLocaleLowerCase("pt-BR").includes(query)));
  }, [conversations, listFilter, listQuery, sellerMode]);

  const visibleMessages = useMemo(
    () => groupChat(messages.filter((message) => topicFilter === "todos" || message.topic === topicFilter)),
    [messages, topicFilter],
  );

  function focusComposer() {
    window.setTimeout(() => textRef.current?.focus(), 0);
  }

  function selectSuggestion(suggestion: string) {
    setText(suggestion);
    setSuggestionsOpen(false);
    focusComposer();
  }

  function closeSuggestions() {
    setSuggestionsOpen(false);
    suggestionsToggleRef.current?.focus();
  }

  function openConversation(conversation: Conversation) {
    setOpenError("");
    setCurrent(conversation);
  }

  function backToList() {
    const id = current?.conversation_id;
    setCurrent(null);
    window.setTimeout(() => document.getElementById(`conversa-${id}`)?.focus(), 0);
  }

  function jumpToMessage(id: string) {
    const target = document.getElementById(`mensagem-${id}`);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.remove("is-highlighted");
    void target.offsetWidth;
    target.classList.add("is-highlighted");
  }

  async function startConversation(orderId: string, title: string) {
    if (!user) return;
    const supabase = getSupabase();
    const { data: conversationId, error } = await supabase.rpc(
      "start_conversation",
      { p_order_id: orderId },
    );
    if (error) return setStatus("Não foi possível iniciar a conversa agora. Tente novamente.");
    const list = await refreshAll(user);
    const started = list?.find((conversation) => conversation.conversation_id === conversationId);
    if (started) setCurrent(started);
    else setStatus(`Não foi possível abrir a conversa de ${title}.`);
  }

  async function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const body = text.trim();
    if (!body || !current || !user || sending) return;
    const supabase = getSupabase();
    setSending(true);

    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: current.conversation_id,
        sender_id: user.id,
        body,
        topic,
        reply_to_id: replyTo?.id ?? null,
      })
      .select("id, sender_id, body, topic, reply_to_id, created_at")
      .single();

    setSending(false);
    // O texto digitado é preservado quando o envio falha.
    if (error) return setStatus("A mensagem não foi enviada. Confira sua conexão e tente novamente.");
    setStatus("");
    setText("");
    setReplyTo(null);
    setTopicFilter("todos");
    addMessage(data as Message);
    void refreshAll(user);
    focusComposer();
  }

  function onComposerKey(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra a linha (e não interfere em teclados com acentuação em composição).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const authorName = (message: Message) =>
    message.sender_id === user?.id ? "Você" : current ? partnerName(current, sellerMode) : "";
  const suggestions = current
    ? getMessageSuggestions(topic, `“${current.product_name}”`, current.my_role)
    : [];

  // No painel da loja o SellerShell já fornece o <main>.
  const Main = sellerMode ? "div" : "main";
  return (
    <div className={sellerMode ? "messages-workspace messages-workspace-seller" : "store-page messages-page"}>
      <Main
        id={sellerMode ? undefined : "conteudo"}
        tabIndex={sellerMode ? undefined : -1}
        className={`messages-main${sellerMode ? " messages-main-seller" : " store-container"}${current ? " has-current" : ""}`}
      >
        <div className="messages-intro">
          <p className={sellerMode ? "seller-eyebrow" : "store-eyebrow"}>
            {sellerMode ? "Atendimento da loja" : "Sua conta Artenós"}
          </p>
          <h1>Mensagens</h1>
          <p>
            {sellerMode
              ? "Responda perguntas sobre peças, encomendas e pedidos em um só lugar."
              : "Converse com as lojas sobre peças, encomendas e pedidos em um só lugar."}
          </p>
        </div>
        {status && <p className="messages-status" role="status">{status}</p>}

        {!user ? (
          <div className="messages-signin">
            <MessageCircle size={34} />
            <h2>Entre para ver suas conversas</h2>
            <p>Suas mensagens ficam disponíveis depois de acessar sua conta.</p>
            <Link href={signInHref}>Entrar ou cadastrar</Link>
          </div>
        ) : (
          <div className={`chat-app${current || openError ? " has-chat" : ""}`}>
            <aside className="chat-list" aria-label="Conversas">
              <div className="chat-list-head">
                <h2>Conversas <span>{conversations.length}</span></h2>
                <label className="chat-search">
                  <Search size={16} aria-hidden="true" />
                  <span className="messages-visually-hidden">Buscar conversa</span>
                  <input type="search" value={listQuery} onChange={(event) => setListQuery(event.target.value)}
                    placeholder="Buscar por peça ou nome" maxLength={80} />
                </label>
                <div className="chat-filters" role="group" aria-label="Filtrar conversas">
                  {LIST_FILTERS.map((filter) => (
                    <button key={filter.value} type="button" aria-pressed={listFilter === filter.value}
                      onClick={() => setListFilter(filter.value)}>
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="chat-list-scroll">
                {visibleConversations.length === 0 ? (
                  <p className="chat-list-empty">
                    {conversations.length === 0
                      ? sellerMode
                        ? "Quando um cliente perguntar sobre uma peça ou pedido, a conversa aparece aqui."
                        : "Para conversar com uma loja, toque no balão de mensagem de uma peça."
                      : "Nenhuma conversa encontrada com este filtro."}
                  </p>
                ) : (
                  <ul className="chat-rows">
                    {visibleConversations.map((conversation) => {
                      const active = current?.conversation_id === conversation.conversation_id;
                      const unread = active ? 0 : unreadByConversation?.get(conversation.conversation_id) ?? 0;
                      return (
                        <li key={conversation.conversation_id}>
                          <button type="button" id={`conversa-${conversation.conversation_id}`}
                            className={`chat-row${active ? " is-active" : ""}${unread ? " has-unread" : ""}`}
                            aria-current={active ? "true" : undefined}
                            onClick={() => openConversation(conversation)}>
                            <Avatar conversation={conversation} sellerMode={sellerMode} />
                            <span className="chat-row-copy">
                              <span className="chat-row-top">
                                <strong>{partnerName(conversation, sellerMode)}</strong>
                                <time dateTime={conversation.last_message_at}>
                                  {formatListTime(conversation.last_message_at)}
                                </time>
                              </span>
                              <span className="chat-row-sub">
                                <span className={`chat-kind chat-kind--${conversation.kind}`}>{KIND_LABEL[conversation.kind]}</span>
                                <span className="chat-row-product">{conversation.product_name}</span>
                                {unread > 0 && (
                                  <span className="chat-unread">
                                    {unread > 99 ? "99+" : unread}
                                    <span className="messages-visually-hidden"> {unread === 1 ? "mensagem nova" : "mensagens novas"}</span>
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {orders.length > 0 && (
                  <section className="chat-orders" aria-labelledby="chat-orders-title">
                    <h3 id="chat-orders-title">{sellerMode ? "Vendas sem conversa" : "Compras sem conversa"}</h3>
                    <ul className="chat-rows">
                      {orders.map((order) => (
                        <li key={order.id}>
                          <button type="button" className="chat-row chat-row--start"
                            onClick={() => startConversation(order.id, order.product_name)}>
                            <span className="chat-avatar chat-avatar--md chat-avatar--icon" aria-hidden="true">
                              <PackageOpen size={20} />
                            </span>
                            <span className="chat-row-copy">
                              <span className="chat-row-top">
                                <strong>{order.product_name}</strong>
                                <time dateTime={order.created_at}>{formatListTime(order.created_at)}</time>
                              </span>
                              <span className="chat-row-sub"><span className="chat-row-cta">Iniciar conversa sobre este pedido</span></span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </aside>

            <section className="chat-pane" aria-label="Conversa selecionada">
              {current ? (
                <>
                  <header className="chat-head">
                    <button type="button" className="chat-back" onClick={backToList} aria-label="Voltar para as conversas">
                      <ChevronLeft size={20} />
                    </button>
                    <Avatar conversation={current} sellerMode={sellerMode} size="lg" />
                    <div className="chat-head-copy">
                      <h2>{partnerName(current, sellerMode)}</h2>
                      <p>{KIND_LABEL[current.kind]}</p>
                    </div>
                    <label className="chat-topic-filter">
                      <span className="messages-visually-hidden">Mostrar mensagens do assunto</span>
                      <select value={topicFilter}
                        onChange={(event) => setTopicFilter(event.target.value as MessageTopic | "todos")}>
                        <option value="todos">Todos os assuntos</option>
                        {messageTopics.map((entry) => (
                          <option key={entry.value} value={entry.value}>{entry.label}</option>
                        ))}
                      </select>
                    </label>
                  </header>

                  <div className="chat-context">
                    <span className="chat-context-thumb" aria-hidden="true">
                      {current.product_image_url
                        ? <Image src={current.product_image_url} alt="" width={40} height={40} unoptimized />
                        : <PackageOpen size={18} />}
                    </span>
                    <div>
                      <small>{current.kind === "produto" ? "Peça desta conversa" : current.kind === "encomenda" ? "Encomenda" : "Pedido"}</small>
                      <strong>{current.product_name}</strong>
                    </div>
                    {!sellerMode && current.artisan_id && (
                      <Link className="chat-context-link" href={`/loja?id=${encodeURIComponent(current.artisan_id)}`} aria-label="Ver loja">
                        <Store size={15} /> <span>Ver loja</span>
                      </Link>
                    )}
                  </div>

                  <div ref={threadRef} className="chat-thread" role="log" aria-live="polite" aria-label="Histórico da conversa">
                    {visibleMessages.length === 0 ? (
                      <div className="chat-empty">
                        <Sparkles size={26} />
                        <h3>{messages.length === 0 ? "Comece a conversa" : "Nenhuma mensagem neste assunto"}</h3>
                        {messages.length === 0 && (
                          <>
                            <p>Escolha um ponto de partida ou escreva com suas palavras.</p>
                            <div className="chat-quick">
                              {suggestions.slice(0, 3).map((suggestion) => (
                                <button key={suggestion} type="button" onClick={() => selectSuggestion(suggestion)}>
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <ol className="chat-messages">
                        {visibleMessages.map(({ message, dayLabel, firstOfGroup, lastOfGroup }) => {
                          const own = message.sender_id === user.id;
                          const original = message.reply_to_id
                            ? messages.find((item) => item.id === message.reply_to_id)
                            : null;
                          return (
                            <li key={message.id} className="chat-item">
                              {dayLabel && <p className="chat-day"><span>{dayLabel}</span></p>}
                              <div id={`mensagem-${message.id}`}
                                className={`chat-msg${own ? " is-own" : ""}${firstOfGroup ? " is-first" : ""}${lastOfGroup ? " is-last" : ""}${freshIds.has(message.id) ? " is-fresh" : ""}`}>
                                <div className="chat-bubble">
                                  <span className="messages-visually-hidden">{authorName(message)}: </span>
                                  {message.reply_to_id && (
                                    <button type="button" className="chat-quote"
                                      onClick={() => original && jumpToMessage(original.id)}
                                      aria-label={original ? `Ver a mensagem respondida de ${authorName(original)}` : "Mensagem respondida"}>
                                      <strong>{original ? authorName(original) : "Mensagem anterior"}</strong>
                                      <span>{original?.body ?? "Mensagem anterior"}</span>
                                    </button>
                                  )}
                                  <p className="chat-text">{message.body}</p>
                                  <span className="chat-meta">
                                    {message.topic !== "geral" && <span className="chat-topic">{topicLabel(message.topic)}</span>}
                                    <time dateTime={message.created_at}>{formatClock(message.created_at)}</time>
                                    {own && <><Check size={14} className="chat-sent" /><span className="messages-visually-hidden">, enviada</span></>}
                                  </span>
                                </div>
                                <button type="button" className="chat-reply"
                                  onClick={() => { setReplyTo(message); setTopic(message.topic); focusComposer(); }}
                                  aria-label={`Responder: ${message.body.slice(0, 60)}`}>
                                  <Reply size={16} />
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>

                  <form className="chat-composer" onSubmit={sendMessage}>
                    {replyTo && (
                      <div className="chat-replying">
                        <div>
                          <strong>Respondendo a {authorName(replyTo)}</strong>
                          <span>{replyTo.body}</span>
                        </div>
                        <button type="button" onClick={() => { setReplyTo(null); focusComposer(); }} aria-label="Cancelar resposta">
                          <X size={16} />
                        </button>
                      </div>
                    )}
                    {suggestionsOpen && (
                      <div className="chat-suggestions" id="chat-sugestoes" role="region" aria-label="Sugestões de mensagem"
                        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeSuggestions(); } }}>
                        <div className="chat-suggestions-topics" role="group" aria-label="Assunto da mensagem">
                          {messageTopics.map((entry) => (
                            <button key={entry.value} type="button" aria-pressed={topic === entry.value}
                              onClick={() => setTopic(entry.value)}>
                              {entry.label}
                            </button>
                          ))}
                        </div>
                        <ul>
                          {suggestions.map((suggestion) => (
                            <li key={suggestion}>
                              <button type="button" onClick={() => selectSuggestion(suggestion)}>{suggestion}</button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="chat-compose-row">
                      <button ref={suggestionsToggleRef} type="button" className="chat-tool"
                        aria-expanded={suggestionsOpen} aria-controls="chat-sugestoes"
                        onClick={() => setSuggestionsOpen((open) => !open)}>
                        <Sparkles size={18} aria-hidden="true" />
                        <span className="chat-tool-label">{topicLabel(topic)}</span>
                        <span className="messages-visually-hidden">: assunto e sugestões</span>
                      </button>
                      <label htmlFor="messages-text" className="messages-visually-hidden">Sua mensagem</label>
                      <textarea id="messages-text" ref={textRef} rows={1} value={text}
                        onChange={(event) => setText(event.target.value)} onKeyDown={onComposerKey}
                        maxLength={2000} placeholder="Escreva uma mensagem" aria-describedby="chat-compose-hint" />
                      <button type="submit" className="chat-send" disabled={sending || !text.trim()} aria-busy={sending}
                        aria-label={sending ? "Enviando mensagem" : "Enviar mensagem"}>
                        <Send size={18} />
                      </button>
                    </div>
                    <p id="chat-compose-hint" className="chat-compose-hint">Enter envia · Shift + Enter quebra a linha</p>
                  </form>
                </>
              ) : openError ? (
                <div className="chat-placeholder" role="alert">
                  <MessageCircle size={40} />
                  <h2>Não foi possível abrir a conversa desta peça</h2>
                  <p>{openError}</p>
                  {openError.includes("própria loja") && (
                    <p>Para testar o contato com a loja, entre com uma conta de cliente diferente da conta vendedora.</p>
                  )}
                  <Link href="/categorias">Voltar aos produtos</Link>
                </div>
              ) : (
                <div className="chat-placeholder">
                  <MessageCircle size={42} />
                  <h2>Escolha uma conversa</h2>
                  <p>Abra uma conversa da lista ou comece uma pelo balão de mensagem de uma peça.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </Main>
    </div>
  );
}
