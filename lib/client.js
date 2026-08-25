/**
 * dsh-done-sound — browser half.
 *
 * Two surfaces:
 *  1. A Settings card (`settings.section`): pick an audio file (uploaded to
 *     the host via the same-origin JSON API, served back over
 *     `/dsh-done-sound/audio/<fileId>`), preview, volume, and the enabled /
 *     interrupt / error switches. Transport is plain fetch to the plugin's
 *     HTTP API — no session, no slash-command RPC involved.
 *  2. A zero-render detector mounted in `conversation.session.header.utilities`
 *     (session scope, receives `useSession` + `sessionId`): watches the
 *     ConversationSnapshot and plays the chime when a turn finishes.
 */
window.__ModuleLoader__.load({
  id: 'dsh-done-sound',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    let react = require('react');

    // ---- styles (injected once, dsh-balance data-plugin-css pattern) ----
    const CSS_ID = 'dsh-done-sound/styles';
    const css = [
      '.dtc-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:10px;flex-direction:column;gap:10px;padding:12px 14px;font-size:13px;line-height:1.5;display:flex}',
      '.dtc-head{justify-content:space-between;align-items:center;gap:8px;font-weight:600;display:flex}',
      '.dtc-row{justify-content:space-between;align-items:center;gap:12px;display:flex}',
      '.dtc-muted{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dtc-err{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;font-size:12px}',
      '.dtc-btn{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:6px;padding:3px 12px;font-size:12px;white-space:nowrap}',
      '.dtc-btn:disabled{opacity:.5;cursor:default}',
      '.dtc-file{display:inline-flex;align-items:center}',
      '.dtc-file input{display:none}',
      '.dtc-slider{flex:1;max-width:220px}',
      '.dtc-vol{min-width:44px;text-align:right;font-variant-numeric:tabular-nums}',
      '.dtc-toggle{display:flex;align-items:center;gap:6px;cursor:pointer}',
      '.dtc-update{color:var(--dsw-alias-state-error-primary);font-weight:600}',
      '.dtc-uptodate{color:var(--dsw-alias-state-success-primary)}',
    ].join('');
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_ID) + ']') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-done-sound';
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // ---- i18n ----
    const COPY = {
      zh: {
        title: '对话完成音效',
        enabled: '启用',
        enabledHint: '每轮对话完整结束时播放提示音',
        volume: '音量',
        audio: '音频',
        none: '未设置',
        pick: '选择音频…',
        preview: '试听',
        clear: '清除',
        interrupt: '中断时也响',
        interruptHint: '手动停止生成时也播放（默认关闭）',
        error: '出错时也响',
        errorHint: '对话以错误结束时也播放（默认开启）',
        pending: '等待确认时提醒',
        pendingHint: 'Agent 需要你确认操作（如审批）而停住等待时播放提醒（默认开启）',
        version: '当前版本',
        updateAvailable: '有新版本',
        upToDate: '已是最新',
        updateCheckFailed: '无法检查更新',
        saved: '已保存：',
        readFailed: '读取文件失败',
        apiFailed: '无法连接插件服务（Host 未加载？），请重启 dsh web',
        noSession: '打开一个会话后配置',
        loading: '读取配置中…',
        lastTrigger: '最近触发',
        evNormal: '正常完成',
        evInterrupt: '中断',
        evError: '出错',
        evPending: '等待确认',
        evPlayed: '已播放',
        evNotPlayed: '未播放',
      },
      en: {
        title: 'Turn Chime',
        enabled: 'Enabled',
        enabledHint: 'Play a chime when a turn finishes',
        volume: 'Volume',
        audio: 'Audio',
        none: 'None',
        pick: 'Choose audio…',
        preview: 'Preview',
        clear: 'Clear',
        interrupt: 'Play on interrupt',
        interruptHint: 'Also play when generation is stopped (default off)',
        error: 'Play on error',
        errorHint: 'Also play when a turn ends in error (default on)',
        pending: 'Alert on approval wait',
        pendingHint: 'Play a reminder when the agent is waiting for your confirmation (default on)',
        version: 'Version',
        updateAvailable: 'Update available',
        upToDate: 'Up to date',
        updateCheckFailed: 'Update check failed',
        saved: 'Saved:',
        readFailed: 'Failed to read file',
        apiFailed: 'Cannot reach the plugin host service (host not loaded?), restart dsh web',
        noSession: 'Open a session to configure',
        loading: 'Loading…',
        lastTrigger: 'Last trigger',
        evNormal: 'completed',
        evInterrupt: 'interrupted',
        evError: 'error',
        evPending: 'approval wait',
        evPlayed: 'played',
        evNotPlayed: 'not played',
      },
    };
    function resolveLang() {
      if (typeof document !== 'undefined') {
        const host = document.documentElement.lang || navigator.language || 'zh-CN';
        return /^zh/i.test(host) ? 'zh' : 'en';
      }
      return 'zh';
    }
    function t(lang, key) {
      return COPY[lang][key] ?? COPY.zh[key] ?? String(key);
    }
    function formatSize(bytes) {
      if (!bytes) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }
    function formatEventTime(at) {
      try {
        return new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
      } catch {
        return '';
      }
    }
    function compareVersions(a, b) {
      const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
      const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff > 0 ? 1 : -1;
      }
      return 0;
    }

    // ---- tiny shared config store (card writes, detector reads) ----
    const configStore = {
      value: {
        enabled: true,
        volume: 0.8,
        playOnInterrupt: false,
        playOnError: true,
        playOnPending: true,
        version: null,
        latestVersion: null,
        updateStatus: null, // 'update' | 'uptodate' | 'error' | null
        url: null,
        defaultUrl: null,
        fileName: '',
        mime: '',
        size: 0,
        loaded: false,
        lastEvent: null,
      },
      listeners: new Set(),
    };
    function setConfig(patch) {
      configStore.value = { ...configStore.value, ...patch };
      configStore.listeners.forEach((fn) => {
        try {
          fn(configStore.value);
        } catch {
          // listener errors must not break the store
        }
      });
    }
    function subscribeConfig(fn) {
      configStore.listeners.add(fn);
      return () => configStore.listeners.delete(fn);
    }
    function useConfig() {
      const [cfg, setCfg] = react.useState(configStore.value);
      react.useEffect(() => subscribeConfig(setCfg), []);
      return cfg;
    }
    function playChime(cfg) {
      const url = cfg.url || cfg.defaultUrl;
      if (!cfg.enabled || !url) return;
      try {
        const audio = new Audio(url);
        audio.volume = cfg.volume;
        audio.play().catch(() => {});
      } catch {
        // ignore playback failures (autoplay policy, missing audio device)
      }
    }

    // ---- same-origin JSON API transport (no session needed) ----
    async function api(pathname, { method = 'GET', body } = {}) {
      let res;
      try {
        res = await fetch(
          pathname,
          method === 'GET'
            ? { method: 'GET' }
            : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) },
        );
      } catch (e) {
        throw new Error('network: ' + (e && e.message ? e.message : String(e)));
      }
      let payload = null;
      try {
        payload = await res.json();
      } catch {
        // non-JSON response
      }
      if (!res.ok || !payload || payload.ok === false) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'HTTP ' + res.status;
        throw new Error(message);
      }
      return payload;
    }

    function apply(ctx) {
      const syncConfig = (payload) => {
        if (!payload || typeof payload !== 'object') return;
        setConfig({
          enabled: payload.enabled === true,
          volume: typeof payload.volume === 'number' ? payload.volume : 0.8,
          playOnInterrupt: payload.playOnInterrupt === true,
          playOnError: payload.playOnError !== false,
          playOnPending: payload.playOnPending !== false,
          version: typeof payload.version === 'string' ? payload.version : null,
          url: typeof payload.url === 'string' && payload.url ? payload.url : null,
          defaultUrl: typeof payload.defaultUrl === 'string' && payload.defaultUrl ? payload.defaultUrl : null,
          fileName: payload.audio && typeof payload.audio.fileName === 'string' ? payload.audio.fileName : '',
          mime: payload.audio && typeof payload.audio.mime === 'string' ? payload.audio.mime : '',
          size: payload.audio && typeof payload.audio.size === 'number' ? payload.audio.size : 0,
          loaded: true,
        });
      };

      // ---- Settings card (global slot) ----
      const TurnChimeCard = (props) => {
        const cfg = useConfig();
        const [error, setError] = react.useState(null);
        const [busy, setBusy] = react.useState(false);
        const [lang] = react.useState(resolveLang());
        const L = (key) => t(lang, key);

        react.useEffect(() => {
          let disposed = false;
          (async () => {
            try {
              const payload = await api('/dsh-done-sound/api/status');
              if (!disposed) {
                syncConfig(payload);
                checkLatestVersion(typeof payload.version === 'string' ? payload.version : null);
              }
            } catch (e) {
              if (!disposed) {
                setError(L('apiFailed') + ' (' + (e && e.message ? e.message : String(e)) + ')');
                setConfig({ loaded: true });
              }
            }
          })();
          return () => {
            disposed = true;
          };
        }, []);

        // Query the npm registry for the latest published version and compare
        // with the installed one (red if an update exists, green if up to date).
        const checkLatestVersion = (currentVersion) => {
          if (typeof currentVersion !== 'string' || currentVersion.length === 0) return;
          fetch('https://registry.npmjs.org/dsh-done-sound/latest')
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('http ' + res.status))))
            .then((data) => {
              const latest = data && typeof data.version === 'string' ? data.version : null;
              if (latest === null) {
                setConfig({ updateStatus: 'error' });
                return;
              }
              setConfig({
                latestVersion: latest,
                updateStatus: compareVersions(latest, currentVersion) > 0 ? 'update' : 'uptodate',
              });
            })
            .catch(() => setConfig({ updateStatus: 'error' }));
        };

        const run = async (pathname, body) => {
          setBusy(true);
          setError(null);
          try {
            const payload = await api(pathname, { method: 'POST', body });
            syncConfig(payload);
            return payload;
          } catch (e) {
            setError(L('apiFailed') + ' (' + (e && e.message ? e.message : String(e)) + ')');
            setConfig({ loaded: true });
            return null;
          } finally {
            setBusy(false);
          }
        };

        const onPick = (event) => {
          const file = event.target.files && event.target.files[0];
          if (event.target) event.target.value = '';
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => {
            const dataUrl = String(reader.result || '');
            if (!dataUrl.startsWith('data:')) {
              setError(L('readFailed'));
              return;
            }
            await run('/dsh-done-sound/api/audio', { dataUrl, fileName: file.name });
          };
          reader.onerror = () => setError(L('readFailed'));
          reader.readAsDataURL(file);
        };

        // ---- volume: local draft while dragging + debounced persist ----
        const [volumeDraft, setVolumeDraft] = react.useState(null);
        const volumeTimerRef = react.useRef(null);
        const volumeValue = volumeDraft !== null ? volumeDraft : Math.round((cfg.volume || 0) * 100);

        const onVolumeInput = (e) => {
          const value = Number(e.target.value);
          setVolumeDraft(value);
          if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
          volumeTimerRef.current = setTimeout(async () => {
            volumeTimerRef.current = null;
            try {
              const payload = await api('/dsh-done-sound/api/config', { method: 'POST', body: { volume: value / 100 } });
              syncConfig(payload);
              setVolumeDraft(null); // follow the saved value again
            } catch (err) {
              setError(L('apiFailed') + ' (' + (err && err.message ? err.message : String(err)) + ')');
              setVolumeDraft(null); // write failed -> snap back to saved value
            }
          }, 300);
        };
        react.useEffect(() => () => {
          if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
        }, []);

        return react.createElement(
          'div',
          { className: 'dtc-card' },
          react.createElement(
            'div',
            { className: 'dtc-head' },
            react.createElement('span', null, L('title')),
            react.createElement(
              'label',
              { className: 'dtc-toggle' },
              react.createElement('input', {
                type: 'checkbox',
                checked: cfg.enabled,
                disabled: busy,
                onChange: (e) => {
                  run('/dsh-done-sound/api/config', { enabled: e.target.checked });
                },
              }),
              react.createElement('span', null, L('enabled')),
            ),
          ),

          // version + update status row (red when an update is available)
          react.createElement(
            'div',
            { className: 'dtc-row' },
            react.createElement(
              'span',
              null,
              L('version') + '：' + (cfg.version || '—'),
            ),
            cfg.updateStatus === 'update'
              ? react.createElement('span', { className: 'dtc-update' }, L('updateAvailable') + (cfg.latestVersion ? ' v' + cfg.latestVersion : ''))
              : cfg.updateStatus === 'uptodate'
                ? react.createElement('span', { className: 'dtc-uptodate' }, L('upToDate'))
                : cfg.updateStatus === 'error'
                  ? react.createElement('span', { className: 'dtc-muted' }, L('updateCheckFailed'))
                  : null,
          ),

          react.createElement(
            'div',
            { className: 'dtc-row' },
            react.createElement('span', { className: 'dtc-muted' }, L('audio') + '：' + (cfg.fileName || L('none')) + (cfg.size ? ' (' + formatSize(cfg.size) + ')' : '')),
          ),
          react.createElement(
            'div',
            { className: 'dtc-row' },
            react.createElement(
              'label',
              { className: 'dtc-btn dtc-file' },
              react.createElement('input', { type: 'file', accept: 'audio/*', disabled: busy, onChange: onPick }),
              L('pick'),
            ),
            react.createElement(
              'button',
              { className: 'dtc-btn', type: 'button', disabled: busy || !cfg.url, onClick: () => playChime(cfg) },
              L('preview'),
            ),
            react.createElement(
              'button',
              { className: 'dtc-btn', type: 'button', disabled: busy || !cfg.url, onClick: () => run('/dsh-done-sound/api/clear', {}) },
              L('clear'),
            ),
          ),

          react.createElement(
            'div',
            { className: 'dtc-row' },
            react.createElement('span', null, L('volume')),
            react.createElement('input', {
              className: 'dtc-slider',
              type: 'range',
              min: 0,
              max: 100,
              step: 1,
              value: volumeValue,
              onChange: onVolumeInput,
            }),
            react.createElement('span', { className: 'dtc-vol dtc-muted' }, volumeValue + '%'),
          ),

          react.createElement(
            'div',
            { className: 'dtc-row' },
            react.createElement(
              'label',
              { className: 'dtc-toggle' },
              react.createElement('input', {
                type: 'checkbox',
                checked: cfg.playOnInterrupt,
                disabled: busy,
                onChange: (e) => {
                  run('/dsh-done-sound/api/config', { playOnInterrupt: e.target.checked });
                },
              }),
              react.createElement('span', null, L('interrupt')),
            ),
            react.createElement('span', { className: 'dtc-muted' }, L('interruptHint')),
          ),
          react.createElement(
            'div',
            { className: 'dtc-row' },
            react.createElement(
              'label',
              { className: 'dtc-toggle' },
              react.createElement('input', {
                type: 'checkbox',
                checked: cfg.playOnError,
                disabled: busy,
                onChange: (e) => {
                  run('/dsh-done-sound/api/config', { playOnError: e.target.checked });
                },
              }),
              react.createElement('span', null, L('error')),
            ),
            react.createElement('span', { className: 'dtc-muted' }, L('errorHint')),
          ),
          react.createElement(
            'div',
            { className: 'dtc-row' },
            react.createElement(
              'label',
              { className: 'dtc-toggle' },
              react.createElement('input', {
                type: 'checkbox',
                checked: cfg.playOnPending,
                disabled: busy,
                onChange: (e) => {
                  run('/dsh-done-sound/api/config', { playOnPending: e.target.checked });
                },
              }),
              react.createElement('span', null, L('pending')),
            ),
            react.createElement('span', { className: 'dtc-muted' }, L('pendingHint')),
          ),

          error !== null && react.createElement('div', { className: 'dtc-err' }, error),
          !cfg.loaded && react.createElement('div', { className: 'dtc-muted' }, L('loading')),
          cfg.lastEvent &&
            react.createElement(
              'div',
              { className: 'dtc-muted' },
              L('lastTrigger') +
                '：' +
                formatEventTime(cfg.lastEvent.at) +
                ' ' +
                (cfg.lastEvent.kind === 'interrupt'
                  ? L('evInterrupt')
                  : cfg.lastEvent.kind === 'error'
                    ? L('evError')
                    : cfg.lastEvent.kind === 'pending'
                      ? L('evPending')
                      : L('evNormal')) +
                ' → ' +
                (cfg.lastEvent.play ? L('evPlayed') : L('evNotPlayed')),
            ),
        );
      };

      // ---- Turn-completion detector (session scope: gets useSession) ----
      //
      // Trigger = a NEWLY-seen turn/end reason (the authoritative signal the
      // host always appends: completed | aborted | error | max-tokens |
      // blocked). No dependence on observing a streaming->idle transition, so
      // fast turns cannot be missed. On mount/session-switch we seed the
      // current turn number and never play history.
      const TurnChimeDetector = (props) => {
        const useSession = props.useSession;
        const cfg = useConfig();
        const pendingReasonRef = react.useRef(null);
        const lastEndTurnRef = react.useRef(0);
        const lastSessionRef = react.useRef(null);
        const prevPendingRef = react.useRef(false);
        const seededRef = react.useRef(false);

        const snap =
          typeof useSession === 'function'
            ? useSession((s) => {
                let endReason = null;
                let endTurn = 0;
                const turns = s && s.chat && s.chat.timeline ? s.chat.timeline.turns : null;
                if (turns) {
                  turns.forEach((loc, turn) => {
                    const reason = loc && loc.end && loc.end.data && loc.end.data.reason;
                    if (reason && typeof reason.kind === 'string' && turn > endTurn) {
                      endTurn = turn;
                      endReason = reason.kind;
                    }
                  });
                }
                return {
                  sessionId: s && typeof s.sessionId === 'string' ? s.sessionId : null,
                  openState: s && typeof s.openState === 'string' ? s.openState : null,
                  streaming: s.partial !== null || s.running === true,
                  endReason,
                  endTurn,
                  // agent is waiting for human intervention (approval etc.)
                  pendingCount: s && Array.isArray(s.pending) ? s.pending.length : 0,
                };
              })
            : null;

        react.useEffect(() => {
          if (snap === null) return;

          // New session (or first mount): reset and wait for the history to
          // settle before listening.
          if (snap.sessionId !== lastSessionRef.current) {
            lastSessionRef.current = snap.sessionId;
            seededRef.current = false;
            pendingReasonRef.current = null;
            lastEndTurnRef.current = 0;
            prevPendingRef.current = false;
          }

          // Before the session window is open, the timeline fills with the
          // conversation history (replayed turn/end events). Do NOT treat that
          // replay as new completions: seed only once openState reaches 'open'
          // (the latest tail is loaded; older pages only add lower turn
          // numbers, which never move endTurn).
          if (!seededRef.current) {
            if (snap.openState === 'open') {
              seededRef.current = true;
              lastEndTurnRef.current = snap.endTurn;
              prevPendingRef.current = snap.pendingCount > 0;
            }
            return;
          }

          // Agent entered a waiting-for-human state (rising edge only).
          if (snap.pendingCount > 0 && !prevPendingRef.current) {
            prevPendingRef.current = true;
            let played = false;
            if (cfg.enabled && cfg.playOnPending && (cfg.url || cfg.defaultUrl)) {
              playChime(cfg);
              played = true;
            }
            setConfig({ lastEvent: { at: Date.now(), kind: 'pending', reason: 'pending', play: played } });
            return;
          }
          prevPendingRef.current = snap.pendingCount > 0;

          // A newly-closed turn is the authoritative "a turn ended" signal.
          if (snap.endTurn > lastEndTurnRef.current) {
            lastEndTurnRef.current = snap.endTurn;
            if (snap.endReason !== null) pendingReasonRef.current = snap.endReason;
          }

          if (snap.streaming) return; // never act mid-stream
          if (pendingReasonRef.current === null) return;

          const reason = pendingReasonRef.current;
          pendingReasonRef.current = null;

          let kind;
          if (reason === 'aborted' || reason === 'blocked') kind = 'interrupt';
          else if (reason === 'error' || reason === 'max-tokens') kind = 'error';
          else kind = 'normal'; // 'completed' (and unknown future reasons default to playing)

          // Fire the chime for a given config view; returns whether it played.
          const effectiveUrlOf = (view) => view.url || view.defaultUrl;
          const firePlay = (view) => {
            if (kind === 'interrupt') {
              if (view.playOnInterrupt && effectiveUrlOf(view)) {
                playChime(view);
                return true;
              }
              return false;
            }
            if (kind === 'error') {
              if (view.playOnError && effectiveUrlOf(view)) {
                playChime(view);
                return true;
              }
              return false;
            }
            if (effectiveUrlOf(view)) {
              playChime(view);
              return true;
            }
            return false;
          };

          let played = firePlay(cfg);
          const record = (value) =>
            setConfig({ lastEvent: { at: Date.now(), kind, reason, play: value } });
          if (!played && !cfg.url && !cfg.defaultUrl) {
            // Self-heal: the in-memory config may be stale (e.g. the audio was
            // uploaded after this page mounted, or in another tab). Re-fetch
            // status once and retry before giving up.
            api('/dsh-done-sound/api/status')
              .then((payload) => {
                if (payload && typeof payload === 'object') {
                  syncConfig(payload);
                  const fresh = {
                    ...cfg,
                    enabled: payload.enabled === true,
                    volume: typeof payload.volume === 'number' ? payload.volume : 0.8,
                    playOnInterrupt: payload.playOnInterrupt === true,
                    playOnError: payload.playOnError !== false,
                    playOnPending: payload.playOnPending !== false,
                    url: typeof payload.url === 'string' && payload.url ? payload.url : null,
                    defaultUrl: typeof payload.defaultUrl === 'string' && payload.defaultUrl ? payload.defaultUrl : null,
                  };
                  record(firePlay(fresh));
                } else {
                  record(false);
                }
              })
              .catch(() => record(false));
          } else {
            record(played);
          }
        }, [snap, cfg]);

        return null;
      };

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'dsh-done-sound',
            order: 30,
            label: '对话完成音效',
          },
          (props) => react.createElement(TurnChimeCard, props),
        ),
      );

      ctx.slots.inject('conversation.session.header.utilities', () =>
        ctx.slots.register(
          {
            name: 'conversation.session.header.utilities',
            id: 'dsh-done-sound',
            order: 10,
            label: '对话完成音效',
          },
          (props) => react.createElement(TurnChimeDetector, props),
        ),
      );
    }

    exports.name = 'dsh-done-sound';
    exports.inject = ['slots', 'remote', 'remote.commands'];
    exports.apply = apply;
    return module.exports;
  },
});
