import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentAttemptAllowed, PAY_LIMITS } from "../../lib/payment-rate-limit.ts";

// Imitação do rate_limit_hit do banco: conta por bucket + chave, sem janela de tempo.
function fakeRpc(fail = false) {
  const counts = new Map<string, number>();
  const calls: { p_bucket: string; p_key: string }[] = [];
  const rpc = async (_fn: "rate_limit_hit", args: { p_bucket: string; p_key: string; p_limit: number; p_window_seconds: number }) => {
    calls.push(args);
    if (fail) return { data: null, error: { message: "função ausente" } };
    const id = `${args.p_bucket}:${args.p_key}`;
    const n = counts.get(id) ?? 0;
    if (n >= args.p_limit) return { data: false, error: null };
    counts.set(id, n + 1);
    return { data: true, error: null };
  };
  return { rpc, calls };
}

const userLimit = PAY_LIMITS.find((rule) => rule.by === "user")!.limit;
const ipLimit = PAY_LIMITS.find((rule) => rule.by === "ip")!.limit;

test("libera até o limite por conta e bloqueia a tentativa seguinte", async () => {
  const { rpc } = fakeRpc();
  for (let i = 0; i < userLimit; i++) assert.equal(await paymentAttemptAllowed(rpc, "user-1", "1.1.1.1"), true);
  assert.equal(await paymentAttemptAllowed(rpc, "user-1", "1.1.1.1"), false);
});

test("o limite de uma conta não atinge outra conta", async () => {
  const { rpc } = fakeRpc();
  for (let i = 0; i <= userLimit; i++) await paymentAttemptAllowed(rpc, "user-1", "1.1.1.1");
  assert.equal(await paymentAttemptAllowed(rpc, "user-2", "2.2.2.2"), true);
});

test("várias contas no mesmo IP param no limite por IP", async () => {
  const { rpc } = fakeRpc();
  let allowed = 0;
  for (let i = 0; i < ipLimit + 5; i++) {
    if (await paymentAttemptAllowed(rpc, `conta-${i}`, "9.9.9.9")) allowed++;
  }
  assert.equal(allowed, ipLimit);
});

test("usa o id da conta e o IP como chaves dos contadores", async () => {
  const { rpc, calls } = fakeRpc();
  await paymentAttemptAllowed(rpc, "user-1", "1.1.1.1");
  assert.deepEqual(calls.map((c) => [c.p_bucket, c.p_key]), [["pagamento-usuario", "user-1"], ["pagamento-ip", "1.1.1.1"]]);
});

test("se o contador do banco falhar, não trava a venda", async () => {
  const { rpc } = fakeRpc(true);
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(await paymentAttemptAllowed(rpc, "user-1", "1.1.1.1"), true);
  } finally {
    console.error = original;
  }
});
