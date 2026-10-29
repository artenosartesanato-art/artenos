import { test } from "node:test";
import assert from "node:assert/strict";
import { meaningfulTextError } from "../../lib/text-quality.ts";

test("aceita uma história escrita de verdade", () => {
  assert.equal(meaningfulTextError("Comecei a bordar com minha avó, uso linhas de algodão e cada peça leva uma semana."), null);
  assert.equal(meaningfulTextError("Faço copos personalizados com chocolate e muito carinho desde 2019 aqui em Rio Preto."), null);
});

test("recusa textos sem sentido ou curtos", () => {
  assert.notEqual(meaningfulTextError("asdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdf"), null);
  assert.notEqual(meaningfulTextError("asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf"), null);
  assert.notEqual(meaningfulTextError("sdfg hjkl qwrt zxcv bnmm fghj sdfg hjkl qwrt zxcv"), null);
  assert.notEqual(meaningfulTextError("teste teste teste teste teste teste teste teste"), null);
  assert.notEqual(meaningfulTextError("Muito curto."), null);
  assert.notEqual(meaningfulTextError("Que loja linda aaaaaaaaa feita com amor e carinho total"), null);
});
