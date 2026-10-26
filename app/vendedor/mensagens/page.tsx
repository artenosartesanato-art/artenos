"use client";

import { MessagesWorkspace } from "@/components/messages-workspace";
import { Suspense } from "react";
import "../../mensagens/messages.css";

export default function SellerMessagesPage() {
  return <Suspense fallback={<main className="messages-main messages-main-seller">Carregando mensagens...</main>}>
    <MessagesWorkspace sellerMode />
  </Suspense>;
}
