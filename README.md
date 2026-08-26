# dsh-done-sound

DeepSeek Harness Web GUI 的「对话完成音效」插件：你在设置里选一段音频，每次 Agent 完整结束一轮对话时自动播放提示音。

## 功能

- **设置卡片**（设置 → 对话完成音效）：选择音频文件（mp3 / wav / ogg / webm / m4a / aac / flac，≤2MB）、试听、清除、音量调节。
- **完成检测**：以宿主 `turn/end` 事件的 reason（正常/中断/出错/超长）为权威触发信号，快慢对话都不漏、不误判；每轮只响一次。
- **触发开关**：
  - `中断时也响`（默认**关**）：手动停止生成时是否也播放。
  - `出错时也响`（默认**开**）：对话以错误结束（turn-error / 超长截断）时是否也播放。
- **确认等待提醒**：对话中出现等待确认 / 提问时播放提示音。
- **出错自动重连**：对话报错后自动发送「继续」重试（可配置等待秒数）。
- **版本检查**：设置卡片显示当前版本与更新状态。
- 音频文件保存在 profile 目录 `.dsh-done-sound/`，经 Host 路由 `/dsh-done-sound/audio/<fileId>` 播放，配置持久化在设置中。

## 安装

```sh
dsh plugin --profile web add dsh-done-sound
```

本地开发：

```sh
dsh plugin --profile web add link:F:\0.AI-CodeProject\DSHProject\0.日常聊天\dsh-done-sound
```

安装后重启 `dsh web`，打开设置页即可看到「对话完成音效」卡片。

## 架构

- **Host 半区**（`src/index.js` → 构建产物 `lib/index.js`）：`dsh-done-sound` 设置作用域（`ctx.settings`）、音频文件存储、`webServer` 路由与同源 JSON API（`/dsh-done-sound/api/status|config|audio|clear`）、`dsh-done-sound` 命令。路由经 `ctx.inject(['webServer'], cb)` 延迟挂载；构建时由 esbuild 内联 `@deepseek-ai/schemastery`，产物自包含（link 安装时无需依赖 profile 的模块解析）。
- **Client 半区**（`lib/client.js`）：`settings.section` 设置卡片，以 fetch 调用 HTTP API，不依赖会话/命令 RPC；`conversation.session.header.utilities` 完成检测器（`useSession` 订阅 `ConversationSnapshot`，由 `partial/running → 空闲` 转移触发，按最后节点 `seq` 去重）。

## 开发

```sh
pnpm install        # 安装 esbuild
pnpm run build      # 打包 src/index.js -> lib/index.js（自带）
pnpm run check      # 语法检查两个产物
```

修改 host 源码后重新 `pnpm run build`；client 半区直接改 `lib/client.js`（`__ModuleLoader__` 格式即运行时契约，无需打包）。

## 音效库下载

内置提示音不够用？社区精选音色库（百度网盘，永久有效）：

- 链接：https://pan.baidu.com/s/1xnef4xkCy8pkooXMGi2ApQ?pwd=1234
- 提取码：1234

下载解压后，在 设置 → 对话完成音效 → 选择音频 中选用即可。

## License

MIT
