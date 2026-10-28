"use client";

import { MessagesWorkspace } from "@/components/messages-workspace";
import { StandaloneCustomerHeader } from "@/components/standalone-customer-header";
import { Suspense } from "react";
import "../storefront.css";
import "./messages.css";

export default function MensagensPage() {
  return <Suspense fallback={<><StandaloneCustomerHeader /><main className="store-container messages-main">Carregando mensagens...</main></>}>
    <MessagesWorkspace />
  </Suspense>;
}
