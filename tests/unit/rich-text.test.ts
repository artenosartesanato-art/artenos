import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRichText, plainSummary } from "../../lib/rich-text.ts";

test("parágrafos, negrito e listas", () => {
  const blocks = parseRichText("Copo de **chocolate** feito à mão.\n\nInclui:\n- tampa\n- colher\n\n1. Escolha\n2. Receba");
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks[0], { type: "paragraph", lines: [[{ text: "Copo de ", bold: false }, { text: "chocolate", bold: true }, { text: " feito à mão.", bold: false }]] });
  assert.equal(blocks[1].type, "paragraph");
  assert.deepEqual(blocks[2], { type: "list", ordered: false, items: [[{ text: "tampa", bold: false }], [{ text: "colher", bold: false }]] });
  assert.equal(blocks[3].type === "list" && blocks[3].ordered, true);
});

test("HTML é tratado como texto", () => {
  const blocks = parseRichText("<script>alert(1)</script>");
  assert.deepEqual(blocks, [{ type: "paragraph", lines: [[{ text: "<script>alert(1)</script>", bold: false }]] }]);
});

test("resumo sem marcações e com reticências", () => {
  assert.equal(plainSummary("Copo **EJN**\n- tampa\n- colher"), "Copo EJN · tampa · colher");
  const long = plainSummary("palavra ".repeat(60), 40);
  assert.ok(long.length <= 40);
  assert.ok(long.endsWith("…"));
  assert.equal(plainSummary(null), "");
});
