# Changelog

## [0.1.8] - 2026-08-26

- feat: 导出日志成功后显示绿色提示横幅——包含保存文件名和原始日志文件的完整路径（复制到 Windows 资源管理器地址栏即可打开），方便用户定位日志排查问题；浏览器不支持保存对话框时提示文件已存到默认下载文件夹
- fix: 刷新页面后自动重连倒计时错用 60 秒——client 配置存储初始值为 60 秒，之前只在设置卡片挂载时才从 Host 同步真实值，刷新页面后若先触发报错，倒计时和自动重连就错用初始值；现在插件激活时即预热同步 Host 持久化配置，detector 挂载时再兜底同步一次，保证倒计时使用用户保存的秒数

## [0.1.7] - 2026-08-26

- chore: 重新发布——0.1.6 的 README 数据经 npm 官方 registry 逐字节核对完全正常（干净 UTF-8 中文），但 npm 包详情页的显示缓存未更新（页面提示 "This package does not have a README"）；发布本版本以强制刷新 npm 网页缓存
- chore: `.gitignore` 补上 `.cm*.txt` 规则，防止提交信息临时文件误入仓库

## [0.1.6] - 2026-08-26

- feat: 日志文件路径改为 `logs/` 目录下的 `YYYYMMDD-dsh-done-sound.log`——不再每天建立日期子文件夹，logs 下直接按天一个文件
- feat: 设置卡片新增「导出日志」按钮——点击后弹出浏览器保存对话框，可自定义导出位置；默认文件名即当天日志文件名（host 新增 `GET /dsh-done-sound/api/log/export`）

## [0.1.5] - 2026-08-26

- feat: file logging — browser diagnostics now survive a closed DevTools. The client mirrors its console lines (audio play failures ×2, auto-retry success/failure) and the host logs key operations (audio saved/cleared, command/API errors) into `<pluginRoot>/logs/YYYYMMDD/dsh-done-sound.log` — a fresh file every day, one per date folder. Transport is `POST /dsh-done-sound/api/log` (client-reported lines tagged `CLIENT-*`); `GET /dsh-done-sound/api/log` and the settings card show today's log file path. Logging is strictly best-effort and can never crash the plugin
- fix: README Chinese text was mojibake (wrong GBK re-encode) — rewritten as clean UTF-8

## [0.1.4] - 2026-08-25

- feat: show installed plugin version + npm latest-version check in the settings card (red when an update is available, green when up to date)
- feat: auto-retry on error — after the model exhausts its own retries and the turn ends in error, the plugin waits a configurable window (default 60s, 10-300s) then sends "继续" to resume; cancelled automatically if the session recovers during the window (new `autoRetryOnError` toggle + `retryDelaySeconds`, default on)
- feat: visible countdown chip in the session header during the auto-retry window; module-level timer so "继续" still fires if you navigate away
- feat: countdown chip made much more prominent — amber gradient pill with a pulsing animation and a large seconds counter; settings-card countdown line also highlighted
- feat: retry-delay input saved via an explicit "确定" button (local draft while typing, commit on OK/Enter/blur, green "已保存 ✓" feedback)
- fix: retry-delay value was never persisted — the host `/api/config` handler dropped `retryDelaySeconds`, so changing it to e.g. 15 and reopening showed 60 again; host now saves it (10-300, rounded to 5s steps) and the client verifies the host actually persisted the value
- fix: auto-retry "继续" was never actually sent — the client injected only `remote`, where no `sessions` namespace exists, so the send guard silently skipped (the countdown ran, then nothing happened). The retry now sends through `ctx.connection.api.sessions.prompt` — the exact same browser→host RPC route the composer's send uses — and failures are no longer silent: console error + a "自动发送「继续」失败" row in the settings card; the header countdown line now also appears in the settings card while armed
- feat: upload limit raised 2MB → 10MB (covers 8MB-class sound-library files)
- fix: no false "completed" trigger on app open — detector waits for history to settle (openState 'open') before listening
- fix: the pending ("waiting for you") chime sometimes never played — it only fired on the 0→N rising edge of the pending count, so a *replacement* wait (one approval resolved while the next is requested, count stays at 1) and a wait already pending at page-load were both missed. Pending items are now fingerprinted individually (`approvalId`/`questionRpcId`), the chime fires on any *new* waiting item, and it also notifies once on mount if the conversation is already waiting; if no audio URL is known the detector re-fetches status once instead of skipping, and `Audio.play()` rejections are logged instead of swallowed

## [0.1.3] - 2026-08-23

- feat: bundled default sound — plays when no custom audio is configured (ships `assets/turn-done.wav`)
- feat: alert when the agent is waiting for human confirmation (approval wait), new `playOnPending` toggle (default on)
- fix: detector self-heals stale config — re-fetches status once when a turn finishes but no audio URL is known yet

## [0.1.2] - 2026-08-23

- ci: publish via GitHub Actions using `NPM_TOKEN` secret (OIDC trusted publishing returned 404 for this package)
- docs: add Baidu Netdisk community sound library link

## [0.1.1] - 2026-08-23

- chore: version bump; README sound-library section

## [0.1.0] - 2026-08-23

- feat: initial release — play a user-chosen sound when a conversation finishes
  - settings card (choose audio, preview, clear, volume 1% step)
  - turn/end reason-based completion detection (completed / aborted / error / max-tokens / blocked)
  - interrupt & error toggles (defaults: interrupt off, error on)
  - same-origin JSON API + webServer audio route, no session dependency
