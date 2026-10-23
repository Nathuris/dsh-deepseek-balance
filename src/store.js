/**
 * DeepSeek balance — shared account balance store.
 *
 * One store per plugin instance, shared by every composer chip. Reads go
 * through the account Remote namespace that the Settings → Account page also
 * uses, so credentials stay Host-side and the plugin never touches a token.
 */

/** How often a visible page re-reads the balance. */
const REFRESH_INTERVAL_MS = 120000;

/** Minimum gap between two reads triggered by mounting or hover, in ms. */
const MIN_GAP_MS = 30000;

/** Fallback client version when the boot graph carries none. */
const FALLBACK_VERSION = "0.2.1-rc.2";

/**
 * Read the running client version for the account call metadata.
 * @returns version string.
 */
function clientVersion() {
  try {
    const boot = window.__DSH_BOOT__;
    if (boot && boot.release && typeof boot.release.version === "string" && boot.release.version !== "") {
      return boot.release.version;
    }
  } catch {
    // A page without a boot graph falls back to the packaged default.
  }
  return FALLBACK_VERSION;
}

/**
 * Create the balance store bound to one plugin context.
 * @param ctx - client plugin context owning the Remote connection and locale.
 * @returns store with getSnapshot / subscribe / mount / load / dispose.
 */
export function createBalanceStore(ctx) {
  let state = Object.freeze({ status: "idle", wallets: null, bonus: null, at: 0, error: null });
  const listeners = new Set();
  let inflight = null;
  let timer = null;
  let mounts = 0;
  let disposed = false;

  const emit = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // A listener throwing must not stop the remaining subscribers.
      }
    }
  };

  const set = (patch) => {
    state = Object.freeze({ ...state, ...patch });
    emit();
  };

  const accountApi = () => {
    const remote = ctx.remote;
    return remote && remote.account && typeof remote.account.getBalance === "function" ? remote.account : null;
  };

  const metadata = () => ({
    version: clientVersion(),
    locale: ctx.locale.getSnapshot().active,
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  });

  /**
   * Read the balance once, keeping the last good value on failure.
   * @param force - bypass the minimum-gap guard.
   * @returns promise settling after the read.
   */
  const load = (force) => {
    if (disposed) return Promise.resolve();
    if (inflight !== null) return inflight;
    if (!force && state.at !== 0 && Date.now() - state.at < MIN_GAP_MS) return Promise.resolve();

    const account = accountApi();
    if (account === null) {
      if (state.status !== "unsupported") set({ status: "unsupported", error: "account API unavailable" });
      return Promise.resolve();
    }
    if (state.wallets === null && state.status !== "loading") set({ status: "loading", error: null });

    const request = Promise.resolve(account.getBalance(metadata()))
      .then((result) => {
        if (disposed) return;
        if (!result || result.ok !== true) {
          const code = result && result.error && (result.error.code || result.error.message);
          throw new Error(code || "balance request failed");
        }
        const value = result.value;
        if (!value || value.status !== "ready") {
          throw new Error((value && value.status) || "balance unavailable");
        }
        set({
          status: "ready",
          wallets: Array.isArray(value.value) ? value.value : [],
          bonus: Array.isArray(value.bonusWallets) ? value.bonusWallets : [],
          at: Date.now(),
          error: null,
        });
      })
      .catch((error) => {
        if (disposed) return;
        const message = String((error && error.message) || error);
        // Keep the last successful amount; surface the failure only in the tooltip.
        set(state.wallets === null ? { status: "error", error: message } : { error: message });
      })
      .finally(() => {
        if (inflight === request) inflight = null;
      });

    inflight = request;
    return request;
  };

  const onFocus = () => {
    if (state.at === 0 || Date.now() - state.at > MIN_GAP_MS) load(false);
  };

  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") onFocus();
  };

  const startTimers = () => {
    if (timer !== null) return;
    timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      load(false);
    }, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
  };

  const stopTimers = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    /**
     * Keep the shared store alive while at least one DeepSeek chip is mounted.
     * @returns release callback for that mount.
     */
    mount: () => {
      mounts += 1;
      if (mounts === 1) {
        startTimers();
        load(true);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        mounts -= 1;
        if (mounts === 0) stopTimers();
      };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stopTimers();
      listeners.clear();
      inflight = null;
    },
  };
}
