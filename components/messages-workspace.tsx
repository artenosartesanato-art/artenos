"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  MessageCircle,
  PackageOpen,
  Send,
} from "@/components/icons";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { CustomerFooter } from "@/components/customer-footer";
import { getSupabase } from "@/lib/supabase";

type Order = { id: string; product_name: string; created_at: string };
type Conversation = {
  conversation_id: string;
  order_id: string | null;
  product_name: string;
  other_name: string;
  my_role: "client" | "artisan";
  last_message_at: string;
};
type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};
type Current = { id: string; title: string };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

export function MessagesWorkspace({
  sellerMode = false,
}: {
  sellerMode?: boolean;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState("Carregando...");
  const [orders, setOrders] = useState<Order[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      const [ordersRes, listRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, product_name, created_at")
          .eq(sellerMode ? "artisan_id" : "client_id", currentUser.id)
          .order("created_at", { ascending: false }),
        supabase.rpc("list_my_conversations"),
      ]);

      if (ordersRes.error)
        return setStatus(
          "Erro ao carregar pedidos: " + ordersRes.error.message,
        );
      if (listRes.error)
        return setStatus(
          "Erro ao carregar conversas: " + listRes.error.message,
        );

      const expectedRole: Conversation["my_role"] = sellerMode
        ? "artisan"
        : "client";
      const roleConversations = ((listRes.data ?? []) as Conversation[]).filter(
        (conversation) => conversation.my_role === expectedRole,
      );
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

      const requestedConversation = new URLSearchParams(
        window.location.search,
      ).get("conversa");
      const requested = roleConversations.find(
        (conversation) =>
          conversation.conversation_id === requestedConversation,
      );
      if (requested)
        setCurrent({
          id: requested.conversation_id,
          title: requested.product_name,
        });
    },
    [sellerMode],
  );

  useEffect(() => {
    async function init() {
      let supabase: ReturnType<typeof getSupabase>;
      try {
        supabase = getSupabase();
      } catch {
        setStatus("Configure a conexão com o Supabase para acessar mensagens.");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setStatus(
          "Você precisa estar logado. Faça login e volte para esta página.",
        );
        return;
      }

      setUser(data.session.user);
      setStatus("Logado como " + data.session.user.email);
      await refreshAll(data.session.user);
    }

    void init();
  }, [refreshAll]);

  useEffect(() => {
    if (!current) return;
    const supabase = getSupabase();
    let active = true;

    async function loadMessages(conversationId: string) {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!active) return;
      if (error)
        return setStatus("Erro ao carregar mensagens: " + error.message);

      const loaded = (data ?? []) as Message[];
      setMessages((previous) => {
        const ids = new Set(loaded.map((message) => message.id));
        return [
          ...loaded,
          ...previous.filter((message) => !ids.has(message.id)),
        ];
      });
    }

    setMessages([]);
    void loadMessages(current.id);

    const channel = supabase
      .channel("chat-" + current.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${current.id}`,
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

  async function startConversation(orderId: string, title: string) {
    if (!user) return;
    const supabase = getSupabase();
    const { data: conversationId, error } = await supabase.rpc(
      "start_conversation",
      { p_order_id: orderId },
    );
    if (error) return setStatus("Erro ao iniciar conversa: " + error.message);
    await refreshAll(user);
    setCurrent({ id: conversationId as string, title });
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = text.trim();
    if (!body || !current || !user) return;
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: current.id, sender_id: user.id, body })
      .select("id, sender_id, body, created_at")
      .single();

    if (error) return setStatus("Erro ao enviar: " + error.message);
    setText("");
    addMessage(data as Message);
  }

  return (
    <div
      className={
        sellerMode
          ? "messages-workspace messages-workspace-seller"
          : "store-page messages-page"
      }
    >
      {!sellerMode && (
        <header className="messages-header">
          <div className="store-container messages-header-inner">
            <Link href="/" className="store-logo" aria-label="Artenós, início">
              <BrandLogo priority />
            </Link>
            <Link href="/" className="messages-back">
              <ArrowLeft size={17} /> Voltar à loja
            </Link>
          </div>
        </header>
      )}

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
              ? "Converse com clientes e acompanhe as conversas dos seus pedidos."
              : "Converse sobre os pedidos e acompanhe o histórico em um só lugar."}
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
            <Link href="/acesso">Entrar ou cadastrar</Link>
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
                            current?.id === conversation.conversation_id
                              ? "is-active"
                              : ""
                          }
                          onClick={() =>
                            setCurrent({
                              id: conversation.conversation_id,
                              title: conversation.product_name,
                            })
                          }
                        >
                          <span className="messages-list-icon">
                            <MessageCircle size={18} />
                          </span>
                          <span className="messages-list-copy">
                            <strong>{conversation.product_name}</strong>
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
              className="messages-chat"
              aria-label="Conversa selecionada"
            >
              {current ? (
                <>
                  <div className="messages-chat-heading">
                    <span className="messages-chat-icon">
                      <MessageCircle size={20} />
                    </span>
                    <div>
                      <small>Conversa sobre pedido ou encomenda</small>
                      <h2>{current.title}</h2>
                    </div>
                  </div>
                  <div
                    className="messages-thread"
                    role="log"
                    aria-label="Histórico da conversa"
                  >
                    {messages.length === 0 && (
                      <div className="messages-empty-chat">
                        <MessageCircle size={36} />
                        <p>
                          Nenhuma mensagem ainda. Envie a primeira mensagem
                          sobre este atendimento.
                        </p>
                      </div>
                    )}
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={
                          message.sender_id === user.id
                            ? "messages-bubble is-own"
                            : "messages-bubble"
                        }
                      >
                        <span>
                          {message.sender_id === user.id
                            ? "Você"
                            : "Outra pessoa"}
                        </span>
                        <p>{message.body}</p>
                        <time dateTime={message.created_at}>
                          {formatDate(message.created_at)}
                        </time>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <form className="messages-compose" onSubmit={sendMessage}>
                    <label
                      htmlFor="messages-text"
                      className="messages-visually-hidden"
                    >
                      Sua mensagem
                    </label>
                    <input
                      id="messages-text"
                      type="text"
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      maxLength={2000}
                      placeholder="Digite sua mensagem"
                      required
                    />
                    <button type="submit">
                      <Send size={17} /> Enviar
                    </button>
                  </form>
                </>
              ) : (
                <div className="messages-placeholder">
                  <MessageCircle size={42} />
                  <h2>Selecione uma conversa</h2>
                  <p>
                    Escolha uma conversa existente ou abra uma pelo pedido ou
                    pela encomenda.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {!sellerMode && (
        <CustomerFooter
          userSignedIn={!!user}
          authLoading={status === "Carregando..."}
        />
      )}
    </div>
  );
}
