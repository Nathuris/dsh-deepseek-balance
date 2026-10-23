import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const clientSource = readFileSync(new URL("../client.js", import.meta.url), "utf8");

/**
 * Load the generated bundle into a fake module system and run apply() against
 * a fake client context. React hooks never execute here because nothing is
 * rendered; this proves the wiring (slot, dictionaries, injection, styles).
 */
function loadPlugin() {
  let definition;
  const cleanups = [];
  const registered = [];

  const fakeReact = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat() };
    },
    Fragment: Symbol("Fragment"),
    useState(initial) {
      return [initial, () => {}];
    },
    useRef(initial) {
      return { current: initial };
    },
    useEffect(effect) {
      const cleanup = effect();
      if (typeof cleanup === "function") cleanups.push(cleanup);
    },
    useLayoutEffect() {},
    useCallback(fn) {
      return fn;
    },
    useId() {
      return "uid";
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot();
    },
  };
  const fakeReactDOM = { createPortal() {} };

  const styleTags = [];
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame() {},
    window: {
      __ModuleLoader__: {
        load(value) {
          definition = value;
        },
      },
      __DSH_BOOT__: { release: { version: "9.9.9" } },
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 1200,
    },
    document: {
      body: {},
      head: {
        appendChild(node) {
          styleTags.push(node);
        },
      },
      createElement() {
        return {
          setAttribute() {},
          remove() {},
          textContent: "",
        };
      },
      querySelector() {
        return null;
      },
      addEventListener() {},
      removeEventListener() {},
      visibilityState: "visible",
    },
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(clientSource, sandbox, { filename: "client.js" });

  const factory = definition.factory;
  const plugin = factory((name) => {
    if (name === "react") return fakeReact;
    if (name === "react-dom") return fakeReactDOM;
    throw new Error(`unexpected require: ${name}`);
  });

  const directories = {
    s1: { store: { getSnapshot: () => ({ current: { provider: "deepseek-account" } }) } },
    sub: null,
  };
  const ctx = {
    effect(fn) {
      const cleanup = fn();
      if (typeof cleanup === "function") cleanups.push(cleanup);
    },
    locale: {
      register(namespace, dictionaries) {
        registered.push({ namespace, dictionaries });
      },
      getSnapshot: () => ({ active: "zh-CN" }),
    },
    get(name) {
      if (name !== "modelDirectories") return undefined;
      return {
        directoryFor(sessionId) {
          const value = directories[sessionId];
          if (!value) throw new Error("no directory");
          return value;
        },
      };
    },
    slots: {
      inject(slotName, register) {
        register();
      },
      register(spec, component) {
        assert.equal(typeof component, "function");
        registered.push({ spec, component });
        return () => {};
      },
    },
    remote: {
      account: {
        async getBalance() {
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
  };

  plugin.apply(ctx);
  return { plugin, registered, cleanups, styleTags };
}

test("bundle exposes the plugin contract", () => {
  const { plugin } = loadPlugin();
  assert.equal(Array.from(plugin.inject).join(","), "slots,locale,remote,remote.account,modelDirectories");
  assert.equal(typeof plugin.apply, "function");
});

test("apply registers into the slot immediately before the model selector", () => {
  const { registered } = loadPlugin();
  const chip = registered.find((entry) => entry.spec && entry.spec.name === "conversation.input.right");
  assert.ok(chip, "chip registration");
  assert.equal(chip.spec.id, "deepseek-balance");
  assert.equal(chip.spec.locale, "deepseek-balance");
  assert.equal(chip.spec.order, 12);

  const injected = chip.spec.inject("s1");
  assert.ok(injected.directory, "directory store injected for a main session");

  const subagent = chip.spec.inject("sub");
  assert.equal(subagent.directory, null, "subagent sessions stay hidden");
});

test("apply registers zh/en dictionaries and installs one style tag", () => {
  const { registered, styleTags } = loadPlugin();
  const dictionaries = registered.find((entry) => entry.namespace === "deepseek-balance");
  assert.ok(dictionaries, "locale dictionary registration");
  assert.equal(typeof dictionaries.dictionaries.zh.chipLabel, "string");
  assert.equal(typeof dictionaries.dictionaries.en.chipLabel, "string");
  assert.equal(styleTags.length, 1);
  assert.match(styleTags[0].textContent, /\.dsb-chip/);
});

test("the chip renders the summed balance for a DeepSeek account session", async () => {
  const { registered, cleanups } = loadPlugin();
  const chip = registered.find((entry) => entry.spec && entry.spec.name === "conversation.input.right");
  const t = (key, params) => {
    const text = {
      chipLabel: "余额",
      chipAria: "DeepSeek 账户余额 {amount}，打开明细",
      total: "可用余额",
      recharge: "充值余额",
      bonus: "赠送余额",
      updatedAt: "{time} 更新",
      otherCurrency: "{currency} 余额",
      cardLabel: "DeepSeek 账户余额",
    }[key] ?? key;
    return params ? text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match)) : text;
  };
  const directory = {
    getSnapshot: () => ({ current: { provider: "deepseek-account" } }),
    subscribe: () => () => {},
  };

  try {
    // First pass mounts the store; the account read resolves in a microtask.
    chip.component({ t, directory });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const tree = chip.component({ t, directory });
    const serialized = JSON.stringify(tree);
    assert.match(serialized, /¥12\.34/);
    assert.match(serialized, /余额/);
    assert.match(serialized, /DeepSeek 账户余额 ¥12\.34/);
  } finally {
    for (const cleanup of cleanups) cleanup();
  }
});
