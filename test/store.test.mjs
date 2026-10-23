import test from "node:test";
import assert from "node:assert/strict";

import { createBalanceStore } from "../src/store.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("store reads wallets, dedupes, and keeps the last good value", async () => {
  let calls = 0;
  let fail = false;
  const received = [];
  const ctx = {
    remote: {
      account: {
        async getBalance(metadata) {
          calls += 1;
          received.push(metadata);
          if (fail) throw new Error("network down");
          return {
            ok: true,
            value: {
              status: "ready",
              value: [{ currency: "CNY", balance: "10.00" }],
              bonusWallets: [{ currency: "CNY", balance: "2.34" }],
            },
          };
        },
      },
    },
    locale: { getSnapshot: () => ({ active: "zh-CN" }) },
  };

  globalThis.window = {
    __DSH_BOOT__: { release: { version: "9.9.9" } },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = {
    visibilityState: "visible",
    addEventListener() {},
    removeEventListener() {},
  };

  const store = createBalanceStore(ctx);
  assert.equal(store.getSnapshot().status, "idle");

  await store.load(true);
  assert.equal(calls, 1);
  assert.equal(store.getSnapshot().status, "ready");
  assert.equal(store.getSnapshot().wallets[0].balance, "10.00");
  assert.equal(received[0].version, "9.9.9");
  assert.equal(received[0].locale, "zh-CN");
  assert.equal(typeof received[0].timezoneOffsetSeconds, "number");

  // A second read inside the minimum gap is a no-op.
  await store.load(false);
  assert.equal(calls, 1);

  fail = true;
  await store.load(true);
  await flush();
  assert.equal(calls, 2);
  assert.ok(store.getSnapshot().wallets, "stale value survives a failed refresh");
  assert.match(store.getSnapshot().error, /network down/);

  store.dispose();
  delete globalThis.window;
  delete globalThis.document;
});

test("store reports unsupported when the account Remote is absent", async () => {
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };

  const store = createBalanceStore({ remote: {}, locale: { getSnapshot: () => ({ active: "en" }) } });
  await store.load(true);
  assert.equal(store.getSnapshot().status, "unsupported");
  assert.equal(store.getSnapshot().wallets, null);

  store.dispose();
  delete globalThis.window;
  delete globalThis.document;
});
