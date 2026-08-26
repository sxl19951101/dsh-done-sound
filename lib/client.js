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
      '.dtc-num{width:72px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:0 0;border-radius:6px;padding:2px 6px;font-size:12px;font-family:inherit}',
      '.dtc-saved{color:var(--dsw-alias-state-success-primary);font-size:12px;white-space:nowrap}',
      '@keyframes dtc-pulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(245,158,11,.5)}50%{transform:scale(1.06);box-shadow:0 0 0 8px rgba(245,158,11,0)}}',
      '.dtc-retry-chip{display:inline-flex;align-items:center;gap:8px;border:2px solid #f59e0b;border-radius:999px;padding:7px 18px;font-size:15px;font-weight:700;color:#fff;background:linear-gradient(135deg,#f59e0b,#ea580c);white-space:nowrap;font-variant-numeric:tabular-nums;line-height:1.2;animation:dtc-pulse 1.2s ease-in-out infinite}',
      '.dtc-retry-chip .dtc-retry-ico{font-size:17px;line-height:1}',
      '.dtc-retry-chip .dtc-retry-num{font-size:19px;font-weight:800;margin-left:2px}',
      '.dtc-cooldown-line{color:var(--dsw-alias-state-warn-primary,#f59e0b);font-weight:600}',
      '.dtc-logpath{word-break:break-all;text-align:right;max-width:70%;line-height:1.4}',
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
        autoRetry: '报错自动重连',
        autoRetryHint: '模型重试耗尽、报错结束后自动发送「继续」恢复（默认开启）',
        retryDelay: '自动重连等待（秒）',
        retryDelayHint: '报错后等待多久再自动重连；期间恢复则取消（10-300 秒）',
        confirm: '确定',
        retrying: '自动重连',
        retryChipTitle: '报错后自动重连等待中，期间恢复则自动取消',
        secondsUnit: '秒',
        retryCooldown: '自动重连冷却中：{s} 秒后可用',
        retryArmed: '等待 {s} 秒后自动发送「继续」',
        retrySent: '已自动发送「继续」',
        retryFailed: '自动发送「继续」失败',
        logPath: '日志文件',
        exportLog: '导出日志',
        version: '当前版本',
        updateAvailable: '有新版本',
        upToDate: '已是最新',
        updateCheckFailed: '无法检查更新',
        saved: '已保存 ✓',
        saveMismatch: '保存未生效，当前值仍为 {v} 秒',
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
        autoRetry: 'Auto-retry on error',
        autoRetryHint: 'After the model exhausts its retries and the turn ends in error, automatically send "continue" to resume (default on)',
        retryDelay: 'Auto-retry wait (seconds)',
        retryDelayHint: 'How long to wait before auto-retrying; cancelled if it recovers meanwhile (10-300s)',
        confirm: 'OK',
        retrying: 'Retry',
        retryChipTitle: 'Auto-retrying after error; auto-cancelled if it recovers',
        secondsUnit: 's',
        retryCooldown: 'auto-retry cooling down: {s}s',
        retryArmed: 'will auto-send "continue" in {s}s',
        retrySent: 'auto-sent "continue"',
        retryFailed: 'failed to auto-send "continue"',
        logPath: 'Log file',
        exportLog: 'Export log',
        version: 'Version',
        updateAvailable: 'Update available',
        upToDate: 'Up to date',
        updateCheckFailed: 'Update check failed',
        saved: 'Saved ✓',
        saveMismatch: 'Save did not take effect; current value is still {v}s',
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
        autoRetryOnError: true,
        retryDelaySeconds: 60,
        version: null,
        latestVersion: null,
        updateStatus: null, // 'update' | 'uptodate' | 'error' | null
        retryCooldownUntil: null, // timestamp until which auto-retry is cooling down
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
    // ---- browser -> host log reporting ----
    // Mirrors console output into the host's daily log file
    // (<pluginRoot>/logs/<YYYYMMDD>/dsh-done-sound.log) so issues survive a
    // closed DevTools. Must never call console itself (avoids recursion) and
    // must never break the plugin when the report fails.
    function reportLog(level, args) {
      try {
        const parts = [];
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          try {
            if (typeof a === 'string') parts.push(a);
            else if (a instanceof Error) parts.push(a.stack || 'Error: ' + (a.message || String(a)));
            else parts.push(JSON.stringify(a));
          } catch {
            parts.push(String(a));
          }
        }
        const message = parts.join(' ');
        if (!message) return;
        fetch('/dsh-done-sound/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ level: level, source: 'client', message: message }),
        }).catch(() => {});
      } catch {
        // reporting must never break the plugin
      }
    }

    function playChime(cfg) {
      const url = cfg.url || cfg.defaultUrl;
      if (!cfg.enabled || !url) return;
      try {
        const audio = new Audio(url);
        audio.volume = cfg.volume;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            try {
              console.warn('[dsh-done-sound] audio play failed (browser blocked it?):', err && err.message ? err.message : err);
              reportLog('warn', ['audio play failed (browser blocked it?):', err && err.message ? err.message : err]);
            } catch {
              // ignore
            }
          });
        }
      } catch (err) {
        try {
          console.warn('[dsh-done-sound] audio play failed:', err && err.message ? err.message : err);
          reportLog('warn', ['audio play failed:', err && err.message ? err.message : err]);
        } catch {
          // ignore playback failures (autoplay policy, missing audio device)
        }
      }
    }

    // ---- module-level deferred auto-retry ----
    // Lives outside the component so the "continue" still fires even if the
    // user navigates away and the header (and its timers) unmount.
    let pluginCtx = null;
    const retryState = { armed: false, sessionId: null, endTurnAtError: 0, deadline: 0, timer: null };
    function cancelModuleRetry() {
      if (retryState.timer !== null) {
        clearTimeout(retryState.timer);
        retryState.timer = null;
      }
      retryState.armed = false;
      retryState.sessionId = null;
      retryState.endTurnAtError = 0;
      retryState.deadline = 0;
    }
    function fireModuleRetry() {
      retryState.timer = null;
      if (!retryState.armed) return;
      retryState.armed = false;
      const sid = retryState.sessionId;
      retryState.sessionId = null;
      retryState.deadline = 0;
      // Real send path: the browser→host RPC client (same route the composer's
      // "send" uses). ctx.connection is provided by @deepseek-ai/dsh-client-connection;
      // its api.sessions.prompt carries an RpcResponse whose `.result` is {ok} |
      // {ok:false,error}. Failures are surfaced (console + settings-card row) —
      // the old remote.sessions guess was silently skipped because no such
      // namespace exists on the client context.
      const prompt = pluginCtx && pluginCtx.connection && pluginCtx.connection.api && pluginCtx.connection.api.sessions
        ? pluginCtx.connection.api.sessions.prompt
        : null;
      const fail = (why) => {
        try {
          console.error('[dsh-done-sound] auto-retry could not send "继续":', why);
          reportLog('error', ['auto-retry could not send "继续":', why]);
        } catch {
          // console may be gone during teardown
        }
        setConfig({
          retryCooldownUntil: null,
          lastEvent: { at: Date.now(), kind: 'error', reason: 'error', play: false, retried: true, retryFailed: true },
        });
      };
      if (typeof prompt !== 'function') {
        fail('connection.api.sessions.prompt unavailable');
        return;
      }
      let tz = 'UTC';
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      } catch {
        // keep UTC
      }
      Promise.resolve(prompt({ sessionId: sid, mode: 'queue', content: [{ type: 'text', text: '继续' }], clientTimeZone: tz }))
        .then((res) => {
          const result = res && res.result;
          if (result && result.ok) {
            try {
              console.log('[dsh-done-sound] auto-retry sent "继续" to session', sid);
              reportLog('info', ['auto-retry sent "继续" to session', sid]);
            } catch {
              // ignore
            }
            setConfig({
              retryCooldownUntil: null,
              lastEvent: { at: Date.now(), kind: 'error', reason: 'error', play: false, retried: true, retryFailed: false },
            });
          } else {
            const err = result && result.error ? result.error.message : JSON.stringify(result);
            fail(err || 'prompt not accepted');
          }
        })
        .catch((err) => fail(err && err.message ? err.message : String(err)));
    }
    function armModuleRetry(sessionId, endTurnAtError, delayMs) {
      cancelModuleRetry();
      retryState.armed = true;
      retryState.sessionId = sessionId;
      retryState.endTurnAtError = endTurnAtError;
      retryState.deadline = Date.now() + delayMs;
      retryState.timer = setTimeout(fireModuleRetry, delayMs);
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
      pluginCtx = ctx;
      const syncConfig = (payload) => {
        if (!payload || typeof payload !== 'object') return;
        setConfig({
          enabled: payload.enabled === true,
          volume: typeof payload.volume === 'number' ? payload.volume : 0.8,
          playOnInterrupt: payload.playOnInterrupt === true,
          playOnError: payload.playOnError !== false,
          playOnPending: payload.playOnPending !== false,
          autoRetryOnError: payload.autoRetryOnError !== false,
          retryDelaySeconds: typeof payload.retryDelaySeconds === 'number' ? payload.retryDelaySeconds : 60,
          version: typeof payload.version === 'string' ? payload.version : null,
          logPath: typeof payload.logPath === 'string' && payload.logPath ? payload.logPath : null,
          logFileName: typeof payload.logFileName === 'string' && payload.logFileName ? payload.logFileName : 'dsh-done-sound.log',
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
        const [cardTick, setCardTick] = react.useState(Date.now());
        react.useEffect(() => {
          const timer = setInterval(() => setCardTick(Date.now()), 1000);
          return () => clearInterval(timer);
        }, []);
        // Auto-retry delay: local draft while editing, committed on blur/Enter.
        const delayDraftRef = react.useRef(null);
        const [delayDraft, setDelayDraft] = react.useState(cfg.retryDelaySeconds || 60);
        react.useEffect(() => {
          if (delayDraftRef.current !== document.activeElement) {
            setDelayDraft(cfg.retryDelaySeconds || 60);
          }
        }, [cfg.retryDelaySeconds]);
        const commitDelay = async () => {
          const v = Number(delayDraft);
          if (!Number.isFinite(v)) {
            setDelayDraft(cfg.retryDelaySeconds || 60);
            return;
          }
          const rounded = Math.min(300, Math.max(10, Math.round(v / 5) * 5));
          if (rounded !== Number(cfg.retryDelaySeconds)) {
            setDelayDraft(String(rounded));
            const payload = await run('/dsh-done-sound/api/config', { retryDelaySeconds: rounded });
            if (!payload) return;
            // Verify the host actually persisted it (a 200 alone is not proof).
            if (payload.retryDelaySeconds !== rounded) {
              setError(L('saveMismatch').replace('{v}', String(payload.retryDelaySeconds)));
              return;
            }
          }
          // Save feedback (also confirms the current value without changes).
          setDelaySaved(true);
          if (delaySavedTimer.current) clearTimeout(delaySavedTimer.current);
          delaySavedTimer.current = setTimeout(() => setDelaySaved(false), 2000);
        };
        const [delaySaved, setDelaySaved] = react.useState(false);
        const delaySavedTimer = react.useRef(null);
        react.useEffect(
          () => () => {
            if (delaySavedTimer.current) clearTimeout(delaySavedTimer.current);
          },
          [],
        );
        // Export today's log file: fetch it from the host, then hand the
        // browser a Blob download — the native save dialog lets the user pick
        // where to store it (filename is today's dated log name).
        const exportLog = () => {
          fetch('/dsh-done-sound/api/log/export')
            .then((res) => {
              if (!res.ok) {
                return res.json().catch(() => null).then((j) => {
                  throw new Error((j && j.error) || 'HTTP ' + res.status);
                });
              }
              return res.text();
            })
            .then((text) => {
              const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = cfg.logFileName || 'dsh-done-sound.log';
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 2000);
            })
            .catch((err) => {
              try {
                window.alert('导出日志失败：' + (err && err.message ? err.message : String(err)));
              } catch {
                // ignore
              }
            });
        };

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

          cfg.logPath
            ? react.createElement(
                'div',
                { className: 'dtc-row' },
                react.createElement('span', { className: 'dtc-muted' }, L('logPath') + '：'),
                react.createElement('span', { className: 'dtc-muted dtc-logpath' }, cfg.logPath),
              )
            : null,
          react.createElement(
            'div',
            { className: 'dtc-row' },
            react.createElement(
              'button',
              { className: 'dtc-btn', type: 'button', onClick: exportLog },
              L('exportLog'),
            ),
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
          react.createElement(
            'div',
            { className: 'dtc-row' },
            react.createElement(
              'label',
              { className: 'dtc-toggle' },
              react.createElement('input', {
                type: 'checkbox',
                checked: cfg.autoRetryOnError,
                disabled: busy,
                onChange: (e) => {
                  run('/dsh-done-sound/api/config', { autoRetryOnError: e.target.checked });
                },
              }),
              react.createElement('span', null, L('autoRetry')),
            ),
            react.createElement('span', { className: 'dtc-muted' }, L('autoRetryHint')),
          ),
          react.createElement(
            'div',
            { className: 'dtc-row' },
            react.createElement('span', null, L('retryDelay')),
            react.createElement('input', {
              className: 'dtc-num',
              type: 'number',
              min: 10,
              max: 300,
              step: 5,
              ref: delayDraftRef,
              value: delayDraft,
              disabled: busy,
              onChange: (e) => setDelayDraft(e.target.value),
              onBlur: () => {
                commitDelay();
              },
              onKeyDown: (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitDelay();
                }
              },
            }),
            react.createElement('span', { className: 'dtc-muted' }, L('secondsUnit')),
            react.createElement(
              'button',
              {
                className: 'dtc-btn',
                type: 'button',
                disabled: busy,
                onClick: () => {
                  commitDelay();
                },
              },
              L('confirm'),
            ),
            delaySaved && react.createElement('span', { className: 'dtc-saved' }, L('saved')),
          ),
          react.createElement('span', { className: 'dtc-muted' }, L('retryDelayHint')),

          error !== null && react.createElement('div', { className: 'dtc-err' }, error),
          !cfg.loaded && react.createElement('div', { className: 'dtc-muted' }, L('loading')),
          cfg.retryCooldownUntil && cfg.retryCooldownUntil > Date.now()
            ? react.createElement(
                'div',
                { className: 'dtc-muted dtc-cooldown-line' },
                '🔄 ' + L('retryCooldown').replace('{s}', String(Math.ceil((cfg.retryCooldownUntil - cardTick) / 1000))),
              )
            : null,
          retryState.armed && retryState.deadline > cardTick
            ? react.createElement(
                'div',
                { className: 'dtc-muted dtc-cooldown-line' },
                '🔄 ' +
                  L('retryArmed').replace('{s}', String(Math.max(0, Math.ceil((retryState.deadline - cardTick) / 1000)))),
              )
            : null,
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
                (cfg.lastEvent.retried === true
                  ? cfg.lastEvent.retryFailed
                    ? L('retryFailed')
                    : L('retrySent')
                  : cfg.lastEvent.play
                    ? L('evPlayed')
                    : L('evNotPlayed')),
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
        const prevPendingKeysRef = react.useRef('');
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
                  // Stable fingerprint of the items currently waiting, so a
                  // replacement wait (one approval resolved while the next is
                  // requested — count stays at 1) is still detected as a NEW
                  // wait. The old 0->N edge detector missed those, which is the
                  // "sometimes no sound" cause.
                  pendingKey:
                    s && Array.isArray(s.pending) && s.pending.length
                      ? s.pending
                          .map((it) => {
                            const p = it && it.payload;
                            if (p && typeof p.approvalId === 'string') return 'a:' + p.approvalId;
                            if (p && typeof p.questionRpcId === 'string') return 'q:' + p.questionRpcId;
                            return 'i:' + JSON.stringify(it || null);
                          })
                          .join('|')
                      : '',
                };
              })
            : null;

        react.useEffect(() => {
          if (snap === null) return;

          // Fire the "waiting for human input" reminder for the current config
          // view. When no audio URL is known yet (status fetch still in flight,
          // or the audio was changed elsewhere), re-fetch status once and play
          // with the fresh view instead of silently skipping.
          const notifyPending = () => {
            const canPlay = (view) => view.enabled && view.playOnPending && (view.url || view.defaultUrl);
            const record = (value) => setConfig({ lastEvent: { at: Date.now(), kind: 'pending', reason: 'pending', play: value } });
            if (canPlay(cfg)) {
              playChime(cfg);
              record(true);
              return;
            }
            api('/dsh-done-sound/api/status')
              .then((payload) => {
                if (!payload || typeof payload !== 'object') return;
                syncConfig(payload);
                const fresh = {
                  ...cfg,
                  enabled: payload.enabled === true,
                  playOnPending: payload.playOnPending !== false,
                  url: typeof payload.url === 'string' && payload.url ? payload.url : null,
                  defaultUrl: typeof payload.defaultUrl === 'string' && payload.defaultUrl ? payload.defaultUrl : null,
                };
                if (canPlay(fresh)) {
                  playChime(fresh);
                  record(true);
                }
              })
              .catch(() => {});
            record(false);
          };

          // New session (or first mount): reset and wait for the history to
          // settle before listening.
          if (snap.sessionId !== lastSessionRef.current) {
            lastSessionRef.current = snap.sessionId;
            seededRef.current = false;
            pendingReasonRef.current = null;
            lastEndTurnRef.current = 0;
            prevPendingKeysRef.current = '';
            cancelModuleRetry();
            setConfig({ retryCooldownUntil: null });
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
              // Seed with the current key so the pending detector only fires
              // for NEW waiting items, but still notify once if we mounted
              // into an already-waiting conversation (e.g. refresh mid-approval).
              prevPendingKeysRef.current = snap.pendingKey || '';
              if (snap.pendingCount > 0) notifyPending();
            }
            return;
          }

          // Cancel a pending auto-retry when the session recovers on its own
          // (agent runs again, a new turn closes, it waits for human input, or
          // we switched sessions) — no need to send "继续" then.
          if (retryState.armed) {
            const cancel =
              snap.sessionId !== retryState.sessionId ||
              snap.streaming === true ||
              snap.endTurn > retryState.endTurnAtError ||
              snap.pendingCount > 0;
            if (cancel) {
              cancelModuleRetry();
              setConfig({ retryCooldownUntil: null });
            }
          }

          // Agent entered a waiting-for-human state. Notify on ANY new waiting item:
// the first pending, a replacement approval (one resolved, next requested —
// count stays 1, which the old 0->N rising-edge detector missed, i.e. the
// "sometimes no sound" bug), or an additional item stacking on top.
if (snap.pendingCount > 0) {
            const prevKeys = new Set((prevPendingKeysRef.current || '').split('|').filter(Boolean));
            const curKeys = (snap.pendingKey || '').split('|').filter(Boolean);
            const hasNew = curKeys.some((k) => !prevKeys.has(k));
            if (hasNew) {
              prevPendingKeysRef.current = snap.pendingKey || '';
              notifyPending();
              return;
            }
          }
          prevPendingKeysRef.current = snap.pendingKey || '';

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

          // Arm the deferred auto-retry: after a real 'error' end, wait the
          // configured window; if the session recovers during the window
          // (streaming, new turn, approval wait) the retry is cancelled above,
          // otherwise the module-level timer fires "继续" when it expires.
          if (reason === 'error' && cfg.enabled && cfg.autoRetryOnError && snap.sessionId) {
            if (!retryState.armed) {
              const delayMs = (cfg.retryDelaySeconds || 60) * 1000;
              armModuleRetry(snap.sessionId, snap.endTurn, delayMs);
              setConfig({ retryCooldownUntil: retryState.deadline });
              setConfig({ lastEvent: { at: Date.now(), kind, reason, play: played, retryPending: true } });
            }
          }
        }, [snap, cfg]);

        // Countdown chip display only (the actual fire is a module-level timer
        // that survives navigation away from the conversation).
        const [nowTick, setNowTick] = react.useState(Date.now());
        react.useEffect(() => {
          const timer = setInterval(() => setNowTick(Date.now()), 1000);
          return () => clearInterval(timer);
        }, []);
        const cooldownLeft =
          cfg.retryCooldownUntil && cfg.retryCooldownUntil > Date.now()
            ? Math.ceil((cfg.retryCooldownUntil - nowTick) / 1000)
            : 0;
        if (cooldownLeft > 0) {
          const chipLang = resolveLang();
          return react.createElement(
            'span',
            { className: 'dtc-retry-chip', title: t(chipLang, 'retryChipTitle') },
            react.createElement('span', { className: 'dtc-retry-ico' }, '🔄'),
            react.createElement('span', null, t(chipLang, 'retrying')),
            react.createElement('span', { className: 'dtc-retry-num' }, cooldownLeft + 's'),
          );
        }
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
    exports.inject = ['slots', 'remote', 'remote.commands', 'connection'];
    exports.apply = apply;
    return module.exports;
  },
});
