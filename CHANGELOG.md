# Changelog

## [0.1.4] - 2026-08-25

- feat: show installed plugin version + npm latest-version check in the settings card (red when an update is available, green when up to date)
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
