"use client";

import { ArrowRight, LoaderCircle, MapPin, Search, Sparkles, Store } from "@/components/icons";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CustomerFooter } from "@/components/customer-footer";
import { StandaloneCustomerHeader } from "@/components/standalone-customer-header";
import { getSupabase } from "@/lib/supabase";
import "../storefront.css";
import "./shops.css";

type Shop = { id: string; store_name: string; specialty: string | null; story: string | null; city: string | null; state: string | null };

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void getSupabase().rpc("list_storefront_shops", { p_limit: 100 }).then(({ data, error: loadError }) => {
      if (loadError) setError("Não foi possível carregar as lojas agora.");
      else setShops((data || []) as Shop[]);
      setLoading(false);
    });
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return shops;
    return shops.filter((shop) => [shop.store_name, shop.specialty, shop.city, shop.state].filter(Boolean).some((value) => value!.toLocaleLowerCase("pt-BR").includes(term)));
  }, [query, shops]);

  return <div className="store-page shops-page">
    <StandaloneCustomerHeader />
    <main className="store-container shops-main">
      <header><p className="store-eyebrow">QUEM FAZ A ARTENÓS</p><h1>Lojas e artesãs</h1><p>Conheça as lojas aprovadas, suas técnicas e as histórias por trás de cada peça.</p></header>
      <label className="shops-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar loja, técnica ou cidade" /></label>
      {loading ? <div className="shops-state"><LoaderCircle className="cart-spin" size={30} /> Carregando lojas...</div>
        : error ? <div className="shops-state"><Store size={35} /><p>{error}</p></div>
        : visible.length ? <section className="shops-grid">{visible.map((shop) => <Link href={`/loja?id=${encodeURIComponent(shop.id)}`} key={shop.id}><span><Sparkles size={24} /></span><small>{shop.specialty || "Artesanato autoral"}</small><h2>{shop.store_name}</h2><p>{shop.story || "Conheça as peças e o trabalho desta loja."}</p><em><MapPin size={14} /> {[shop.city, shop.state].filter(Boolean).join(" · ") || "Localização não informada"}</em><strong>Visitar loja <ArrowRight size={16} /></strong></Link>)}</section>
        : <div className="shops-state"><Store size={35} /><h2>Nenhuma loja encontrada</h2><p>Tente pesquisar por outro nome, técnica ou cidade.</p></div>}
    </main>
    <CustomerFooter userSignedIn={false} authLoading={false} />
  </div>;
}
