# Changelog

## [0.1.4] - 2026-08-25

- feat: show installed plugin version + npm latest-version check in the settings card (red when an update is available, green when up to date)
- feat: auto-retry on error — after the model exhausts its own retries and the turn ends in error, the plugin waits a configurable window (default 60s, 10-300s) then sends "继续" to resume; cancelled automatically if the session recovers during the window (new `autoRetryOnError` toggle + `retryDelaySeconds`, default on)
- feat: visible countdown chip in the session header during the auto-retry window; module-level timer so "继续" still fires if you navigate away
- feat: countdown chip made much more prominent — amber gradient pill with a pulsing animation and a large seconds counter; settings-card countdown line also highlighted
- feat: retry-delay input saved via an explicit "确定" button (local draft while typing, commit on OK/Enter/blur, green "已保存 ✓" feedback)
- fix: retry-delay value was never persisted — the host `/api/config` handler dropped `retryDelaySeconds`, so changing it to e.g. 15 and reopening showed 60 again; host now saves it (10-300, rounded to 5s steps) and the client verifies the host actually persisted the value
- feat: upload limit raised 2MB → 10MB (covers 8MB-class sound-library files)
- fix: no false "completed" trigger on app open — detector waits for history to settle (openState 'open') before listening

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
