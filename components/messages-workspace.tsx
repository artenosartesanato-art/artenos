"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  MessageCircle,
  PackageOpen,
  Send,
  Sparkles,
  X,
} from "@/components/icons";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { CustomerFooter } from "@/components/customer-footer";
import { StandaloneCustomerHeader } from "@/components/standalone-customer-header";
import { getSupabase } from "@/lib/supabase";
import { getMessageSuggestions, messageTopics, type MessageTopic } from "@/lib/message-suggestions";
import { clearProductInquiry, pendingProductInquiry, validProductId } from "@/lib/product-inquiry-intent";
import { accessHref } from "@/lib/navigation";

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
function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
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
  const [suggestionTopic, setSuggestionTopic] = useState<MessageTopic | null>(null);
  const [openError, setOpenError] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [signInHref, setSignInHref] = useState(() => accessHref(sellerMode ? "/vendedor/mensagens" : "/mensagens"));
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const suggestionCloseRef = useRef<HTMLButtonElement>(null);
  const productEntryRef = useRef<string | null>(null);

  const addMessage = useCallback((msg: Message) => {
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
      setStatus(validProduct ? "Abrindo a conversa sobre esta peça..." : "Logado como " + data.session.user.email);
      let requestedConversation = params.get("conversa");
      let productError = "";
      if (validProduct) {
        const { data: conversationId, error } = await supabase.rpc(
          "start_product_conversation",
          { p_product_id: validProduct },
        );
        clearProductInquiry();
        if (!active) return;
        if (error) productError = error.message;
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
        setStatus("Logado como " + data.session.user.email);
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!suggestionTopic) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => suggestionCloseRef.current?.focus(), 0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSuggestionTopic(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [suggestionTopic]);

  function selectSuggestion(suggestion: string) {
    setText(suggestion);
    setSuggestionTopic(null);
    window.setTimeout(() => document.getElementById("messages-text")?.focus(), 0);
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

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
  }

  return (
    <div
      className={
        sellerMode
          ? "messages-workspace messages-workspace-seller"
          : "store-page messages-page"
      }
    >
      {!sellerMode && <StandaloneCustomerHeader />}

      <main
        className={
          sellerMode
            ? "messages-main messages-main-seller"
            : "store-container messages-main"
        }
      >
        <div className="messages-intro">
          <p className={sellerMode ? "seller-eyebrow" : "store-eyebrow"}>
            {sellerMode ? "ATENDIMENTO DA LOJA" : "SUA CONTA ARTENÓS"}
          </p>
          <h1>Mensagens</h1>
          <p>
            {sellerMode
              ? "Responda perguntas sobre peças, encomendas e pedidos em um só lugar."
              : "Converse com as lojas sobre peças, encomendas e pedidos em um só lugar."}
          </p>
        </div>
        <p className="messages-status" aria-live="polite">
          {status}
        </p>

        {!user ? (
          <div className="messages-signin">
            <MessageCircle size={34} />
            <h2>Entre para ver suas conversas</h2>
            <p>Suas mensagens ficam disponíveis depois de acessar sua conta.</p>
            <Link href={signInHref}>Entrar ou cadastrar</Link>
          </div>
        ) : (
          <div className="messages-layout">
            <aside
              className="messages-sidebar"
              aria-label="Pedidos e conversas"
            >
              <section className="messages-list-section">
                <h2>
                  Minhas conversas <span>{conversations.length}</span>
                </h2>
                {conversations.length === 0 ? (
                  <p className="messages-empty-list">
                    Você ainda não tem conversas.
                  </p>
                ) : (
                  <ul>
                    {conversations.map((conversation) => (
                      <li key={conversation.conversation_id}>
                        <button
                          type="button"
                          className={
                            current?.conversation_id === conversation.conversation_id
                              ? "is-active"
                              : ""
                          }
                          onClick={() => setCurrent(conversation)}
                        >
                          <span className="messages-list-icon">
                            <MessageCircle size={18} />
                          </span>
                          <span className="messages-list-copy">
                            <strong>{conversation.product_name}</strong>
                            <small className="messages-conversation-kind">
                              {conversation.kind === "produto"
                                ? "Pergunta sobre produto"
                                : conversation.kind === "encomenda"
                                  ? "Sob encomenda"
                                  : "Pedido"}
                            </small>
                            {conversation.kind === "produto" && conversation.my_role === "client" && (
                              <small className="messages-conversation-store">
                                Loja: {conversation.store_name || conversation.artisan_name || "Artenós"}
                              </small>
                            )}
                            <small>
                              {conversation.my_role === "client"
                                ? "Vendedor"
                                : "Cliente"}
                              : {conversation.other_name}
                            </small>
                            <time dateTime={conversation.last_message_at}>
                              {formatDate(conversation.last_message_at)}
                            </time>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="messages-list-section messages-orders">
                <h2>
                  {sellerMode ? "Vendas sem conversa" : "Compras sem conversa"}{" "}
                  <span>{orders.length}</span>
                </h2>
                {orders.length === 0 ? (
                  <p className="messages-empty-list">
                    {sellerMode
                      ? "Nenhuma venda aguardando conversa."
                      : "Nenhuma compra aguardando conversa."}
                  </p>
                ) : (
                  <ul>
                    {orders.map((order) => (
                      <li key={order.id}>
                        <button
                          type="button"
                          onClick={() =>
                            startConversation(order.id, order.product_name)
                          }
                        >
                          <span className="messages-list-icon">
                            <PackageOpen size={18} />
                          </span>
                          <span className="messages-list-copy">
                            <strong>{order.product_name}</strong>
                            <time dateTime={order.created_at}>
                              {formatDate(order.created_at)}
                            </time>
                            <small>Iniciar conversa</small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>

            <section
              className={`messages-chat${current || openError ? "" : " is-empty"}`}
              aria-label="Conversa selecionada"
            >
              {current ? (
                <>
                  <div className="messages-chat-heading">
                    <span className="messages-chat-icon">
                      <MessageCircle size={20} />
                    </span>
                    <div>
                      <small>
                        {current.kind === "produto"
                          ? "Conversa sobre produto"
                          : current.kind === "encomenda"
                            ? "Conversa sobre encomenda"
                            : "Conversa sobre pedido"}
                      </small>
                      <h2>{current.kind === "produto"
                        ? `Conversa com ${sellerMode ? current.other_name : current.store_name || current.artisan_name || "a loja"}`
                        : current.product_name}</h2>
                    </div>
                  </div>
                  {current.kind === "produto" && (
                    <div className="messages-product-context">
                      {current.product_image_url ? (
                        <Image src={current.product_image_url} alt="" width={64} height={64} unoptimized />
                      ) : (
                        <span className="messages-product-image-fallback"><PackageOpen size={22} /></span>
                      )}
                      <div>
                        <small>Produto desta conversa</small>
                        <strong>{current.product_name}</strong>
                        <p>
                          Loja: {!sellerMode && current.artisan_id
                            ? <Link href={`/loja?id=${encodeURIComponent(current.artisan_id)}`}>
                                {current.store_name || current.artisan_name || "Ver loja"}
                              </Link>
                            : current.store_name || current.artisan_name || "Artenós"}
                        </p>
                        {current.artisan_name && <p>Vendedor(a): {current.artisan_name}</p>}
                      </div>
                    </div>
                  )}
                  <div className="messages-topic-filter">
                    <label htmlFor="messages-topic-filter">Ver assunto</label>
                    <select
                      id="messages-topic-filter"
                      value={topicFilter}
                      onChange={(event) => setTopicFilter(event.target.value as MessageTopic | "todos")}
                    >
                      <option value="todos">Todos os assuntos</option>
                      {messageTopics.map((entry) => (
                        <option key={entry.value} value={entry.value}>{entry.label}</option>
                      ))}
                    </select>
                  </div>
                  <div
                    className="messages-thread"
                    role="log"
                    aria-label="Histórico da conversa"
                  >
                    {(topicFilter === "todos" ? messages.length === 0 : !messages.some((message) => message.topic === topicFilter)) && (
                      <div className="messages-empty-chat">
                        <MessageCircle size={36} />
                        <p>
                          {messages.length === 0
                            ? "Nenhuma mensagem ainda. Envie a primeira mensagem sobre este atendimento."
                            : "Nenhuma mensagem neste assunto."}
                        </p>
                      </div>
                    )}
                    {messages.filter((message) => topicFilter === "todos" || message.topic === topicFilter).map((message) => (
                      <div
                        key={message.id}
                        className={
                          message.sender_id === user.id
                            ? "messages-bubble is-own"
                            : "messages-bubble"
                        }
                      >
                        <small className="messages-bubble-topic">{topicLabel(message.topic)}</small>
                        <span>
                          {message.sender_id === user.id
                            ? "Você"
                            : current.other_name || (sellerMode ? "Cliente" : "Loja")}
                        </span>
                        {message.reply_to_id && (
                          <blockquote className="messages-reply-quote">
                            {messages.find((original) => original.id === message.reply_to_id)?.body
                              ?? "Mensagem anterior"}
                          </blockquote>
                        )}
                        <p>{message.body}</p>
                        <div className="messages-bubble-foot">
                          <time dateTime={message.created_at}>{formatDate(message.created_at)}</time>
                          <button type="button" onClick={() => {
                            setReplyTo(message);
                            setTopic(message.topic);
                            document.getElementById("messages-text")?.focus();
                          }}>Responder</button>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <form className="messages-compose" onSubmit={sendMessage}>
                    {replyTo && (
                      <div className="messages-reply-target">
                        <span>Respondendo: {replyTo.body}</span>
                        <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta">Cancelar</button>
                      </div>
                    )}
                    <div className="messages-compose-topic">
                      <label htmlFor="messages-topic">Assunto da mensagem</label>
                      <select id="messages-topic" value={topic}
                        onChange={(event) => {
                          const selected = event.target.value as MessageTopic;
                          setTopic(selected);
                          setSuggestionTopic(selected);
                        }}>
                        {messageTopics.map((entry) => (
                          <option key={entry.value} value={entry.value}>{entry.label}</option>
                        ))}
                      </select>
                      <button type="button" className="messages-suggestions-open"
                        onClick={() => setSuggestionTopic(topic)}>
                        <Sparkles size={15} /> Ver sugestões
                      </button>
                    </div>
                    <div className="messages-compose-row">
                      <label htmlFor="messages-text" className="messages-visually-hidden">Sua mensagem</label>
                      <input id="messages-text" type="text" value={text}
                        onChange={(event) => setText(event.target.value)} maxLength={2000}
                        placeholder="Digite sua mensagem" required />
                      <button type="submit" disabled={sending || !text.trim()} aria-busy={sending}>
                        <Send size={17} /> {sending ? "Enviando…" : "Enviar"}
                      </button>
                    </div>
                  </form>
                </>
              ) : openError ? (
                <div className="messages-open-error" role="alert">
                  <MessageCircle size={40} />
                  <h2>Não foi possível abrir a conversa desta peça</h2>
                  <p>{openError}</p>
                  {openError.includes("própria loja") && (
                    <p>Para testar o contato com a loja, entre com uma conta de cliente diferente da conta vendedora.</p>
                  )}
                  <Link href="/categorias">Voltar aos produtos</Link>
                </div>
              ) : (
                <div className="messages-placeholder">
                  <MessageCircle size={42} />
                  <h2>Selecione uma conversa</h2>
                  <p>
                    Escolha uma conversa existente ou abra uma a partir de um produto,
                    pedido ou encomenda.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {suggestionTopic && current && (
        <div className="messages-suggestions-backdrop">
          <section className="messages-suggestions-modal" role="dialog" aria-modal="true"
            aria-labelledby="messages-suggestions-title">
            <div className="messages-suggestions-heading">
              <div>
                <small>ESCOLHA UMA MENSAGEM</small>
                <h2 id="messages-suggestions-title">{topicLabel(suggestionTopic)}</h2>
                <p>Toque em uma sugestão para preencher o campo. Você poderá editar antes de enviar.</p>
              </div>
              <button ref={suggestionCloseRef} type="button" onClick={() => setSuggestionTopic(null)}
                aria-label="Fechar sugestões"><X size={18} /></button>
            </div>
            <div className="messages-suggestions-list">
              {getMessageSuggestions(
                suggestionTopic,
                `“${current.product_name}”`,
                current.my_role,
              ).map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => selectSuggestion(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {!sellerMode && (
        <CustomerFooter
          userSignedIn={!!user}
          authLoading={status === "Carregando..."}
        />
      )}
    </div>
  );
}
