import { test } from "node:test";
import assert from "node:assert/strict";
import { canOptimize } from "../../lib/image-optimization.ts";

const base = "https://abc.supabase.co";

test("otimiza só imagens públicas do Storage do próprio projeto", () => {
  assert.equal(canOptimize("https://abc.supabase.co/storage/v1/object/public/artenos-store-assets/a.jpg", base), true);
  assert.equal(canOptimize("https://outro.supabase.co/storage/v1/object/public/x/a.jpg", base), false);
  assert.equal(canOptimize("https://abc.supabase.co/storage/v1/object/sign/x/a.jpg?token=1", base), false);
  assert.equal(canOptimize("https://images.exemplo.com/a.jpg", base), false);
});

test("blob, data e vazio seguem sem otimização", () => {
  assert.equal(canOptimize("blob:https://site/123", base), false);
  assert.equal(canOptimize("data:image/png;base64,AA", base), false);
  assert.equal(canOptimize("", base), false);
  assert.equal(canOptimize(null, base), false);
  assert.equal(canOptimize("https://abc.supabase.co/storage/v1/object/public/a.jpg", undefined), false);
});
