# dsh-done-sound

DeepSeek Harness Web GUI 的对话音效插件。不同触发情况可以分别设置音频提醒，并为每种情况提供内置默认音效。

## 功能

- **五种场景独立配置**：正常完成、中断、出错、等待确认、自动重连成功各自使用独立音频，可分别选择、试听和清除。
- **内置默认音效**：即使没有上传任何文件，也会使用对应场景的默认音效：
  - 正常完成：`turn-done.wav`
  - 中断：`turn-interrupt.wav`
  - 出错：`turn-error.wav`
  - 等待确认：`turn-pending.wav`
  - 自动重连成功：`turn-retry.wav`
- **音频格式**：支持 `mp3`、`wav`、`ogg`、`webm`、`m4a`、`aac`、`flac`，单个文件最大 10MB。
- **完成检测**：根据宿主 `turn/end` 事件的 reason 判断正常完成、中断、出错和超长截断，避免误触发；每轮只播放一次。
- **触发开关**：
  - `中断时也响`：手动停止生成时是否播放，默认关闭。
  - `出错时也响`：对话以错误结束或超长截断时是否播放，默认开启。
  - `等待确认提醒`：Agent 等待批准、提问或其他人工确认时是否播放，默认开启。
  - `重连成功也响`：自动发送「继续」成功后是否播放专属音效，默认开启。
  - `出错自动重连`：出错后是否自动发送「继续」重试，默认开启。
- **自动重连等待时间**：可设置 10-300 秒，按 5 秒步进；等待期间显示倒计时，若会话自行恢复则自动取消。
- **全局音量**：统一调节五种场景的播放音量。
- **版本检查**：设置卡片显示当前版本和更新状态。
- **日志与导出**：Host 和 Client 诊断日志保存到 profile 目录，可从设置卡片导出当天日志。

## 安装

```sh
dsh plugin --profile web add dsh-done-sound
```

本地开发：

```sh
dsh plugin --profile web add link:F:\0.AI-CodeProject\DSHProject\0.日常聊天\dsh-done-sound
```

安装后重启 `dsh web`，打开设置页即可看到「对话完成音效」卡片。

升级已有安装后，请重启 `dsh web` 使 Host 端更新生效。旧版本中保存的单个自定义音频会自动作为「正常完成」音保留，不会丢失。

## 配置位置

设置 → 对话完成音效中会显示五行独立音频配置。每行都可以选择文件、试听或清除当前自定义音频；清除后会恢复该场景的内置默认音效。

自定义音频文件保存在 profile 目录的 `.dsh-done-sound/` 中，配置保存在 DSH 设置中。Host 音频路由为：

```text
/dsh-done-sound/audio/<fileId>
```

## 架构

- **Host 半区**（`src/index.js` → 构建产物 `lib/index.js`）：`dsh-done-sound` 设置作用域（`ctx.settings`）、五场景音频文件存储、`webServer` 路由与同源 JSON API（`/dsh-done-sound/api/status|config|audio|clear`）、`dsh-done-sound` 命令。路由经 `ctx.inject(['webServer'], cb)` 延迟挂载；构建时由 esbuild 内联 `@deepseek-ai/schemastery`，产物自包含（link 安装时无需依赖 profile 的模块解析）。
- **Client 半区**（`lib/client.js`）：`settings.section` 设置卡片，以 fetch 调用 HTTP API；`conversation.session.header.utilities` 完成检测器订阅会话状态，按场景选择音效并处理等待确认与自动重连倒计时。

## 开发

```sh
pnpm install        # 安装 esbuild
pnpm run build      # 打包 src/index.js -> lib/index.js（自带）
pnpm run check      # 语法检查两个产物
npm test            # Host API 与完成检测测试
```

修改 Host 源码后重新 `pnpm run build`；Client 半区直接改 `lib/client.js`（`__ModuleLoader__` 格式即运行时契约，无需打包）。

## 音效库下载

内置提示音不够用？社区精选音色库（百度网盘，永久有效）：

- 链接：https://pan.baidu.com/s/1xnef4xkCy8pkooXMGi2ApQ?pwd=1234
- 提取码：1234

下载解压后，在 设置 → 对话完成音效 → 对应场景 → 选择音频 中选用即可。

## License

MIT
