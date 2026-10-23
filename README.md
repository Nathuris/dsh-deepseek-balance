# dsh-deepseek-account-balance

在 DeepSeek Harness 输入框的模型选择按钮左侧，显示当前 DeepSeek 账户的可用余额。悬停或点击后弹出明细卡片，展示充值余额、赠送余额与最近更新时间。


```
[余额 ¥32.88]  [DeepSeek-V4.1-Flash High ⌄]  [🎤]
        ↑ 悬停 / 点击
   ┌──────────────────────────────┐
   │ 可用余额  ¥32.88   19:51 更新 │
   │ 充值余额  ¥32.88              │
   │ 赠送余额  ¥0.00               │
   └──────────────────────────────┘
```

## 行为

- 仅当当前会话选中的 provider 是 **`deepseek-account`**（登录账户路由）时显示；切到 Codex 或 API Key 路由自动隐藏。
- 金额来自 `remote.account.getBalance()`，与「设置 → 账户」同源；账户凭据始终留在 Host，页面拿不到 token。
- 默认聚合「充值 + 赠送」为可用总额，按币种展示；人民币优先。
- 刷新时机：首次挂载、每 2 分钟（页面可见时）、窗口重新聚焦；请求做去重和 30 秒最小间隔。
- 读取失败时保留上一次成功的金额，不会把余额显示成 0。
- 余额低于 ¥1 时数字转为警告色。
- 明暗主题跟随 DSH 的 CSS 变量；窗口较窄时自动隐藏「余额」二字，只留金额。

## 安装

前置条件：DeepSeek Harness 已登录 DeepSeek 账户，且默认模型使用 `deepseek-account` provider。

### 从 npm 安装（推荐）

```bash
dsh plugin add dsh-deepseek-account-balance
```

或在 **Plugins → Add plugin → Install a third-party plugin** 里填入包名：

```
dsh-deepseek-account-balance
```

安装完成后点 **Enable now**；页面会通过 HMR 加载插件，若仍是旧组合则刷新页面或重启一次应用。

> 若本机没有可用的 `dsh` 命令，直接用插件页安装即可，效果相同。

### 从 GitHub 安装（备选）

```bash
dsh plugin add github:Nathuris/dsh-deepseek-balance#v0.1.1
```

`#v0.1.1` 是发布标签，保证拿到固定版本；省略标签会跟随 `main` 的 HEAD。npm 包名是 `dsh-deepseek-account-balance`，GitHub 仓库名仍是 `dsh-deepseek-balance`。

### 从本地目录安装（开发调试）

```bash
dsh plugin add /absolute/path/to/dsh-deepseek-account-balance
```

或在插件页填入本仓库的绝对路径。本地安装记录为 `link:`，改动 `client.js` 后无需重新发布。

## 开发

```bash
npm run build   # 由 src/*.js 生成 client.js，并做语法检查
npm test        # node --test：金额格式化、汇总、store、bundle 装配
```

改完 `src/` 后重新 `npm run build`。以 `link:` 方式安装时，插件管理器的下次重组会加载新的 `client.js`；否则在插件页关闭/开启一次，或刷新页面 / 重启应用。

本地安装会在 profile 的 `package.json` 里留下 `"dsh-deepseek-account-balance": "link:<本目录>"`，因此**不要移动或删除本仓库目录**，否则插件会失效。

### 结构

```
src/logic.js  纯函数：金额解析、BigInt 汇总、格式化、provider 判定
src/store.js  余额读取、去重、轮询与可见性刷新
src/chip.js   输入框 chip + 悬停卡片（React.createElement，无 JSX）
src/index.js  slot 注册、字典、样式注入
build.mjs     把 src 内联进 __ModuleLoader__ 工厂，输出 client.js
lib/index.js  宿主半空壳，让 Loader 挂载并投放浏览器半
```

### 为什么不用打包器

浏览器半需要的是 `window.__ModuleLoader__.load({ id, factory })` 这一层壳；插件只需要 `react` 与 `react-dom`（平台共享模块表已提供）。`build.mjs` 只做模块语法剥离和内联，依赖为零，便于审计。

## 依赖的 DSH 接口

| 接口 | 用途 |
| --- | --- |
| `conversation.input.right`（list，session 作用域） | 渲染在 `conversation.input.model` 之前，即模型按钮左侧 |
| `ctx.modelDirectories.directoryFor(sessionId).store` | 当前会话的 provider/model 选择 |
| `ctx.remote.account.getBalance(metadata)` | 读取账户余额（需要 `{ version, locale, timezoneOffsetSeconds }`；插件必须声明 `remote.account` 注入） |
| `ctx.locale` / `ctx.slots` / `window.__DSH_BOOT__.release.version` | 文案、注册、账户调用的客户端版本 |

## 已知限制

- 不覆盖 API Key 路由（`deepseek-official`）的余额；那需要 Host 半使用 API Key 调 `api.deepseek.com/user/balance`。
- 卡片暂不提供「去充值」跳转。
- 余额是轮询读取，不是实时推送；刚结束一轮对话后最多 2 分钟（或聚焦窗口时）更新。

## License

MIT
