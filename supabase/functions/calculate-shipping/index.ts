import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type ShippingPackage = {
  artisan_id: string;
  store_name: string;
  origin_cep: string;
  destination_cep: string;
  cart_signature: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  weight_grams: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  package_count: number | null;
  production_time_days: number | null;
};

type MelhorEnvioService = {
  id?: number;
  name?: string;
  custom_price?: string;
  price?: string;
  custom_delivery_time?: number;
  delivery_time?: number;
  custom_delivery_range?: { min?: number; max?: number };
  delivery_range?: { min?: number; max?: number };
  company?: { name?: string };
  error?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function configuredKey(jsonName: string, legacyName: string) {
  const values = Deno.env.get(jsonName);
  if (values) return JSON.parse(values).default as string;
  return Deno.env.get(legacyName) ?? "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      return json({ error: "Faça login para calcular o frete." }, 401);
    }

    const { destinationCep: rawDestinationCep } = await request.json();
    const destinationCep = digits(rawDestinationCep);
    if (!/^\d{8}$/.test(destinationCep)) {
      return json({ error: "Informe um CEP de destino válido." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const publicKey = configuredKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secretKey = configuredKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const melhorEnvioToken = Deno.env.get("MELHOR_ENVIO_TOKEN") ?? "";
    if (!supabaseUrl || !publicKey || !secretKey || !melhorEnvioToken) {
      return json({ error: "A integração de frete ainda não foi configurada no servidor." }, 503);
    }

    const userClient = createClient(supabaseUrl, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice("Bearer ".length);
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: "Sua sessão expirou. Entre novamente." }, 401);
    }

    const { data, error } = await userClient.rpc("get_cart_shipping_packages", {
      p_destination_cep: destinationCep,
    });
    if (error) throw new Error(error.message);
    const packages = (data ?? []) as ShippingPackage[];
    if (packages.length === 0) {
      return json({ error: "O carrinho está vazio ou possui produtos indisponíveis." }, 400);
    }

    const grouped = new Map<string, ShippingPackage[]>();
    for (const item of packages) {
      grouped.set(item.artisan_id, [...(grouped.get(item.artisan_id) ?? []), item]);
    }

    const apiBase = (Deno.env.get("MELHOR_ENVIO_API_URL") ?? "https://sandbox.melhorenvio.com.br").replace(/\/$/, "");
    const userAgent = Deno.env.get("MELHOR_ENVIO_USER_AGENT") ?? "Artenos (artenos.artesanato@gmail.com)";
    const admin = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const results = [];
    for (const [artisanId, items] of grouped) {
      const reference = items[0];
      const incomplete = items.find(
        (item) =>
          !/^\d{8}$/.test(digits(item.origin_cep)) ||
          !item.weight_grams ||
          !item.height_cm ||
          !item.width_cm ||
          !item.length_cm ||
          !item.package_count ||
          item.production_time_days == null,
      );
      if (incomplete) {
        results.push({
          artisanId,
          storeName: reference.store_name,
          error: `A loja precisa completar os dados de envio de ${incomplete.product_name}.`,
          options: [],
        });
        continue;
      }

      const volumes = items.flatMap((item) => {
        const count = Math.max(1, Number(item.package_count));
        return Array.from({ length: item.quantity * count }, () => ({
          width: Number(item.width_cm),
          height: Number(item.height_cm),
          length: Number(item.length_cm),
          weight: Math.max(0.001, Number((Number(item.weight_grams) / 1000 / count).toFixed(3))),
          insurance: Number((Number(item.unit_price) / count).toFixed(2)),
        }));
      });

      const providerResponse = await fetch(`${apiBase}/api/v2/me/shipment/calculate`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${melhorEnvioToken}`,
          "Content-Type": "application/json",
          "User-Agent": userAgent,
        },
        body: JSON.stringify({
          from: { postal_code: digits(reference.origin_cep) },
          to: { postal_code: destinationCep },
          volumes,
          options: { receipt: false, own_hand: false },
        }),
        signal: AbortSignal.timeout(20000),
      });
      const providerBody = (await providerResponse.json()) as MelhorEnvioService[] | { message?: string };
      if (!providerResponse.ok || !Array.isArray(providerBody)) {
        const message = Array.isArray(providerBody) ? "" : providerBody.message;
        results.push({
          artisanId,
          storeName: reference.store_name,
          error: message || "A transportadora não conseguiu calcular o frete desta loja.",
          options: [],
        });
        continue;
      }

      const productionDays = Math.max(...items.map((item) => Number(item.production_time_days ?? 0)));
      const validServices = providerBody.flatMap((service) => {
        const price = Number(service.custom_price ?? service.price);
        const serviceId = Number(service.id);
        const min = Number(
          service.custom_delivery_range?.min ?? service.delivery_range?.min ??
            service.custom_delivery_time ?? service.delivery_time,
        );
        const max = Number(
          service.custom_delivery_range?.max ?? service.delivery_range?.max ??
            service.custom_delivery_time ?? service.delivery_time,
        );
        if (service.error || !Number.isFinite(price) || price < 0 || !Number.isInteger(serviceId) || !Number.isFinite(min) || !Number.isFinite(max)) return [];
        const carrierMin = Math.max(0, Math.trunc(min));
        const carrierMax = Math.max(carrierMin, Math.trunc(max));
        return [{
          client_id: userData.user.id,
          artisan_id: artisanId,
          provider: "melhor_envio",
          destination_cep: destinationCep,
          cart_signature: reference.cart_signature,
          service_id: serviceId,
          service_name: String(service.name ?? "Serviço de entrega").slice(0, 120),
          company_name: String(service.company?.name ?? "Transportadora").slice(0, 120),
          price: Number(price.toFixed(2)),
          carrier_delivery_min_days: carrierMin,
          carrier_delivery_max_days: carrierMax,
          production_time_days: productionDays,
          total_delivery_min_days: carrierMin + productionDays,
          total_delivery_max_days: carrierMax + productionDays,
        }];
      });

      if (validServices.length === 0) {
        results.push({
          artisanId,
          storeName: reference.store_name,
          error: "Nenhuma transportadora atende esta rota com os volumes informados.",
          options: [],
        });
        continue;
      }

      await admin.from("cart_shipping_selections").delete()
        .eq("client_id", userData.user.id).eq("artisan_id", artisanId);
      const { data: savedQuotes, error: saveError } = await admin
        .from("shipping_quotes")
        .insert(validServices)
        .select("id,service_id,service_name,company_name,price,carrier_delivery_min_days,carrier_delivery_max_days,production_time_days,total_delivery_min_days,total_delivery_max_days,expires_at")
        .order("price", { ascending: true });
      if (saveError) throw new Error("Não foi possível salvar as opções de frete.");

      results.push({
        artisanId,
        storeName: reference.store_name,
        originCep: digits(reference.origin_cep),
        options: (savedQuotes ?? []).map((quote) => ({
          id: quote.id,
          serviceId: quote.service_id,
          serviceName: quote.service_name,
          companyName: quote.company_name,
          price: Number(quote.price),
          carrierMinDays: quote.carrier_delivery_min_days,
          carrierMaxDays: quote.carrier_delivery_max_days,
          productionDays: quote.production_time_days,
          totalMinDays: quote.total_delivery_min_days,
          totalMaxDays: quote.total_delivery_max_days,
          expiresAt: quote.expires_at,
        })),
      });
    }

    return json({ groups: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível calcular o frete.";
    return json({ error: message }, 500);
  }
});
