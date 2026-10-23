/**
 * DeepSeek balance — composer chip and hover card.
 *
 * The chip mirrors the composer's other quota pills: a compact label + amount
 * inside a 28px button, with a fixed-position card rendered through a portal so
 * it is never clipped by the composer's overflow.
 */

import {
  formatUnits,
  formatUpdatedAt,
  isDeepSeekAccountProvider,
  summarize,
} from "./logic.js";

const NO_SUBSCRIBE = () => () => {};

/**
 * Build the chip component for one store instance.
 * @param React - the shared React namespace.
 * @param ReactDOM - the shared ReactDOM namespace (createPortal).
 * @param store - balance store created by apply().
 * @returns a slot component.
 */
export function createBalanceChip(React, ReactDOM, store) {
  const h = React.createElement;

  return function BalanceChip(props) {
    const t = props.t;
    const directory = props.directory;

    const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
    const subscribeModels = React.useCallback(
      (listener) => (directory ? directory.subscribe(listener) : NO_SUBSCRIBE()),
      [directory],
    );
    const readModels = React.useCallback(
      () => (directory ? directory.getSnapshot() : null),
      [directory],
    );
    const models = React.useSyncExternalStore(subscribeModels, readModels);

    const provider = models && models.current ? models.current.provider : undefined;
    const active = isDeepSeekAccountProvider(provider);
    const summary = snapshot.wallets === null ? null : summarize(snapshot.wallets, snapshot.bonus);

    const openState = React.useState(false);
    const open = openState[0];
    const setOpen = openState[1];
    const positionState = React.useState(null);
    const position = positionState[0];
    const setPosition = positionState[1];
    const triggerRef = React.useRef(null);
    const panelRef = React.useRef(null);
    const pinnedRef = React.useRef(false);
    const timerRef = React.useRef(null);
    const id = React.useId();

    React.useEffect(() => {
      if (!active) return undefined;
      return store.mount();
    }, [active]);

    React.useEffect(() => {
      if (active) return;
      pinnedRef.current = false;
      setOpen(false);
    }, [active]);

    React.useEffect(() => {
      if (!open) return undefined;
      store.load(false);

      const onPointerDown = (event) => {
        const target = event.target;
        if (triggerRef.current && triggerRef.current.contains(target)) return;
        if (panelRef.current && panelRef.current.contains(target)) return;
        pinnedRef.current = false;
        setOpen(false);
      };
      const onKeyDown = (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        pinnedRef.current = false;
        setOpen(false);
        if (triggerRef.current) triggerRef.current.focus();
      };

      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [open, setOpen]);

    React.useEffect(
      () => () => {
        if (timerRef.current !== null) clearTimeout(timerRef.current);
      },
      [],
    );

    React.useLayoutEffect(() => {
      if (!open) {
        setPosition(null);
        return undefined;
      }
      const panel = panelRef.current;
      const trigger = triggerRef.current;
      if (!panel || !trigger) return undefined;
      const place = () => {
        const rect = trigger.getBoundingClientRect();
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        const gap = 8;
        const margin = 8;
        let left = rect.left + rect.width / 2 - width / 2;
        left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
        let top = rect.top - height - gap;
        if (top < margin) top = rect.bottom + gap;
        setPosition({ left, top });
      };
      place();
      window.addEventListener("resize", place);
      return () => window.removeEventListener("resize", place);
    }, [open, snapshot.at, snapshot.status, setPosition]);

    if (!active || summary === null) return null;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const openNow = () => {
      clearTimer();
      setOpen(true);
    };
    const scheduleClose = () => {
      if (pinnedRef.current) return;
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setOpen(false);
      }, 150);
    };
    const close = () => {
      pinnedRef.current = false;
      clearTimer();
      setOpen(false);
    };

    const updatedAt = formatUpdatedAt(snapshot.at);
    const amount = summary.totalText;
    const rows = [
      h(
        "div",
        { className: "dsb-row dsb-row-total", key: "total" },
        h("span", { className: "dsb-key" }, t("total")),
        h("strong", { className: "dsb-value" }, amount),
        updatedAt === null
          ? null
          : h("span", { className: "dsb-meta" }, t("updatedAt", { time: updatedAt })),
      ),
      h(
        "div",
        { className: "dsb-row", key: "recharge" },
        h("span", { className: "dsb-key" }, t("recharge")),
        h("span", { className: "dsb-value" }, summary.rechargeText),
      ),
      h(
        "div",
        { className: "dsb-row", key: "bonus" },
        h("span", { className: "dsb-key" }, t("bonus")),
        h("span", { className: "dsb-value" }, summary.bonusText),
      ),
      ...summary.list.slice(1).map((group) =>
        h(
          "div",
          { className: "dsb-row", key: group.currency },
          h("span", { className: "dsb-key" }, t("otherCurrency", { currency: group.currency })),
          h("span", { className: "dsb-value" }, formatUnits(group.total, group.symbol)),
        ),
      ),
    ];

    const panel = h(
      "section",
      {
        ref: panelRef,
        id,
        role: "dialog",
        tabIndex: -1,
        "aria-label": t("cardLabel"),
        className: "dsb-panel",
        style: {
          left: position ? position.left : 0,
          top: position ? position.top : 0,
          visibility: position ? "visible" : "hidden",
        },
        onMouseEnter: openNow,
        onMouseLeave: scheduleClose,
      },
      rows,
    );

    return h(
      React.Fragment,
      null,
      h(
        "button",
        {
          ref: triggerRef,
          type: "button",
          className: "dsb-chip",
          "data-warning": summary.low ? "true" : undefined,
          "aria-label": t("chipAria", { amount }),
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          "aria-controls": open ? id : undefined,
          onMouseEnter: openNow,
          onMouseLeave: scheduleClose,
          onClick: () => {
            if (pinnedRef.current) close();
            else {
              pinnedRef.current = true;
              openNow();
              requestAnimationFrame(() => {
                if (panelRef.current) panelRef.current.focus();
              });
            }
          },
        },
        h("span", { className: "dsb-chip-label" }, t("chipLabel")),
        h("span", { className: "dsb-chip-amount" }, amount),
      ),
      open ? ReactDOM.createPortal(panel, document.body) : null,
    );
  };
}
