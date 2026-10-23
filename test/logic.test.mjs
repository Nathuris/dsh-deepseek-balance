import test from "node:test";
import assert from "node:assert/strict";

import {
  formatUnits,
  formatUpdatedAt,
  isDeepSeekAccountProvider,
  moneyToUnits,
  parseDecimal,
  summarize,
} from "../src/logic.js";

const wallet = (currency, balance) => ({ currency, balance });

test("parseDecimal normalizes plain, fractional, and exponent input", () => {
  assert.deepEqual(parseDecimal("12.34"), { sign: 1, whole: "12", frac: "34" });
  assert.deepEqual(parseDecimal("-0.5"), { sign: -1, whole: "0", frac: "5" });
  assert.deepEqual(parseDecimal(".5"), { sign: 1, whole: "0", frac: "5" });
  assert.deepEqual(parseDecimal("000.125"), { sign: 1, whole: "0", frac: "125" });
  assert.deepEqual(parseDecimal("1e3"), { sign: 1, whole: "1000", frac: "" });
  assert.equal(parseDecimal("0E-16").whole, "0");
  assert.equal(parseDecimal("0E-16").frac.length, 16);
  assert.equal(parseDecimal("oops"), null);
  assert.equal(parseDecimal(null), null);
});

test("formatUnits follows Platform's truncation and sub-cent rules", () => {
  const cases = [
    ["0", "¥0.00"],
    ["0.00", "¥0.00"],
    ["0.001", "<¥0.01"],
    ["0.01", "¥0.01"],
    ["12.349", "¥12.34"],
    ["12.999", "¥12.99"],
    ["1234.5", "¥1,234.50"],
    ["1234567.891", "¥1,234,567.89"],
    ["-0.001", "-¥0.01"],
    ["-12.349", "-¥12.34"],
    ["5.0000000000000000", "¥5.00"],
    ["0E-16", "¥0.00"],
  ];
  for (const [amount, expected] of cases) {
    assert.equal(formatUnits(moneyToUnits(amount), "¥"), expected, amount);
  }
  assert.equal(formatUnits(moneyToUnits("3.5"), "$"), "$3.50");
});

test("summarize totals top-up and granted wallets per currency", () => {
  const summary = summarize(
    [wallet("CNY", "10.00")],
    [wallet("CNY", "2.34")],
  );
  assert.equal(summary.totalText, "¥12.34");
  assert.equal(summary.rechargeText, "¥10.00");
  assert.equal(summary.bonusText, "¥2.34");
  assert.equal(summary.low, false);
  assert.equal(summary.list.length, 1);
});

test("summarize prefers CNY and keeps USD as a second row", () => {
  const summary = summarize(
    [wallet("USD", "3.00"), wallet("CNY", "8.00")],
    [wallet("CNY", "1.00")],
  );
  assert.equal(summary.primary.currency, "CNY");
  assert.equal(summary.totalText, "¥9.00");
  assert.equal(summary.list.length, 2);
  assert.equal(summary.list[1].currency, "USD");
});

test("summarize hides invalid rows and returns null when nothing is usable", () => {
  assert.equal(summarize([], []), null);
  assert.equal(summarize([wallet("EUR", "5")], []), null);
  assert.equal(summarize([wallet("CNY", "nope")], []), null);
  const summary = summarize([wallet("CNY", "0.50")], []);
  assert.equal(summary.low, true);
  assert.equal(summary.totalText, "¥0.50");
});

test("provider gate only covers the signed-in DeepSeek account route", () => {
  assert.equal(isDeepSeekAccountProvider("deepseek-account"), true);
  assert.equal(isDeepSeekAccountProvider("deepseek-official"), false);
  assert.equal(isDeepSeekAccountProvider("openai-codex"), false);
  assert.equal(isDeepSeekAccountProvider(undefined), false);
});

test("formatUpdatedAt renders HH:MM and rejects missing timestamps", () => {
  assert.equal(formatUpdatedAt(0), null);
  assert.equal(formatUpdatedAt(Number.NaN), null);
  const at = new Date(2026, 9, 23, 9, 5).getTime();
  assert.equal(formatUpdatedAt(at), "09:05");
});
