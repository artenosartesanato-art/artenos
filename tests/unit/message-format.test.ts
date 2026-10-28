import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDayLabel, formatListTime, groupChat, initials } from "../../lib/message-format.ts";

// Datas locais para não depender do fuso do ambiente.
const now = new Date(2026, 9, 28, 15, 0); // quarta-feira, 28/10/2026 15:00
const at = (day: number, hour: number, minute = 0, month = 9, year = 2026) =>
  new Date(year, month, day, hour, minute).toISOString();

test("horário da lista: hoje, ontem, dia da semana e data", () => {
  assert.equal(formatListTime(at(28, 9, 5), now), "09:05");
  assert.equal(formatListTime(at(27, 23, 59), now), "Ontem");
  assert.equal(formatListTime(at(26, 10), now), "segunda");
  assert.equal(formatListTime(at(12, 10), now), "12/10/26");
});

test("separador de dia: hoje, ontem, semana, mês e ano", () => {
  assert.equal(formatDayLabel(at(28, 0, 1), now), "Hoje");
  assert.equal(formatDayLabel(at(27, 12), now), "Ontem");
  assert.equal(formatDayLabel(at(24, 12), now), "sábado");
  assert.equal(formatDayLabel(at(3, 12), now), "3 de outubro");
  assert.equal(formatDayLabel(at(3, 12, 0, 9, 2025), now), "3 de outubro de 2025");
});

test("agrupa mensagens seguidas do mesmo remetente e separa os dias", () => {
  const items = groupChat([
    { id: "1", sender_id: "a", created_at: at(27, 10, 0) },
    { id: "2", sender_id: "a", created_at: at(27, 10, 3) },
    { id: "3", sender_id: "a", created_at: at(27, 10, 20) }, // passou de 5 min
    { id: "4", sender_id: "b", created_at: at(27, 10, 21) },
    { id: "5", sender_id: "b", created_at: at(28, 9, 0) }, // outro dia
  ], now);
  assert.deepEqual(items.map((item) => item.dayLabel), ["Ontem", null, null, null, "Hoje"]);
  assert.deepEqual(items.map((item) => item.firstOfGroup), [true, false, true, true, true]);
  assert.deepEqual(items.map((item) => item.lastOfGroup), [false, true, true, true, true]);
});

test("iniciais do avatar", () => {
  assert.equal(initials("Ateliê Fio de Barro"), "AB");
  assert.equal(initials("marina"), "MA");
  assert.equal(initials("  "), "?");
  assert.equal(initials(null), "?");
});
