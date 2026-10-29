import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditReview, formatRating, ratingLabel, starParts } from "../../lib/reviews.ts";

test("formata a média em português", () => {
  assert.equal(formatRating(4.75), "4,8");
  assert.equal(formatRating(null), "");
  assert.equal(ratingLabel(4.5, 12), "4,5 de 5, 12 avaliações");
  assert.equal(ratingLabel(null, 0), "Ainda sem avaliações");
});

test("estrelas cheias, meia e vazias", () => {
  assert.deepEqual(starParts(4.3), { full: 4, half: 1, empty: 0 });
  assert.deepEqual(starParts(3.74), { full: 3, half: 1, empty: 1 });
  assert.deepEqual(starParts(5), { full: 5, half: 0, empty: 0 });
  assert.deepEqual(starParts(null), { full: 0, half: 0, empty: 5 });
});

test("edição permitida por 30 dias", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  assert.equal(canEditReview("2026-10-10T12:00:00Z", now), true);
  assert.equal(canEditReview("2026-09-20T12:00:00Z", now), false);
});
