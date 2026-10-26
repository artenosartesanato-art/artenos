"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CustomerHeader } from "@/components/customer-header";
import { getSupabase } from "@/lib/supabase";

type CepStatus = "loading" | "guest" | "account" | "error";

export function StandaloneCustomerHeader() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [cep, setCep] = useState("");
  const [cepStatus, setCepStatus] = useState<CepStatus>("loading");
  const [cepError, setCepError] = useState("");
  const [cepOpen, setCepOpen] = useState(false);
  const [cepInput, setCepInput] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    let request = 0;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = ++request;
      const user = session?.user;
      setSignedIn(!!user);
      setCep("");
      setCepError("");
      setCepOpen(false);
      setCepStatus("loading");
      window.setTimeout(async () => {
        if (!active || current !== request) return;
        if (!user) {
          setCep(localStorage.getItem("artenos_guest_cep") || "");
          setCepStatus("guest");
          return;
        }
        const { data: profile, error } = await supabase.from("profiles")
          .select("cep").eq("id", user.id).maybeSingle();
        if (!active || current !== request) return;
        const value = profile?.cep?.replace(/\D/g, "") || "";
        if (error || value.length !== 8) {
          setCepStatus("error");
          setCepError("Não foi possível consultar o CEP do seu cadastro.");
        } else {
          setCep(value);
          setCepStatus("account");
        }
      }, 0);
    });
    return () => { active = false; request++; listener.subscription.unsubscribe(); };
  }, []);

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchInput.trim().slice(0, 100);
    router.push(query ? `/?busca=${encodeURIComponent(query)}` : "/categorias");
  }

  async function saveCep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = cepInput.replace(/\D/g, "");
    if (digits.length !== 8) return toast.error("Digite um CEP com 8 números.");
    localStorage.setItem("artenos_guest_cep", digits);
    setCep(digits);
    setCepOpen(false);
    toast.success("CEP atualizado.");
  }

  return <CustomerHeader userSignedIn={signedIn} cep={cep} cepStatus={cepStatus} cepError={cepError} cepOpen={cepOpen} cepInput={cepInput} searchInput={searchInput} onSearchInput={setSearchInput} onSearch={search} onToggleCep={() => setCepOpen((value) => !value)} onCepInput={setCepInput} onSaveCep={saveCep} />;
}
