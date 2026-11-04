import { test } from "node:test";
import assert from "node:assert/strict";
import { findBlockedTerm, moderationTokens } from "../../lib/moderation.ts";

test("normaliza acentos, leetspeak, repetições e letras separadas", () => {
  assert.deepEqual(moderationTokens("P0RR4"), ["pora"]);
  assert.deepEqual(moderationTokens("p.u.t.a"), ["puta"]);
  assert.deepEqual(moderationTokens("puuuuuta"), ["puta"]);
  assert.deepEqual(moderationTokens("Desgraçado!"), ["desgracado"]);
});

test("bloqueia variações dos termos da lista", () => {
  for (const text of ["corno", "puta", "p0rr4", "p.u.t.a", "P U T A", "puuuta", "seu c0rn0", "CARALHO", "vai se f0der", "fdp", "f d p", "putas", "otários"]) {
    assert.notEqual(findBlockedTerm(text), null, text);
  }
});

test("não bloqueia palavras legítimas que contêm um termo", () => {
  for (const text of [
    "Olá! Gostaria de saber mais sobre Copo EJN.",
    "Meu computador quebrou, posso pagar amanhã?",
    "A peça custa R$ 30,00 e chega em 3 dias.",
    "Tem cupom de desconto? Moro em Curitiba.",
    "Quero uma disputa justa e um bordado com picote.",
    "Adoro o acabamento escrito à mão, é um capuz lindo.",
    "Aceito sugestões: bota, sapato, putz que lindo",
  ]) {
    assert.equal(findBlockedTerm(text), null, text);
  }
});
