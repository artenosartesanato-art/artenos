"use client";

import { MessagesWorkspace } from "@/components/messages-workspace";
import { Suspense } from "react";
import "../storefront.css";
import "./messages.css";

export default function MensagensPage() {
  return <Suspense fallback={<><main className="store-container messages-main">Carregando mensagens...</main></>}>
    <MessagesWorkspace />
  </Suspense>;
}
