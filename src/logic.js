/**
 * DeepSeek balance — pure helpers.
 *
 * Balance amounts arrive from Platform as arbitrary-precision decimal strings
 * (the account service validates a big.js-compatible numeric grammar, keeping
 * "0E-16" and "5.0000000000000000" as-is). Everything here works on scaled
 * BigInt units so display never introduces float drift.
 */

/** Display symbols for the two currencies Platform can report. */
export const CURRENCY_SYMBOLS = Object.freeze({ CNY: "¥", USD: "$" });

/** Provider id of the signed-in DeepSeek account route. */
export const DEEPSEEK_ACCOUNT_PROVIDER = "deepseek-account";

/** Decimal places retained internally before the two-place display truncation. */
const SCALE_DIGITS = 12;
const SCALE = 10n ** BigInt(SCALE_DIGITS);
const ONE_YUAN = 10n ** BigInt(SCALE_DIGITS);

/**
 * Split a decimal string into sign, whole digits, and fraction digits.
 * Supports exponent notation so "0E-16" and "1e3" stay valid.
 * @param value - decimal string or number from Platform.
 * @returns normalized parts, or null when the value is not numeric.
 */
export function parseDecimal(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (match === null) return null;
  const integer = match[2] || "0";
  const fraction = match[3] || "";
  const exponent = match[4] === undefined ? 0 : Number.parseInt(match[4], 10);
  if (!Number.isFinite(exponent)) return null;
  if (integer === "" && fraction === "") return null;

  const sign = match[1] === "-" ? -1 : 1;
  const digits = integer + fraction;
  const point = integer.length + exponent;

  let whole;
  let frac;
  if (point <= 0) {
    whole = "0";
    frac = "0".repeat(-point) + digits;
  } else if (point >= digits.length) {
    whole = digits + "0".repeat(point - digits.length);
    frac = "";
  } else {
    whole = digits.slice(0, point);
    frac = digits.slice(point);
  }
  whole = whole.replace(/^0+(?=\d)/, "");
  if (whole === "") whole = "0";
  return { sign, whole, frac };
}

/**
 * Convert a Platform amount to scaled BigInt units (12 decimal places).
 * @param value - decimal string or number.
 * @returns scaled units, or null when unparseable.
 */
export function moneyToUnits(value) {
  const parsed = parseDecimal(value);
  if (parsed === null) return null;
  const fraction = (parsed.frac + "0".repeat(SCALE_DIGITS)).slice(0, SCALE_DIGITS);
  const magnitude = BigInt(parsed.whole) * SCALE + BigInt(fraction === "" ? "0" : fraction);
  return parsed.sign < 0 ? -magnitude : magnitude;
}

/**
 * Group the integer part with commas without going through Number.
 * @param digits - integer digits.
 * @returns grouped digits.
 */
function groupDigits(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format scaled units using Platform Web's display rules: two decimals,
 * truncation (round down) rather than rounding, and a sub-cent marker.
 * @param units - scaled units.
 * @param symbol - currency symbol such as "¥".
 * @returns display text such as "¥1,234.56", "<¥0.01", or "-¥0.50".
 */
export function formatUnits(units, symbol) {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  if (absolute === 0n) return `${symbol}0.00`;

  const digits = absolute.toString().padStart(SCALE_DIGITS + 1, "0");
  const whole = digits.slice(0, -SCALE_DIGITS).replace(/^0+(?=\d)/, "") || "0";
  const fraction = digits.slice(-SCALE_DIGITS).slice(0, 2);
  if (whole === "0" && fraction === "00") return negative ? `-${symbol}0.01` : `<${symbol}0.01`;
  return `${negative ? "-" : ""}${symbol}${groupDigits(whole)}.${fraction}`;
}

/**
 * Whether a provider id is the DeepSeek account route this chip covers.
 * @param provider - provider id of the session's current selection.
 * @returns true for the signed-in DeepSeek account provider.
 */
export function isDeepSeekAccountProvider(provider) {
  return provider === DEEPSEEK_ACCOUNT_PROVIDER;
}

/**
 * Join wallet rows into per-currency totals.
 * @param wallets - normal (top-up) wallets: { currency, balance }.
 * @param bonusWallets - granted wallets: { currency, balance }.
 * @returns per-currency totals with display text, or null when nothing valid.
 */
export function summarize(wallets, bonusWallets) {
  const groups = new Map();

  const add = (rows, kind) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (row === null || typeof row !== "object") continue;
      const currency = row.currency;
      if (currency !== "CNY" && currency !== "USD") continue;
      const units = moneyToUnits(row.balance);
      if (units === null) continue;
      const group = groups.get(currency) ?? {
        currency,
        symbol: CURRENCY_SYMBOLS[currency],
        total: 0n,
        recharge: 0n,
        bonus: 0n,
      };
      group[kind] += units;
      group.total += units;
      groups.set(currency, group);
    }
  };

  add(wallets, "recharge");
  add(bonusWallets, "bonus");

  const list = [...groups.values()].sort((a, b) => {
    if (a.currency === b.currency) return 0;
    if (a.currency === "CNY") return -1;
    if (b.currency === "CNY") return 1;
    return a.currency < b.currency ? -1 : 1;
  });
  if (list.length === 0) return null;

  const primary = list[0];
  return {
    primary,
    list,
    totalText: formatUnits(primary.total, primary.symbol),
    rechargeText: formatUnits(primary.recharge, primary.symbol),
    bonusText: formatUnits(primary.bonus, primary.symbol),
    low: primary.total >= 0n && primary.total < ONE_YUAN,
  };
}

/**
 * Format the last successful read for the hover card.
 * @param timestamp - epoch milliseconds, 0 when never read.
 * @returns HH:MM, or null when there is no timestamp.
 */
export function formatUpdatedAt(timestamp) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
