// レンダラーに公開する安全な API
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'wslc:run', 'wslc:status', 'stream:start', 'stream:stop',
  'pty:start', 'pty:stop',
  'compose:up', 'compose:down', 'compose:simple', 'compose:pull', 'compose:build', 'compose:ps', 'compose:validate',
  'hub:search', 'hub:tags', 'hub:repo', 'hub:myRepos', 'hub:login', 'hub:status',
  'registry:login', 'registry:logout',
  'settings:get', 'settings:set', 'settings:setSecret',
  'storage:get', 'storage:setPath', 'storage:compact',
  'gui-presets:list', 'gui-presets:prepare-build', 'gui-presets:hash', 'gui-presets:files', 'gui-presets:save-file',
  'fs:open', 'fs:save', 'fs:read', 'fs:write', 'fs:exists', 'fs:join', 'fs:dirname', 'fs:resolve', 'fs:relative',
  'app:paths', 'app:openExternal', 'app:openPath', 'app:showItem', 'app:openViewer',
]);
const EVENTS = new Set(['stream:data', 'stream:exit', 'pty:data', 'pty:exit']);

contextBridge.exposeInMainWorld('api', {
  async invoke(channel, ...args) {
    if (!INVOKE.has(channel)) throw new Error(`blocked channel: ${channel}`);
    const r = await ipcRenderer.invoke(channel, ...args);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
  ptyWrite: (id, data) => ipcRenderer.send('pty:write', id, data),
  ptyResize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  on(channel, cb) {
    if (!EVENTS.has(channel)) return () => {};
    const l = (_e, ...a) => cb(...a);
    ipcRenderer.on(channel, l);
    return () => ipcRenderer.removeListener(channel, l);
  },
});
