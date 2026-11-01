import { test } from "node:test";
import assert from "node:assert/strict";
import {
  freshUnread, readOnVisit, titleWithCount, unreadByRef, unreadTotal, upsertNotification, type AppNotification,
} from "../../lib/notifications.ts";

const item = (overrides: Partial<AppNotification>): AppNotification => ({
  id: "n", kind: "mensagem", title: "t", body: "", link: "/mensagens?conversa=c1", ref_id: "c1",
  unread_count: 1, created_at: "2026-10-28T10:00:00Z", read_at: null, ...overrides,
});

test("contador soma agrupamentos não lidos e ignora lidos", () => {
  assert.equal(unreadTotal([
    item({ id: "1", unread_count: 3 }),
    item({ id: "2", kind: "pedido", unread_count: 1 }),
    item({ id: "3", read_at: "2026-10-28T11:00:00Z", unread_count: 5 }),
  ]), 4);
});

test("título da aba com contador, sem acumular prefixos", () => {
  assert.equal(titleWithCount("Artenós", 3), "(3) Artenós");
  assert.equal(titleWithCount("(3) Artenós", 120), "(99+) Artenós");
  assert.equal(titleWithCount("(99+) Artenós", 0), "Artenós");
});

test("agrupamento atualizado sobe para o topo sem duplicar", () => {
  const list = [item({ id: "a", created_at: "2026-10-28T10:00:00Z" }), item({ id: "b", created_at: "2026-10-28T09:00:00Z" })];
  const next = upsertNotification(list, item({ id: "b", created_at: "2026-10-28T12:00:00Z", unread_count: 2 }));
  assert.deepEqual(next.map((entry) => entry.id), ["b", "a"]);
  assert.equal(next[0].unread_count, 2);
});

test("abrir a página do aviso marca como lido, exceto mensagens", () => {
  const ids = readOnVisit([
    item({ id: "pedido", kind: "pedido", link: "/pedidos" }),
    item({ id: "msg", kind: "mensagem", link: "/mensagens?conversa=c1" }),
    item({ id: "venda", kind: "venda", link: "/vendedor/vendas" }),
  ], "/pedidos");
  assert.deepEqual(ids, ["pedido"]);
});

test("não lidas por conversa", () => {
  const map = unreadByRef([item({ id: "1", ref_id: "c1", unread_count: 2 }), item({ id: "2", ref_id: "c2", read_at: "x" })]);
  assert.equal(map.get("c1"), 2);
  assert.equal(map.has("c2"), false);
});

test("consulta de segurança: só avisos novos ou com mais mensagens", () => {
  const base = { kind: "mensagem" as const, title: "t", body: "b", link: "/x", ref_id: "c1", read_at: null };
  const old = [{ ...base, id: "a", unread_count: 1, created_at: "2026-10-28T10:00:00Z" },
    { ...base, id: "b", unread_count: 1, created_at: "2026-10-28T09:00:00Z" }];
  const next = [
    { ...base, id: "a", unread_count: 2, created_at: "2026-10-28T10:05:00Z" },
    { ...base, id: "b", unread_count: 1, created_at: "2026-10-28T09:00:00Z" },
    { ...base, id: "c", unread_count: 1, created_at: "2026-10-28T10:06:00Z" },
    { ...base, id: "d", unread_count: 1, created_at: "2026-10-28T10:07:00Z", read_at: "2026-10-28T10:08:00Z" },
  ];
  assert.deepEqual(freshUnread(old, next).map((item) => item.id), ["a", "c"]);
  assert.deepEqual(freshUnread(next, next), []);
});

test("avisos da conversa aberta, mesmo chegando depois", async () => {
  const { unreadForRef } = await import("../../lib/notifications.ts");
  const base = { kind: "mensagem", title: "", body: "", link: "/mensagens", unread_count: 1, created_at: "" } as const;
  const items = [
    { ...base, id: "a", ref_id: "conversa-1", read_at: null },
    { ...base, id: "b", ref_id: "conversa-1", read_at: "2026-11-01" },
    { ...base, id: "c", ref_id: "conversa-2", read_at: null },
  ];
  assert.deepEqual(unreadForRef(items, "conversa-1"), ["a"]);
});
