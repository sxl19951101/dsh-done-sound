/**
 * dsh-done-sound — host half.
 *
 * Owns three things:
 *  1. A `dsh-done-sound` settings scope (enabled / volume / playOnInterrupt /
 *     playOnError / audio file metadata), registered through `ctx.settings`.
 *  2. Audio file storage: uploaded files are written under
 *     `<profileDir>/.dsh-done-sound/<fileId>.bin` and served back through the
 *     webServer HTTP route `/dsh-done-sound/audio/<fileId>`.
 *  3. A same-origin JSON API on `/dsh-done-sound/api/*` used by the settings
 *     card (session-independent; no slash-command RPC involved):
 *       GET  /dsh-done-sound/api/status            -> current settings + url
 *       POST /dsh-done-sound/api/config            -> {enabled?, volume?, playOnInterrupt?, playOnError?}
 *       POST /dsh-done-sound/api/audio             -> {dataUrl, fileName}
 *       POST /dsh-done-sound/api/clear             -> remove the stored audio
 *       POST /dsh-done-sound/api/log               -> {level, message, source} client-reported log lines
 *       GET  /dsh-done-sound/api/log               -> {logPath} today's log file path
 *       GET  /dsh-done-sound/api/log/export        -> download today's log file as an attachment
 *
 * The `dsh-done-sound` slash command remains as a chat-side manual path.
 *
 * Route mounting is deferred through `ctx.inject(['webServer'], cb)` (the
 * same pattern dshmarket uses) so the plugin never touches a service that is
 * not yet available at apply time.
 */
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import z from '@deepseek-ai/schemastery';

export const name = 'dsh-done-sound';

/** Cordis service names made available on the apply ctx. */
const inject = ['settings', 'commands', 'webServer'];
export { inject };

/** This plugin's installed version, read once from its own package.json. */
let cachedPluginVersion = null;
function pluginVersion() {
  if (cachedPluginVersion !== null) return cachedPluginVersion;
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    cachedPluginVersion = typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    cachedPluginVersion = 'unknown';
  }
  return cachedPluginVersion;
}

/**
 * File logger: appends one line per event to
 * `<pluginRoot>/logs/<YYYYMMDD>-dsh-done-sound.log` — a fresh file every day.
 * Logging must never break the plugin, so every failure is swallowed.
 */
const LOGS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'logs');

function datedLogFileName(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}-dsh-done-sound.log`;
}

function datedLogPath(now = new Date()) {
  return join(LOGS_ROOT, datedLogFileName(now));
}

function writeLog(level, message) {
  try {
    const now = new Date();
    const stamp =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const file = datedLogPath(now);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `[${stamp}] [${level}] ${message}\n`, 'utf8');
  } catch {
    // never let logging break the plugin
  }
}

/** Uploaded audio hard cap (10 MiB decoded — covers 8MB-class sound-library files). */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Per-scene default sounds. Every trigger scene has its own bundled default
 * so a user who never uploads anything still hears a distinct sound for each
 * situation (normal completion / interrupt / error / approval wait / retry ok).
 */
const SCENES = ['normal', 'interrupt', 'error', 'pending', 'retry'];

const DEFAULT_AUDIO_FILES = {
  normal: 'turn-done.wav',
  interrupt: 'turn-interrupt.wav',
  error: 'turn-error.wav',
  pending: 'turn-pending.wav',
  retry: 'turn-retry.wav',
};
const DEFAULT_AUDIO_PATHS = Object.fromEntries(
  Object.entries(DEFAULT_AUDIO_FILES).map(([scene, file]) => [
    scene,
    join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', file),
  ]),
);
const DEFAULT_AUDIO_URLS = Object.fromEntries(SCENES.map((s) => [s, `/dsh-done-sound/audio/default-${s}`]));
const DEFAULT_AUDIO_MIME = 'audio/wav';

/** Accepted audio MIME types -> file extension. */
const AUDIO_MIMES = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/oga': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

const SoundMetaSchema = z
  .object({
    fileId: z.string().default(''),
    fileName: z.string().default(''),
    mime: z.string().default(''),
    size: z.number().default(0),
  })
  .default({});

const TurnChimeSchema = z.object({
  enabled: z.boolean().default(true),
  volume: z.number().min(0).max(1).step(0.01).default(0.8),
  playOnInterrupt: z.boolean().default(false),
  playOnError: z.boolean().default(true),
  playOnPending: z.boolean().default(true),
  playOnRetry: z.boolean().default(true),
  autoRetryOnError: z.boolean().default(true),
  retryDelaySeconds: z.number().min(10).max(300).step(5).default(60),
  // One independently configurable audio per trigger scene.
  sounds: z
    .object({
      normal: SoundMetaSchema,
      interrupt: SoundMetaSchema,
      error: SoundMetaSchema,
      pending: SoundMetaSchema,
      retry: SoundMetaSchema,
    })
    .default({}),
  // Legacy single-audio field (pre-0.1.9). Kept for migration: when
  // `sounds.normal` is empty, the old `audio` value is used for the normal
  // scene until the user picks a new one.
  audio: z
    .object({
      fileId: z.string().default(''),
      fileName: z.string().default(''),
      mime: z.string().default(''),
      size: z.number().default(0),
    })
    .default({}),
});

const NS = 'dsh-done-sound';
const ROUTE_PREFIX = '/dsh-done-sound';
const FILE_ID_RE = /^[A-Za-z0-9-]+$/;

export function apply(ctx) {
  // boot() sets ctx.baseUrl to the profile directory (see @deepseek-ai/dsh-app-boot).
  const profileDir = fileURLToPath(ctx.baseUrl);
  const dataDir = join(profileDir, '.dsh-done-sound');
  const scope = ctx.settings.register(NS, TurnChimeSchema, { base: {} });

  const audioPath = (fileId) => join(dataDir, `${fileId}.bin`);

  const isScene = (s) => typeof s === 'string' && SCENES.includes(s);

  // Resolve the effective audio meta for a scene: the scene's own uploaded
  // audio, or (normal scene only) the legacy single audio, else empty.
  const sceneAudio = (value, scene) => {
    const s = value.sounds?.[scene];
    if (s && typeof s.fileId === 'string' && s.fileId) return s;
    if (scene === 'normal' && value.audio && typeof value.audio.fileId === 'string' && value.audio.fileId) {
      return value.audio;
    }
    return { fileId: '', fileName: '', mime: '', size: 0 };
  };

  const statusPayload = () => {
    const value = scope.get();
    const sounds = {};
    for (const scene of SCENES) {
      const meta = sceneAudio(value, scene);
      const fileId = meta.fileId ?? '';
      sounds[scene] = {
        fileId,
        fileName: meta.fileName ?? '',
        mime: meta.mime ?? '',
        size: meta.size ?? 0,
        url: fileId ? `${ROUTE_PREFIX}/audio/${fileId}` : null,
        defaultUrl: DEFAULT_AUDIO_URLS[scene],
      };
    }
    return {
      ok: true,
      version: pluginVersion(),
      enabled: value.enabled,
      volume: value.volume,
      playOnInterrupt: value.playOnInterrupt,
      playOnError: value.playOnError,
      playOnPending: value.playOnPending,
      playOnRetry: value.playOnRetry,
      autoRetryOnError: value.autoRetryOnError,
      retryDelaySeconds: value.retryDelaySeconds,
      sounds,
      logPath: datedLogPath(),
      logFileName: datedLogFileName(),
    };
  };

  const clearAudio = async (scene) => {
    const value = scope.get();
    const target = isScene(scene) ? scene : 'normal';
    const meta = sceneAudio(value, target);
    const fileId = meta.fileId;
    if (fileId) {
      try {
        await unlink(audioPath(fileId));
      } catch {
        // file already gone; settings are the source of truth
      }
    }
    const patch = { sounds: { ...(value.sounds ?? {}), [target]: { fileId: '', fileName: '', mime: '', size: 0 } } };
    // Clearing the normal scene also clears the legacy single-audio field,
    // so a cleared normal scene stays cleared.
    if (target === 'normal') patch.audio = { fileId: '', fileName: '', mime: '', size: 0 };
    await scope.update(patch);
    writeLog('INFO', `audio cleared (${target})`);
  };

  const setAudio = async (dataUrl, fileName, scene) => {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw new Error('invalid audio data (need data:<mime>;base64,<data>)');
    const mime = match[1].toLowerCase();
    const ext = AUDIO_MIMES[mime];
    if (!ext) throw new Error(`unsupported audio type: ${mime} (mp3/wav/ogg/webm/m4a/aac/flac only)`);
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0) throw new Error('empty audio content');
    if (buffer.length > MAX_BYTES) throw new Error(`audio exceeds 10MB (got ${buffer.length} bytes)`);

    const target = isScene(scene) ? scene : 'normal';
    const fileId = randomUUID();
    await mkdir(dataDir, { recursive: true });
    await writeFile(audioPath(fileId), buffer);

    // Replace the scene's previous file, then commit settings.
    const previous = sceneAudio(scope.get(), target).fileId;
    const patch = {
      sounds: { ...(scope.get().sounds ?? {}), [target]: { fileId, fileName: fileName || 'chime', mime, size: buffer.length } },
    };
    // Setting the normal scene supersedes the legacy single-audio value.
    if (target === 'normal') patch.audio = { fileId, fileName: fileName || 'chime', mime, size: buffer.length };
    await scope.update(patch);
    if (previous && previous !== fileId) {
      try {
        await unlink(audioPath(previous));
      } catch {
        // ignore
      }
    }
    writeLog('INFO', `audio stored (${target}): ${fileName || 'chime'} (${buffer.length} bytes, ${mime})`);
    return fileId;
  };

  // ---- slash command (chat-side manual path) ----
  ctx.commands.register({
    name: 'dsh-done-sound',
    description: '对话完成音效：查询/设置音频与触发开关（status | set <dataUrl> <fileName> | clear | enabled <on|off> | volume <0-1> | interrupt <on|off> | error <on|off> | test）',
    input: {
      hint: 'status | set <dataUrl> <fileName> | clear | enabled <on|off> | volume <0-1> | interrupt <on|off> | error <on|off> | test',
    },
    recordInput: false,
    handler: async (invocation) => {
      const raw = (invocation.rawInput ?? '').trim();
      const [action, ...rest] = raw.split(/\s+/);
      try {
        switch (action) {
          case '':
          case 'status':
            return { kind: 'success', text: JSON.stringify(statusPayload()) };
          case 'set': {
            const dataUrl = rest[0] ?? '';
            const fileName = rest.slice(1).join(' ') || 'chime';
            await setAudio(dataUrl, fileName);
            return { kind: 'success', text: JSON.stringify(statusPayload()) };
          }
          case 'clear':
            await clearAudio();
            return { kind: 'success', text: JSON.stringify(statusPayload()) };
          case 'enabled': {
            const value = rest[0];
            if (value !== 'on' && value !== 'off') return { kind: 'error', text: '用法：enabled <on|off>' };
            await scope.update({ enabled: value === 'on' });
            return { kind: 'success', text: JSON.stringify(statusPayload()) };
          }
          case 'volume': {
            const n = Number(rest[0]);
            if (!Number.isFinite(n) || n < 0 || n > 1) return { kind: 'error', text: '用法：volume <0-1>' };
            await scope.update({ volume: n });
            return { kind: 'success', text: JSON.stringify(statusPayload()) };
          }
          case 'interrupt': {
            const value = rest[0];
            if (value !== 'on' && value !== 'off') return { kind: 'error', text: '用法：interrupt <on|off>' };
            await scope.update({ playOnInterrupt: value === 'on' });
            return { kind: 'success', text: JSON.stringify(statusPayload()) };
          }
          case 'error': {
            const value = rest[0];
            if (value !== 'on' && value !== 'off') return { kind: 'error', text: '用法：error <on|off>' };
            await scope.update({ playOnError: value === 'on' });
            return { kind: 'success', text: JSON.stringify(statusPayload()) };
          }
          case 'test':
            return { kind: 'success', text: JSON.stringify({ ...statusPayload(), ok: true }) };
          default:
            return { kind: 'error', text: `未知操作：${action}` };
        }
      } catch (error) {
        writeLog('ERROR', `command failed: ${error instanceof Error ? error.message : String(error)}`);
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) };
      }
    },
  });

  // ---- HTTP surface: JSON API + audio serving ----
  const sendJson = (res, code, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  };

  const readJsonBody = (req) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve(raw.trim() ? JSON.parse(raw) : {});
        } catch {
          reject(new Error('invalid JSON body'));
        }
      });
      req.on('error', reject);
    });

  const handler = async (req, res) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      pathname = '/';
    }
    const method = (req.method ?? 'GET').toUpperCase();

    // Serve the bundled per-scene default sounds (used when no custom audio
    // is set for a scene).
    const defaultMatch = /^\/dsh-done-sound\/audio\/default-([A-Za-z0-9-]+)$/.exec(pathname);
    if (defaultMatch && SCENES.includes(defaultMatch[1])) {
      const scene = defaultMatch[1];
      try {
        const buffer = await readFile(DEFAULT_AUDIO_PATHS[scene]);
        res.writeHead(200, {
          'Content-Type': DEFAULT_AUDIO_MIME,
          'Content-Length': buffer.length,
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(buffer);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
      return;
    }

    // Serve the stored audio file (must belong to any configured scene).
    const audioMatch = /^\/dsh-done-sound\/audio\/([A-Za-z0-9-]+)$/.exec(pathname);
    if (audioMatch) {
      const fileId = audioMatch[1];
      const value = scope.get();
      const meta = SCENES.map((s) => sceneAudio(value, s)).find((m) => m.fileId === fileId);
      if (!FILE_ID_RE.test(fileId) || !meta) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      try {
        const buffer = await readFile(audioPath(fileId));
        res.writeHead(200, {
          'Content-Type': meta.mime || 'application/octet-stream',
          'Content-Length': buffer.length,
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(buffer);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
      return;
    }

    // JSON API (session-independent transport for the settings card).
    try {
      if (pathname === '/dsh-done-sound/api/status' && method === 'GET') {
        sendJson(res, 200, statusPayload());
        return;
      }
      if (pathname === '/dsh-done-sound/api/config' && method === 'POST') {
        const body = await readJsonBody(req);
        const patch = {};
        if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
        if (typeof body.volume === 'number' && body.volume >= 0 && body.volume <= 1) patch.volume = body.volume;
        if (typeof body.playOnInterrupt === 'boolean') patch.playOnInterrupt = body.playOnInterrupt;
        if (typeof body.playOnError === 'boolean') patch.playOnError = body.playOnError;
        if (typeof body.playOnPending === 'boolean') patch.playOnPending = body.playOnPending;
        if (typeof body.playOnRetry === 'boolean') patch.playOnRetry = body.playOnRetry;
        if (typeof body.autoRetryOnError === 'boolean') patch.autoRetryOnError = body.autoRetryOnError;
        if (
          typeof body.retryDelaySeconds === 'number' &&
          body.retryDelaySeconds >= 10 &&
          body.retryDelaySeconds <= 300
        ) {
          patch.retryDelaySeconds = Math.round(body.retryDelaySeconds / 5) * 5;
        }
        if (Object.keys(patch).length > 0) await scope.update(patch);
        sendJson(res, 200, statusPayload());
        return;
      }
      if (pathname === '/dsh-done-sound/api/audio' && method === 'POST') {
        const body = await readJsonBody(req);
        const scene = typeof body.scene === 'string' && SCENES.includes(body.scene) ? body.scene : 'normal';
        await setAudio(typeof body.dataUrl === 'string' ? body.dataUrl : '', typeof body.fileName === 'string' ? body.fileName : '', scene);
        sendJson(res, 200, statusPayload());
        return;
      }
      if (pathname === '/dsh-done-sound/api/clear' && method === 'POST') {
        const body = await readJsonBody(req);
        const scene = typeof body.scene === 'string' && SCENES.includes(body.scene) ? body.scene : 'normal';
        await clearAudio(scene);
        sendJson(res, 200, statusPayload());
        return;
      }
      if (pathname === '/dsh-done-sound/api/log' && method === 'POST') {
        const body = await readJsonBody(req);
        const message = typeof body.message === 'string' ? body.message : '';
        if (message) {
          const level = typeof body.level === 'string' && /^[A-Za-z]+$/.test(body.level) ? body.level.toUpperCase() : 'INFO';
          writeLog(body.source === 'client' ? `CLIENT-${level}` : level, message.slice(0, 4000));
        }
        sendJson(res, 200, { ok: true });
        return;
      }
      if (pathname === '/dsh-done-sound/api/log' && method === 'GET') {
        sendJson(res, 200, { ok: true, logPath: datedLogPath(), logFileName: datedLogFileName() });
        return;
      }
      if (pathname === '/dsh-done-sound/api/log/export' && method === 'GET') {
        try {
          const buffer = await readFile(datedLogPath());
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${datedLogFileName()}"`,
            'Content-Length': buffer.length,
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
          });
          res.end(buffer);
        } catch {
          sendJson(res, 404, { ok: false, error: '今天的日志文件还不存在' });
        }
        return;
      }
    } catch (error) {
      writeLog('ERROR', `api ${method} ${pathname} failed: ${error instanceof Error ? error.message : String(error)}`);
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }

    res.writeHead(404);
    res.end('not found');
  };

  ctx.inject(['webServer'], (webCtx) => {
    const disposeRoute = webCtx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler,
    });
    webCtx.effect(() => disposeRoute);
  });
}
