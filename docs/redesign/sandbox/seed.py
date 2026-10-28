# Seed do sandbox local: usuários pelo Auth Admin local, imagens no Storage local e dados de vitrine.
import json, os, random, subprocess, urllib.request, uuid
API = "http://127.0.0.1:54321"
SRK = os.environ["SRK"]  # chave service_role do Supabase LOCAL de desenvolvimento
H = {"apikey": SRK, "Authorization": f"Bearer {SRK}"}
def req(method, path, body=None, headers=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(API + path, data=data, method=method, headers={**H, "Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(r) as resp: return json.loads(resp.read() or "null")
    except urllib.error.HTTPError as e: raise SystemExit(f"{method} {path}: {e.code} {e.read()[:300]}")
def sql(q):
    out = subprocess.run(["psql", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt", "-c", q],
        env={**os.environ, "PGPASSWORD": "postgres"}, capture_output=True, text=True)
    if out.returncode: raise SystemExit(out.stderr)
    return out.stdout.strip()
def cpf(seed):
    random.seed(seed); n = [random.randint(0, 9) for _ in range(9)]
    for k in (10, 11):
        s = sum(v * (k - i) for i, v in enumerate(n)); d = (s * 10) % 11 % 10; n.append(d)
    return "".join(map(str, n))
PASSWORD = "Artenos@2026"
users = [
  ("cliente@sandbox.artenos.test", "client", "Marina Albuquerque Santos", None, None, None, "01310100", "Avenida Paulista", "1000", "São Paulo", "SP"),
  ("barro@sandbox.artenos.test", "artisan", "Joana Ribeiro", "Ateliê Fio de Barro", "Cerâmica",
   "Comecei a modelar argila na cozinha de casa, em 2014, com o barro do quintal da minha avó. Hoje cada peça passa por torno, secagem lenta e queima em forno a lenha.", "30130010", "Rua da Bahia", "45", "Belo Horizonte", "MG"),
  ("linha@sandbox.artenos.test", "artisan", "Cláudia Moreira", "Linha & Afeto Crochê Autoral de Cora Coralina da Serra da Mantiqueira", "Crochê e tricô",
   "Aprendi crochê com minha mãe e transformei o hábito das tardes em ofício. Trabalho com fios de algodão cru e tingimento natural feito em pequenos lotes.", "37540000", "Rua Coronel Antônio", "12", "Gonçalves", "MG"),
  ("sementes@sandbox.artenos.test", "artisan", "Raimunda Costa", "Sementes do Norte", "Joias e acessórios",
   "Colares e brincos com sementes coletadas de forma responsável na região do Tapajós, em parceria com outras artesãs da comunidade.", "68005000", "Travessa dos Mártires", "300", "Santarém", "PA"),
  ("pendente@sandbox.artenos.test", "artisan", "Helena Prado", "Papel & Ponto", "Papelaria",
   "Encadernação manual com papéis reciclados e costura copta. Cada caderno leva cerca de dois dias para ficar pronto.", "80010000", "Rua XV de Novembro", "700", "Curitiba", "PR"),
  ("admin@sandbox.artenos.test", "client", "Administração Artenós", None, None, None, "01310100", "Avenida Paulista", "1", "São Paulo", "SP"),
]
ids = {}
for i, (email, kind, name, store, spec, story, cep, addr, num, city, uf) in enumerate(users):
    existing = sql(f"select id from auth.users where email = '{email}'")
    if existing: ids[email] = existing; continue
    meta = {"account_type": kind, "registration_mode": "standard", "full_name": name, "document": cpf(i + 11),
            "phone": f"1199{i}12345{i}"[:11], "cep": cep, "address": addr, "address_number": num, "city": city,
            "state": uf, "store_name": store, "specialty": spec, "story": story, "terms_accepted_at": "2026-10-01T12:00:00Z"}
    u = req("POST", "/auth/v1/admin/users", {"email": email, "password": PASSWORD, "email_confirm": True, "user_metadata": meta})
    ids[email] = u["id"]
sql("alter table public.profiles disable trigger user")
for email in ["barro@sandbox.artenos.test", "linha@sandbox.artenos.test", "sementes@sandbox.artenos.test"]:
    sql(f"update public.profiles set approval_status = 'active' where id = '{ids[email]}'")
sql("alter table public.profiles enable trigger user")
sql(f"insert into public.admin_users(user_id, role, active) values ('{ids['admin@sandbox.artenos.test']}', 'owner', true) on conflict do nothing")
# imagens
urls = {}
for f in sorted(os.listdir("img")):
    path = f"{ids['barro@sandbox.artenos.test']}/sandbox/{f}"
    with open(f"img/{f}", "rb") as fh:
        r = urllib.request.Request(f"{API}/storage/v1/object/artenos-store-assets/{path}", data=fh.read(), method="POST",
            headers={**H, "Content-Type": "image/jpeg", "x-upsert": "true"})
        urllib.request.urlopen(r).read()
    urls[f[:-4]] = f"{API}/storage/v1/object/public/artenos-store-assets/{path}"
cats = [("Cerâmica", "ceramica", "tigela-areia"), ("Crochê e tricô", "croche-e-trico", "sousplat-croche"), ("Cestaria", "cestaria", "cesto-fibra"),
        ("Joias e acessórios", "joias-e-acessorios", "colar-sementes"), ("Cosméticos naturais", "cosmeticos-naturais", "sabonetes-naturais"),
        ("Papelaria", "papelaria", "caderno-artesanal")]
for k, (n, s, im) in enumerate(cats):
    sql(f"insert into public.storefront_categories(name, slug, image_url, sort_order, active) values ('{n}', '{s}', '{urls[im]}', {k}, true) on conflict (slug) do nothing")
cat = dict((s, sql(f"select id from public.storefront_categories where slug = '{s}'")) for _, s, _ in cats)
sql("insert into public.storefront_collections(title, description, image_url, sort_order, active) select 'Mesa posta com afeto', 'Tigelas, sousplats e peças para receber bem.', '" + urls["tigela-esmaltada"] + "', 0, true where not exists (select 1 from public.storefront_collections)")
sql("insert into public.storefront_collections(title, description, image_url, sort_order, active) select 'Presentes feitos à mão', null, '" + urls["colar-ceramica"] + "', 1, true where (select count(*) from public.storefront_collections) < 2")
coll = sql("select id from public.storefront_collections order by sort_order limit 1")
B, L, S = ids["barro@sandbox.artenos.test"], ids["linha@sandbox.artenos.test"], ids["sementes@sandbox.artenos.test"]
products = [
  (B, "Vaso de terracota torneado à mão", "Vaso modelado no torno com argila local e queimado em forno a lenha. Acabamento sem esmalte por fora e impermeabilizado por dentro.\n\nCada peça tem variações sutis de cor e textura.", 189.90, "ceramica", "vaso-terracota", 4, True, True, 0),
  (B, "Vaso musgo", "Esmalte em tons de verde musgo, aplicado à mão.", 149.00, "ceramica", "vaso-musgo", 1, True, False, 0),
  (B, "Tigela esmaltada azul-petróleo para servir saladas e massas em família", "Tigela grande, ideal para mesa posta. Pode ir à lava-louças.", 129.50, "ceramica", "tigela-esmaltada", 0, True, True, 0),
  (B, "Tigela areia", None, 79.00, "ceramica", "tigela-areia", None, False, False, 12),
  (L, "Sousplat de crochê em algodão cru (jogo com 4)", "Jogo com quatro sousplats de 38 cm, feitos em algodão cru com tingimento natural de casca de cebola.", 220.00, "croche-e-trico", "sousplat-croche", 3, True, True, 0),
  (L, "Tapete de crochê redondo", "Tapete de 1,2 m de diâmetro. Produzido sob encomenda na cor escolhida.", 480.00, "croche-e-trico", "tapete-croche", None, False, False, 20),
  (L, "Cesto de fibra natural", "Cesto trançado à mão com fibra de taboa.", 98.00, "cestaria", "cesto-fibra", 6, True, False, 0),
  (L, "Mini cesto", "Para organizar pequenos objetos.", 39.90, "cestaria", "cesto-mini", 15, True, False, 0),
  (S, "Colar de sementes de açaí e jarina", "Colar longo com sementes coletadas de forma responsável.", 68.00, "joias-e-acessorios", "colar-sementes", 8, True, True, 0),
  (S, "Colar com contas de cerâmica", "Contas modeladas e pintadas uma a uma.", 92.00, "joias-e-acessorios", "colar-ceramica", 2, True, False, 0),
  (S, "Kit de sabonetes naturais", "Três sabonetes de óleos vegetais e argilas brasileiras.", 54.90, "cosmeticos-naturais", "sabonetes-naturais", 20, True, False, 0),
  (S, "Sabonete de argila rosa", None, 19.90, "cosmeticos-naturais", "sabonete-argila", 30, True, False, 0),
  (B, "Caderno artesanal costurado", "Capa em tecido de algodão e miolo em papel reciclado 120 g.", 64.00, "papelaria", None, 5, True, False, 0),
]
if sql("select count(*) from public.products") == "0":
    for k, (art, name, desc, price, c, img, stock, ready, feat, prod_days) in enumerate(products):
        d = "null" if desc is None else "$$" + desc + "$$"
        im = "null" if img is None else f"'{urls[img]}'"
        st = "null" if stock is None else str(stock)
        sql(f"""insert into public.products(artisan_id, name, description, price, category_id, collection_id, image_url, stock, ready_to_ship, featured, active,
          shipping_weight_grams, shipping_height_cm, shipping_width_cm, shipping_length_cm, shipping_package_count, production_time_days, created_at)
          values ('{art}', $${name}$$, {d}, {price}, '{cat[c]}', {f"'{coll}'" if c == 'ceramica' else 'null'}, {im}, {st}, {ready}, {feat}, true,
          {800 + k * 50}, 20, 18, 18, 1, {prod_days}, now() - interval '{k} hours')""")
    sql(f"insert into public.artisan_store_settings(artisan_id, announcement, production_time_days, accepts_custom_orders, vacation_mode, cover_path) values ('{B}', 'Novas peças saem do forno toda primeira semana do mês.', 10, true, false, '{B}/sandbox/capa-loja-1.jpg'), ('{L}', null, 20, true, false, '{B}/sandbox/capa-loja-2.jpg'), ('{S}', null, 5, false, false, null) on conflict do nothing")
    sql(f"insert into public.custom_order_services(artisan_id, title, description, image_url, starting_price, min_production_days, max_production_days, category_id) values ('{B}', 'Jogo de pratos personalizado', 'Pratos com esmalte e iniciais à sua escolha.', '{urls['tigela-areia']}', 320, 20, 35, '{cat['ceramica']}'), ('{L}', 'Tapete de crochê sob medida', 'Escolha cores, formato e tamanho.', '{urls['tapete-croche']}', 350, 15, 30, '{cat['croche-e-trico']}')")
    sql("update public.artisan_store_settings set shipping_origin_cep = p.cep from public.profiles p where p.id = artisan_store_settings.artisan_id")
# pedidos do cliente
C = ids["cliente@sandbox.artenos.test"]
if sql("select count(*) from public.orders") == "0":
    for status, art, pname, price, days in [("shipped", B, "Vaso musgo", 149.00, 3), ("delivered", L, "Cesto de fibra natural", 98.00, 12), ("payment_confirmed", S, "Kit de sabonetes naturais", 54.90, 0)]:
        oid = sql(f"""insert into public.orders(client_id, artisan_id, product_name, status, payment_status, subtotal, shipping_amount, total_amount,
          platform_fee_percent, platform_fee_amount, artisan_net_amount, recipient_name, shipping_cep, shipping_address, shipping_number, shipping_city, shipping_state,
          carrier, tracking_code, estimated_delivery_date, created_at, shipped_at, delivered_at)
          values ('{C}', '{art}', '{pname}', '{status}', 'paid', {price}, 24.90, {price + 24.90}, 12, {round(price * .12, 2)}, {round(price * .88 + 24.90, 2)},
          'Marina Albuquerque Santos', '01310100', 'Avenida Paulista', '1000', 'São Paulo', 'SP', 'Correios - PAC',
          {"'BR123456789BR'" if status != 'payment_confirmed' else 'null'}, current_date + 5, now() - interval '{days} days',
          {"now() - interval '1 day'" if status in ('shipped', 'delivered') else 'null'}, {"now()" if status == 'delivered' else 'null'}) returning id""").splitlines()[0]
        sql(f"insert into public.order_items(order_id, product_id, product_name, image_url, quantity, unit_price, subtotal) select '{oid}', id, name, image_url, 1, price, price from public.products where name = $${pname}$$")
        sql(f"insert into public.order_status_history(order_id, status, description, created_at) values ('{oid}', 'payment_confirmed', 'Pagamento confirmado pelo Mercado Pago.', now() - interval '{days} days')")
        if status in ("shipped", "delivered"):
            sql(f"insert into public.order_status_history(order_id, status, description, created_at) values ('{oid}', 'shipped', 'Pedido postado nos Correios.', now() - interval '1 day')")
        if status == "delivered":
            sql(f"insert into public.order_status_history(order_id, status, description) values ('{oid}', 'delivered', 'Entrega confirmada.')")
        sql(f"insert into public.conversations(order_id, client_id, artisan_id) values ('{oid}', '{C}', '{art}') on conflict do nothing")
    conv = sql(f"select id from public.conversations where artisan_id = '{B}' limit 1")
    sql(f"insert into public.messages(conversation_id, sender_id, body) values ('{conv}', '{C}', 'Olá! O vaso já foi postado?'), ('{conv}', '{B}', 'Oi, Marina! Postei ontem, o código de rastreio já está no pedido.')")
print(json.dumps(ids, indent=1))
