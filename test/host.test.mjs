/**
 * Isolated host-logic test for dsh-done-sound's rebuilt bundle.
 * Drives apply() with a mock ctx and exercises the JSON API + audio serving
 * + slash command handler end to end, without touching the running GUI.
 */
import { pathToFileURL } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const testDir = new URL('./.dtc-test-dir/', import.meta.url);
await mkdir(testDir, { recursive: true });

const mod = await import('../lib/index.js');

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log('  ok  ' + label);
  else {
    failures += 1;
    console.log('  FAIL ' + label + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
  }
}

// ---- mock ctx ----
const state = {
  enabled: true,
  volume: 0.8,
  playOnInterrupt: false,
  playOnError: true,
  playOnPending: true,
  playOnRetry: true,
  retryDelaySeconds: 60,
  sounds: {
    normal: { fileId: '', fileName: '', mime: '', size: 0 },
    interrupt: { fileId: '', fileName: '', mime: '', size: 0 },
    error: { fileId: '', fileName: '', mime: '', size: 0 },
    pending: { fileId: '', fileName: '', mime: '', size: 0 },
    retry: { fileId: '', fileName: '', mime: '', size: 0 },
  },
  audio: { fileId: '', fileName: '', mime: '', size: 0 },
};
const scope = {
  get: () => state,
  update: async (patch) => Object.assign(state, patch),
};
let routeHandler = null;
let commandHandler = null;
let injectedWebServer = false;
const ctx = {
  baseUrl: testDir.href,
  settings: { register: () => scope },
  commands: {
    register: (cmd) => {
      commandHandler = cmd.handler;
      check('command registered with name', cmd.name === 'dsh-done-sound');
    },
  },
  webServer: {
    register: (route) => {
      routeHandler = route.handler;
      check('route registered (prefix)', route.kind === 'prefix' && route.path === '/dsh-done-sound');
      return () => {};
    },
  },
  inject: (services, cb) => {
    if (services.includes('webServer')) {
      injectedWebServer = true;
      cb(ctx); // invoke with the same ctx (webServer present)
    }
  },
  effect: () => {},
};

mod.apply(ctx);
check('apply() completed', true);
check('webServer route mounted via ctx.inject', injectedWebServer);

// ---- fake req/res ----
function fakeReq(method, url, body) {
  const listeners = {};
  const queued = [];
  return {
    method,
    url,
    on(ev, cb) {
      (listeners[ev] = listeners[ev] || []).push(cb);
      queued.forEach((item) => {
        if (item.ev === ev) cb(item.arg);
      });
      return this;
    },
    _push(chunk) {
      queued.push({ ev: 'data', arg: chunk });
      (listeners['data'] || []).forEach((cb) => cb(chunk));
    },
    _end() {
      queued.push({ ev: 'end' });
      (listeners['end'] || []).forEach((cb) => cb());
    },
  };
}
function fakeRes() {
  const out = { status: 0, headers: null, body: '' };
  return {
    writeHead(status, headers) {
      out.status = status;
      out.headers = headers;
      return this;
    },
    end(body) {
      out.body = body === undefined ? '' : String(body);
    },
    _result() {
      return out;
    },
  };
}
async function call(method, url, body) {
  const raw = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const req = fakeReq(method, url, raw);
  if (raw !== undefined) req._push(Buffer.from(raw));
  req._end();
  const res = fakeRes();
  await routeHandler(req, res);
  const r = res._result();
  return { status: r.status, headers: r.headers, json: r.body.startsWith('{') ? JSON.parse(r.body) : null, text: r.body };
}

// ---- tiny valid WAV (silence) as data URL ----
const WAV_B64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const WAV_DATA_URL = 'data:audio/wav;base64,' + WAV_B64;

// 1. status (empty)
let r = await call('GET', '/dsh-done-sound/api/status');
check('status 200', r.status === 200, r);
check('status normal url null initially', r.json && r.json.sounds && r.json.sounds.normal.url === null, r.json && r.json.sounds);
check('five scenes present', r.json && Object.keys(r.json.sounds).length === 5, r.json && r.json.sounds);
check('default urls per scene', r.json && r.json.sounds.interrupt.defaultUrl === '/dsh-done-sound/audio/default-interrupt' && r.json.sounds.retry.defaultUrl === '/dsh-done-sound/audio/default-retry', r.json && r.json.sounds);

// 1b. serve per-scene default sounds
for (const scene of ['normal', 'interrupt', 'error', 'pending', 'retry']) {
  r = await call('GET', '/dsh-done-sound/audio/default-' + scene);
  check('default audio serve 200 ' + scene, r.status === 200 && r.headers && r.headers['Content-Type'] === 'audio/wav', { status: r.status, ct: r.headers && r.headers['Content-Type'] });
}

// 2. upload audio (default scene = normal)
r = await call('POST', '/dsh-done-sound/api/audio', { dataUrl: WAV_DATA_URL, fileName: 'ding.wav' });
check('audio upload 200', r.status === 200 && r.json && r.json.ok === true, r);
check('normal audio url set', r.json && typeof r.json.sounds.normal.url === 'string' && r.json.sounds.normal.url.startsWith('/dsh-done-sound/audio/'), r.json && r.json.sounds);
const fileId = r.json.sounds.normal.fileId;
check('audio metadata saved', r.json.sounds.normal.mime === 'audio/wav' && r.json.sounds.normal.size === Buffer.from(WAV_B64, 'base64').length, r.json.sounds.normal);

// 2b. upload to interrupt scene explicitly
r = await call('POST', '/dsh-done-sound/api/audio', { dataUrl: WAV_DATA_URL, fileName: 'buzz.wav', scene: 'interrupt' });
check('interrupt upload 200', r.status === 200 && r.json && typeof r.json.sounds.interrupt.url === 'string', r.json && r.json.sounds.interrupt);
const interruptFileId = r.json.sounds.interrupt.fileId;
check('normal audio unaffected', r.json && r.json.sounds.normal.fileId === fileId, r.json && r.json.sounds);

// 3. serve the audio files back
r = await call('GET', '/dsh-done-sound/audio/' + fileId);
console.log('  [debug] serve response:', JSON.stringify({ status: r.status, headers: r.headers, text: r.text.slice(0, 40) }));
check('audio serve 200 + wav', r.status === 200 && r.headers && r.headers['Content-Type'] === 'audio/wav', { status: r.status, ct: r.headers && r.headers['Content-Type'] });
r = await call('GET', '/dsh-done-sound/audio/' + interruptFileId);
check('interrupt audio serve 200', r.status === 200, { status: r.status });

// 4. config update
r = await call('POST', '/dsh-done-sound/api/config', { volume: 0.5, playOnInterrupt: true });
check('config 200 + reflected', r.status === 200 && r.json && r.json.volume === 0.5 && r.json.playOnInterrupt === true, r.json);

// 4a. playOnRetry toggle
r = await call('POST', '/dsh-done-sound/api/config', { playOnRetry: false });
check('playOnRetry saved + reflected', r.status === 200 && r.json && r.json.playOnRetry === false, r.json);

// 4b. retryDelaySeconds (regression: this field was dropped from the handler)
r = await call('POST', '/dsh-done-sound/api/config', { retryDelaySeconds: 15 });
check('retry delay saved + reflected', r.status === 200 && r.json && r.json.retryDelaySeconds === 15, r.json);
r = await call('GET', '/dsh-done-sound/api/status');
check('retry delay persisted across status read', r.json && r.json.retryDelaySeconds === 15, r.json);
r = await call('POST', '/dsh-done-sound/api/config', { retryDelaySeconds: 123 });
check('retry delay rounded to step 5', r.json && r.json.retryDelaySeconds === 125, r.json);
r = await call('POST', '/dsh-done-sound/api/config', { retryDelaySeconds: 7 });
check('retry delay below 10 ignored', r.json && r.json.retryDelaySeconds === 125, r.json);

// 5. bad upload -> 400
r = await call('POST', '/dsh-done-sound/api/audio', { dataUrl: 'data:text/plain;base64,AAAA', fileName: 'x.txt' });
check('bad mime -> 400 ok:false', r.status === 400 && r.json && r.json.ok === false, r);

// 6. clear interrupt scene only
r = await call('POST', '/dsh-done-sound/api/clear', { scene: 'interrupt' });
check('clear interrupt 200 + url null', r.status === 200 && r.json && r.json.sounds.interrupt.url === null, r.json && r.json.sounds.interrupt);
check('clear keeps normal', r.json && r.json.sounds.normal.fileId === fileId, r.json && r.json.sounds.normal);

// 6b. clear normal scene
r = await call('POST', '/dsh-done-sound/api/clear');
check('clear normal 200 + url null', r.status === 200 && r.json && r.json.sounds.normal.url === null, r.json && r.json.sounds.normal);

// 7. slash command status
let cr = await commandHandler({ rawInput: 'status' });
check('command status success', cr.kind === 'success' && JSON.parse(cr.text).ok === true, cr);

// 7b. log report -> file -> export
r = await call('POST', '/dsh-done-sound/api/log', { level: 'warn', message: 'hello-log-export', source: 'client' });
check('log report 200', r.status === 200 && r.json && r.json.ok === true, r);
r = await call('GET', '/dsh-done-sound/api/log/export');
check('log export 200 + content', r.status === 200 && typeof r.text === 'string' && r.text.includes('hello-log-export'), { status: r.status, text: r.text && r.text.slice(0, 80) });
r = await call('GET', '/dsh-done-sound/api/log');
check('log info shows dated file name', r.json && typeof r.json.logFileName === 'string' && r.json.logFileName.indexOf('-dsh-done-sound.log') > 0, r.json);

// 8. unknown api path -> 404
r = await call('GET', '/dsh-done-sound/api/nope');
check('unknown api 404', r.status === 404, r);

// cleanup
await rm(testDir, { recursive: true, force: true });

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
