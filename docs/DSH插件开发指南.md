# DSH 插件开发指南

> 基于 `dsh-done-sound`（对话完成音效插件）从零到发布的完整实战沉淀。
> 适用版本：DSH `0.1.1-rc.x`（web profile），Node ≥ 22，pnpm ≥ 10（corepack 管理）。

---

## 一、架构认知（先懂这个，后面全顺）

DSH（DeepSeek Harness）基于 **Cordis 插件框架**构建：

- **Profile**（如 `~/.dsh/profiles/web`）是一棵 Cordis loader 树。树不是写死的，而是**多层 patch 叠加**组合出来的：
  1. 官方 bundle 层（`dsh-base` 等，在 profile `package.json` 的 `dsh.profile.bundles` 里按序声明）
  2. 每个已装插件的 bundle 层（插件自己的 `cordis.patch.yml`）
  3. 用户自己的 `cordis.patch.yml`（最后覆盖，按 id 寻址：改配置 / `disabled`）
  4. 命令行 `--patch` 覆盖层
- **一个插件 = 一个 npm 包**，通常有"双半区"：
  - **Host 半区**（Node，跑在 `dsh web` 进程里）：注册设置作用域、斜杠命令、Agent 工具、HTTP 路由、远程服务
  - **Client 半区**（浏览器，跑在 Web GUI 里）：React 组件挂进 UI 槽位、通过 fetch/remote 调 Host
- 只做纯 Host 功能（如给 Agent 加工具）可以不带 Client 半区；带 UI 则必须双半区。

**关键命令速查**（装插件 / 看组合树）：

```sh
dsh plugin --profile web add <npm包名或git/link地址>   # 安装（内部是 pnpm add + bundle 对账）
dsh plugin --profile web add link:F:\path\to\plugin    # 本地开发模式
dsh --profile web --dump-config                        # 查看最终组合树（验证插件行）
dsh web                                                # 启动 GUI
```

## 二、插件包结构（最小骨架）

```
my-plugin/
├── package.json          # 清单（见下）
├── cordis.patch.yml      # bundle 层：把自己的插件行插进 loader 树
├── src/index.js          # Host 源码（ESM）
├── lib/index.js          # Host 构建产物（esbuild 打成自包含单文件，提交进仓库）
├── lib/client.js         # 浏览器半区（__ModuleLoader__ 格式，运行时契约，无需打包）
└── README.md / LICENSE / .gitignore
```

### package.json 关键字段

```jsonc
{
  "name": "my-plugin",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".":        { "default": "./lib/index.js" },   // Host 半区
    "./client": { "default": "./lib/client.js" },  // 浏览器半区
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },   // 声明自己是 bundle 层（安装后进 dsh.profile.bundles）
    "client": {
      "platform": "web",                           // 面向 web GUI
      "inject": [                                   // client 代码里 require 到的 DSH 客户端包
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-slots",
        "@deepseek-ai/dsh-api-remotes"
      ]
    }
  },
  "peerDependencies": { /* 用到什么 DSH 包就 peer 什么，全部 optional */ },
  "files": ["lib", "cordis.patch.yml", "README.md", "LICENSE"]
}
```

### cordis.patch.yml —— 插件行

```yaml
- insert:
    - id: my-plugin
      name: 'my-plugin'        # 或 '@scope/my-plugin'
```

loader 按 **id** 寻址。用户可在自己 profile 的 `cordis.patch.yml` 里按 id 覆盖配置或禁用：

```yaml
- id: my-plugin
  disabled: true
- id: my-plugin
  config:
    maxIndexedFiles: 10000
```

## 三、Host 半区开发

入口导出 `{ name, inject, apply }`，`inject` 列出 apply 里要用的 Cordis 服务名：

```js
export const name = 'my-plugin';
const inject = ['settings', 'commands', 'webServer'];  // 需要的服务
export { inject };

export function apply(ctx) {
  // 1) 设置作用域（@deepseek-ai/dsh-settings，持久化到 $DSH_HOME/settings.yaml）
  const scope = ctx.settings.register('my-plugin', z.object({
    enabled: z.boolean().default(true),
    volume: z.number().min(0).max(1).step(0.01).default(0.8),
  }), { base: {} });
  scope.get();           // 读解析后的值
  await scope.update({ volume: 0.5 });  // 写（深合并进用户分区，JSON 兼容数据）

  // 2) 斜杠命令（@deepseek-ai/dsh-commands）
  ctx.commands.register({
    name: 'my-plugin',
    input: { hint: 'status | foo' },
    recordInput: false,                       // 不污染对话记录
    handler: async (invocation) => {
      const raw = (invocation.rawInput ?? '').trim();
      return { kind: 'success', text: JSON.stringify(payload) };  // 或 { kind: 'error', text }
    },
  });

  // 3) Agent 工具（@deepseek-ai/dsh-tools）
  ctx.tools.register(defineTool({
    name: 'my_tool', description: '...', parameters: {},
    async execute(_args, exec) { return { ok: true }; },
  }));

  // 4) HTTP 路由（@deepseek-ai/dsh-host-webserver）
  //    ⚠️ 必须用 ctx.inject 延迟挂载（服务激活是 availability-driven，直接访问可能还没就绪）
  ctx.inject(['webServer'], (webCtx) => {
    const dispose = webCtx.webServer.register({
      kind: 'prefix',                         // 或 'exact'
      path: '/my-plugin',
      handler: async (req, res) => { /* node:http 语义，自己写 JSON/静态/404 */ },
    });
    webCtx.effect(() => dispose);
  });
}
```

**实用原则**：设置卡片这类 UI 的读写，直接用插件自己的 **HTTP JSON API**（`GET/POST /my-plugin/api/*`），**不要走会话级命令 RPC**——命令通道依赖有效会话，设置页里没有会话时会静默失败。Host 侧在 `fileURLToPath(ctx.baseUrl)` 拿到 profile 目录，可把用户文件存到 `<profile>/.my-plugin/` 再经路由回放。

## 四、Client 半区开发

浏览器 bundle 是**固定契约格式**——单文件调用 `window.__ModuleLoader__.load({ id, factory })`，factory 里 `require('react')` 等注入包，最后导出 `{ name, inject, apply }`：

```js
window.__ModuleLoader__.load({
  id: 'my-plugin',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    let react = require('react');
    // ...组件与逻辑...
    function apply(ctx) {
      // 全局槽位（设置页卡片）：settings.section
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'my-plugin', order: 30, label: '我的插件',
      }, (props) => react.createElement(MyCard, props)));
      // 会话级槽位（能拿到 useSession + sessionId）：conversation.session.header.utilities
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities', id: 'my-plugin', order: 10,
      }, (props) => react.createElement(MyDetector, props)));
    }
    exports.name = 'my-plugin';
    exports.inject = ['slots', 'remote', 'remote.commands'];
    exports.apply = apply;
    return module.exports;
  },
});
```

### 槽位 props（框架注入）

- **会话级槽位**：`useSession`（选择器钩子，快照类型 `ConversationSnapshot`）、`sessionId`、`useInput`、`inputActions`
- **全局槽位**：`useSessions`（会话列表）、`useWorkspaces`
- 常用槽位名：`settings.section`、`conversation.session.header.utilities`、`conversation.session.header.actions`、`conversation.view`、`shell.overlay`（全局浮层）

### 监听"一轮对话结束"的权威姿势

`ConversationSnapshot` 里（`@deepseek-ai/dsh-client-runtime`）：
- `partial`：正在流式输出的助手内容（null = 没在生成）
- `running`：会话是否在跑
- `chat.timeline.turns`：**每个已闭合回合的 `turn/end` 事件**，其 `data.reason.kind` 是权威结束原因：
  `completed`（正常）/ `aborted`（手动中断）/ `error`（出错）/ `max-tokens`（超长截断）/ `blocked`（策略拦截）

**推荐检测器**（dsh-done-sound 最终版）：以"新出现的 turn/end reason"为唯一触发信号——

```js
const snap = useSession((s) => {
  let endReason = null, endTurn = 0;
  const turns = s && s.chat && s.chat.timeline ? s.chat.timeline.turns : null;
  if (turns) turns.forEach((loc, turn) => {
    const reason = loc && loc.end && loc.end.data && loc.end.data.reason;
    if (reason && typeof reason.kind === 'string' && turn > endTurn) { endTurn = turn; endReason = reason.kind; }
  });
  return { sessionId: s.sessionId, streaming: s.partial !== null || s.running === true, endReason, endTurn };
});

useEffect(() => {
  if (!snap) return;
  if (snap.sessionId !== lastSessionRef.current) {   // 挂载/切会话：播种，绝不回放历史
    lastSessionRef.current = snap.sessionId;
    lastEndTurnRef.current = snap.endTurn;
    pendingReasonRef.current = null;
    return;
  }
  if (snap.endTurn > lastEndTurnRef.current) {       // 新闭合回合 = 结束信号
    lastEndTurnRef.current = snap.endTurn;
    if (snap.endReason !== null) pendingReasonRef.current = snap.endReason;
  }
  if (snap.streaming) return;                        // 流式中不动作（reason 先暂存）
  if (pendingReasonRef.current === null) return;
  const reason = pendingReasonRef.current;
  pendingReasonRef.current = null;
  // reason -> 'completed' 正常 / 'aborted|blocked' 中断 / 'error|max-tokens' 出错
  // 按各自开关决定是否播放
}, [snap, cfg]);
```

这样**快慢对话都不漏**（不依赖流式转移观测）、**中断/出错不错判**（只看权威 reason，不猜节点类型）、**挂载不误播**、**跨会话不串**。

## 五、开发调试流程

```sh
# 1) 本地 link 安装（改动即时可见，改 Host 重启、改 client 刷新）
dsh plugin --profile web add link:F:\path\to\my-plugin
dsh web

# 2) 构建 Host 产物（自包含，避免 symlink 依赖解析问题）
#    插件目录放 pnpm-workspace.yaml：autoInstallPeers: false（peer 只作声明，不装）
pnpm install -D esbuild
NODE_PATH="C:\Users\Administrator\.dsh\profiles\web\node_modules" \
  node_modules/@esbuild/win32-x64/esbuild.exe src/index.js \
  --bundle --format=esm --platform=node --target=node22 --outfile=lib/index.js

# 3) 验证
dsh --profile web --dump-config | findstr my-plugin   # 组合树里有插件行
node test/host.test.mjs                                # 隔离测试（mock ctx 驱动 apply + 路由）
```

### 本机环境注意（Windows + 沙箱实测）

- `dsh plugin` 内嵌 pnpm 走 **corepack**：`E:\...\nodejs\node_modules\corepack\dist\pnpm.js`；沙箱会拦工作区外执行，需要相应权限
- pnpm 锁文件有 `minimumReleaseAge` 策略：装社区新包可能被拦，临时放宽用 `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0`
- **symlink 坑**：`link:` 安装的插件在 profile 里是符号链接，Node 从**真实路径**解析其内部依赖（找不到 profile 的 node_modules）→ Host 必须构建成**自包含单文件**（内联 schemastery 等），只留 `node:` 内建依赖
- esbuild 是第三方原生二进制，沙箱默认拒执行，需提权

## 六、测试（不依赖 GUI 的验证）

- **Host 隔离测试**：mock 掉 `settings/commands/webServer`，直接 `apply()` + 驱动路由 handler（fake req/res，注意 EventEmitter 的"先挂监听再 emit"时序），覆盖上传→存储→回放→配置→清除→错误分支
- **检测器决策表仿真**：把检测逻辑镜像成纯函数，穷举"reason × 开关 × 时序（同帧/晚一拍/流式中暂存）"组合
- 保持镜像与真实代码**手动同步**，注释里写明"MIRRORS lib/client.js"

## 七、发布与上架

```sh
# 1) 发布到 npm（需要 npm 账号登录）
cd my-plugin
npm publish

# 2) 上架插件市场：在 awesome-dsh-plugin 列表提 PR 加一行
#    https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
#    站点 CI 每日刷新 plugins.json，dshmarket 自动收录（通常一天内生效）
```

**在插件详情页放网盘音效库链接**：dshmarket 的插件详情页会渲染插件 **README.md**，所以把网盘链接写进 README 即可（示例见下节）。建议同时提供 GitHub Release 通道作为网盘外的备选。

## 八、踩坑实录（本次实战全记录）

| 坑 | 现象 | 解法 |
|---|---|---|
| 设置卡片全失效、卡"读取配置中" | 初始 `status` 命令没返回 | 命令 RPC 依赖会话 → 改走插件自己的 HTTP JSON API（fetch，无会话依赖） |
| webServer 没就绪 | Host 入口可能整体挂掉 | 路由用 `ctx.inject(['webServer'], cb)` 延迟挂载 |
| 清除按钮 404 | 客户端按"有没有 body"隐式发 GET | fetch 显式 method；`run()` 一律 POST |
| 中断/出错误判为正常完成 | 快照时序竞态（running=false 先到，节点/reason 后到） | 只用 `turn/end` reason 权威信号；信号没到就推迟，绝不猜 |
| 快对话不漏 | 依赖"流式→空闲"转移观测会漏短回合 | 触发信号改为"新出现的 turn/end reason"，不依赖转移 |
| 挂载/切会话误播或静默 | 历史回合被当成刚完成 / turn 编号跨会话泄漏 | 挂载时播种当前 turn 编号；sessionId 变化重置全部状态 |
| 音量滑块卡顿 | 每次拖动一个网络往返 + 请求期间禁用 | 本地即时值 + 300ms 防抖写盘 + 不禁用 |
| 1% 音量写不进 | Host schema `step(0.05)` 校验拒绝 | schema 步长放宽到 0.01（改 Host 需重启） |
| link 插件内部依赖解析失败 | `Cannot find package '@deepseek-ai/...'` | Host 用 esbuild 打成自包含产物 |
| pnpm 安装被 supply-chain 策略拦 | `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` | `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0`（仅本次） |
| peer 依赖被 pnpm 尝试拉取 | 404 `@deepseek-ai/*` | 插件目录加 `pnpm-workspace.yaml`：`autoInstallPeers: false` |

## 九、音效库网盘链接模板（放进插件 README）

```markdown
## 音效库下载

内置提示音不够用？社区精选音效库（百度网盘，永久有效）：

- 链接：https://pan.baidu.com/s/你的分享ID
- 提取码：xxxx
- 内容：按 完成/中断/出错/轻柔/俏皮 分类的 30+ 个 wav/mp3 提示音

下载解压后，在 设置 → 对话完成音效 → 选择音频 中选用即可。
```

要点：
- 网盘分享时选**永久有效**（避免链接过期）
- 提取码和链接分开写，方便以后单独更换提取码
- 目录按场景分文件夹，README 里写清楚
- 海外用户访问网盘不便 → 可额外把音效库打进 **GitHub Release** 附件，README 放双通道

---

*文档对应代码：`dsh-done-sound/`（src/index.js + lib/client.js + test/）*
