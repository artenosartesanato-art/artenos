"use client";

import { MessagesWorkspace } from "@/components/messages-workspace";
import { Suspense } from "react";
import "../../mensagens/messages.css";

export default function SellerMessagesPage() {
  return <Suspense fallback={<div className="messages-main messages-main-seller">Carregando mensagens...</div>}>
    <MessagesWorkspace sellerMode />
  </Suspense>;
}
