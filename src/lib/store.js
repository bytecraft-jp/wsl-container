// アプリ全体の状態 (トースト・ジョブ・ダイアログ・設定)
import { reactive } from 'vue';
import { invoke, newId, startStream, listen } from './api.js';
import { guiViewerUrl } from './gui/viewer.js';
import { setGuiPresets } from './gui/presets.js';

export const state = reactive({
  status: null,
  settings: {},
  toasts: [],
  jobs: [],
  jobsOpen: false,
  dialog: null,
  runDialog: null,
  refreshTick: 0,
  composeInbox: [],
  terminalRequests: [],
  presetErrors: [],
  presetDirectory: '',
});

export function bumpRefresh() {
  state.refreshTick++;
}

// ---- トースト ----
export function toast(message, type = 'info', timeout = 4000) {
  const id = newId('t');
  state.toasts.push({ id, message, type });
  if (timeout) setTimeout(() => dismissToast(id), type === 'error' ? Math.max(timeout, 8000) : timeout);
}
export function dismissToast(id) {
  const i = state.toasts.findIndex((t) => t.id === id);
  if (i >= 0) state.toasts.splice(i, 1);
}

/** 非同期処理をトースト付きで実行 */
export async function act(fn, { success, error, refresh = true } = {}) {
  try {
    const r = await fn();
    if (success) toast(typeof success === 'function' ? success(r) : success, 'success');
    if (refresh) bumpRefresh();
    return r;
  } catch (e) {
    toast(`${error ? `${error}: ` : ''}${e.message}`, 'error');
    return undefined;
  }
}

// ---- ジョブ (pull / build / compose など長時間の処理) ----
function addJob(title) {
  const job = reactive({ id: newId('job'), title, status: 'running', log: '', started: Date.now(), stop: null });
  state.jobs.unshift(job);
  if (state.jobs.length > 30) state.jobs.pop();
  state.jobsOpen = true;
  return job;
}

// すべてのタスクが成功で終わったら数秒後にパネルを閉じる (失敗時は開いたまま)
let closeTimer = null;
function scheduleAutoClose() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    const running = state.jobs.some((j) => j.status === 'running');
    const failedRecently = state.jobs.some((j) => j.status === 'error' && Date.now() - j.started < 60000);
    if (!running && !failedRecently) state.jobsOpen = false;
  }, 4000);
}

function appendLog(job, d) {
  job.log += d;
  if (job.log.length > 200000) job.log = job.log.slice(-150000);
}

/** wslc コマンドをジョブとして実行 */
export function runJob(title, args, { cwd, silent } = {}) {
  const job = addJob(title);
  appendLog(job, `$ wslc ${args.join(' ')}\n`);
  return new Promise((resolve) => {
    const s = startStream(args, {
      cwd,
      onData: (d) => appendLog(job, d),
      onExit: (code) => {
        job.status = code === 0 ? 'done' : 'error';
        job.stop = null;
        if (code === 0) {
          if (!silent) toast(`${title} が完了しました`, 'success');
        } else toast(`${title} に失敗しました`, 'error');
        bumpRefresh();
        scheduleAutoClose();
        resolve(code === 0);
      },
    });
    job.stop = s.stop;
  });
}

/** compose:* などメインプロセス側でログを送ってくるジョブ */
export async function remoteJob(title, channel, ...args) {
  const job = addJob(title);
  const unlisten = listen(job.id, { onData: (d) => appendLog(job, d) });
  try {
    const result = await invoke(channel, job.id, ...args);
    if (result?.cancelled) {
      job.status = 'done';
      appendLog(job, 'キャンセルしました。\n');
      return false;
    }
    job.status = 'done';
    toast(`${title} が完了しました`, 'success');
    return true;
  } catch (e) {
    job.status = 'error';
    toast(`${title}: ${e.message}`, 'error');
    return false;
  } finally {
    unlisten();
    bumpRefresh();
    scheduleAutoClose();
  }
}

export function clearJobs() {
  state.jobs = state.jobs.filter((j) => j.status === 'running');
}

// ---- ダイアログ ----
export function confirm({ title, message, okText = 'OK', danger = false }) {
  return new Promise((resolve) => {
    state.dialog = { kind: 'confirm', title, message, okText, danger, resolve };
  });
}

export function prompt({ title, message, label, value = '', placeholder = '', okText = 'OK', options }) {
  return new Promise((resolve) => {
    state.dialog = { kind: 'prompt', title, message, label, value, placeholder, okText, options, resolve };
  });
}

export function closeDialog(result) {
  const d = state.dialog;
  state.dialog = null;
  d?.resolve(result);
}

export function openRun(preset = {}) {
  state.runDialog = { ...preset, key: newId('run') };
}

export function openTerminal(title, opts) {
  state.terminalRequests.push({ id: newId('term'), title, opts });
}

// ---- 設定と状態 ----
export async function loadGuiPresets() {
  const result = await invoke('gui-presets:list');
  setGuiPresets(result.presets);
  state.presetErrors = result.errors;
  state.presetDirectory = result.directory;
  return result;
}

export async function loadSettings() {
  state.settings = await invoke('settings:get');
  return state.settings;
}

export async function saveSettings(patch) {
  state.settings = await invoke('settings:set', patch);
  return state.settings;
}

export async function refreshStatus() {
  try {
    state.status = await invoke('wslc:status');
  } catch (e) {
    state.status = { found: false, error: e.message };
  }
  return state.status;
}

export async function copyText(text, label = 'コピーしました') {
  await navigator.clipboard.writeText(text);
  toast(label, 'success', 2000);
}

/** GUI コンテナーのビューアーを開く (起動直後は接続できないことがあるので main 側でリトライ) */
export function openViewer(port, scheme = 'http', title = '', guiPath = '') {
  return act(() => invoke('app:openViewer', guiViewerUrl(port, scheme, guiPath), title), { refresh: false });
}
