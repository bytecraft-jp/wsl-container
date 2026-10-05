// ファイル操作・ダイアログ・外部アプリ連携・GUI ビューアー
const fs = require('node:fs');
const path = require('node:path');
const { app, dialog, shell } = require('electron');
const { paths } = require('../services/paths.cjs');
const { openViewer } = require('../viewer.cjs');

module.exports = function registerFiles({ handle, getWindow }) {
  handle('fs:open', async (opts = {}) => {
    const r = await dialog.showOpenDialog(getWindow(), opts);
    return r.canceled ? null : r.filePaths;
  });
  handle('fs:save', async (opts = {}) => {
    const r = await dialog.showSaveDialog(getWindow(), opts);
    return r.canceled ? null : r.filePath;
  });
  handle('fs:read', (p) => fs.readFileSync(p, 'utf8'));
  handle('fs:write', (p, content) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
    return true;
  });
  handle('fs:exists', (p) => fs.existsSync(p));
  handle('fs:join', (...parts) => path.join(...parts));
  handle('fs:dirname', (p) => path.dirname(p));
  handle('fs:resolve', (...parts) => path.resolve(...parts));
  handle('fs:relative', (from, to) => path.relative(from, to));

  handle('app:paths', () => ({
    ...paths,
    userData: app.getPath('userData'),
    documents: app.getPath('documents'),
    home: app.getPath('home'),
  }));
  handle('app:openExternal', (url) => {
    if (!/^https?:\/\//.test(url)) throw new Error('invalid url');
    return shell.openExternal(url);
  });
  handle('app:openPath', (p) => shell.openPath(p));
  handle('app:showItem', (p) => shell.showItemInFolder(p));
  handle('app:openViewer', (url, title) => openViewer(url, title));
};
