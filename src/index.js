/**
 * DeepSeek balance — browser entry.
 *
 * Registers one composer chip into `conversation.input.right`, the list slot
 * that renders immediately before `conversation.input.model`. The chip is only
 * present while the session's current provider is the signed-in DeepSeek
 * account; the amount comes from the same account Remote the Settings page
 * uses, so no credential ever reaches the page.
 */

import { createBalanceChip } from "./chip.js";
import { createBalanceStore } from "./store.js";

const NS = "deepseek-balance";

const zh = {
  chipLabel: "余额",
  chipAria: "DeepSeek 账户余额 {amount}，打开明细",
  cardLabel: "DeepSeek 账户余额",
  total: "可用余额",
  recharge: "充值余额",
  bonus: "赠送余额",
  updatedAt: "{time} 更新",
  otherCurrency: "{currency} 余额",
};

const en = {
  chipLabel: "Balance",
  chipAria: "DeepSeek account balance {amount}. Open details.",
  cardLabel: "DeepSeek account balance",
  total: "Available",
  recharge: "Top-up",
  bonus: "Granted",
  updatedAt: "Updated {time}",
  otherCurrency: "{currency} balance",
};

const CSS = `
.dsb-chip{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;height:28px;box-sizing:border-box;padding:0 6px;margin-right:2px;border:0;border-radius:6px;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:20px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.dsb-chip:hover,.dsb-chip[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}
.dsb-chip:focus-visible{outline:1px solid var(--dsw-alias-border-l3);outline-offset:2px}
.dsb-chip[data-warning=true]{color:var(--dsw-alias-state-error-primary)}
.dsb-chip[data-warning=true] .dsb-chip-label{color:inherit}
.dsb-chip-label{color:var(--dsw-alias-label-tertiary);font-weight:400}
.dsb-chip-amount{color:inherit}
.dsb-panel{position:fixed;z-index:1000;min-width:210px;width:max-content;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;box-sizing:border-box;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 4px 16px #0002;font-size:12px;line-height:20px;outline:none}
.dsb-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dsb-row+.dsb-row{margin-top:5px;padding-top:5px;border-top:1px solid var(--dsw-alias-border-l2)}
.dsb-key{color:var(--dsw-alias-label-primary)}
.dsb-value{font-variant-numeric:tabular-nums}
.dsb-row-total .dsb-value{font-weight:600}
.dsb-meta{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
@media (max-width:760px){.dsb-chip-label{display:none}}
`;

const STYLE_ATTR = "data-dsh-deepseek-balance";

/**
 * Install the chip stylesheet once for this plugin lifetime.
 * @returns disposer removing the tag this call created.
 */
function installStyle() {
  if (typeof document === "undefined") return () => {};
  const existing = document.querySelector(`style[${STYLE_ATTR}]`);
  if (existing !== null) return () => {};
  const tag = document.createElement("style");
  tag.setAttribute(STYLE_ATTR, "");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  return () => {
    tag.remove();
  };
}

/** Required client services: slot registry, dictionaries, account Remote, model state. */
export const inject = ["slots", "locale", "remote", "remote.account", "modelDirectories"];

/**
 * Mount the composer chip.
 * @param ctx - client plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "deepseek-balance: dictionaries");
  ctx.effect(() => installStyle(), "deepseek-balance: styles");

  const store = createBalanceStore(ctx);
  ctx.effect(() => () => store.dispose(), "deepseek-balance: store");

  const Chip = createBalanceChip(React, ReactDOM, store);

  ctx.slots.inject("conversation.input.right", () =>
    ctx.slots.register(
      {
        name: "conversation.input.right",
        id: "deepseek-balance",
        order: 12,
        locale: NS,
        inject: (sessionId) => {
          let directory = null;
          try {
            const directories = ctx.get("modelDirectories");
            if (directories && typeof directories.directoryFor === "function") {
              directory = directories.directoryFor(sessionId);
            }
          } catch {
            // Subagent sessions and torn-down scopes expose no directory; the
            // chip stays hidden rather than disturbing the composer.
          }
          return { directory: directory ? directory.store : null };
        },
      },
      Chip,
    ),
  );
}
