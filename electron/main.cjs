// Electron メインプロセス: 起動・メインウィンドウ・IPC の登録
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');
const { paths, applyElectronPaths } = require('./services/paths.cjs');
const storage = require('./storage/wslc-storage.cjs');

if (process.platform === 'win32') app.setAppUserModelId('jp.bytecraft.wsl-container-studio');
applyElectronPaths();
const settings = require('./services/settings.cjs');
const wslc = require('./services/wslc.cjs');
// wslc の保存先設定は、最初の wslc 呼び出しより前に反映する。
paths.wslcStorage = storage.resolveStoragePath(settings.load().wslcStoragePath, paths.wslcStorage);
if (wslc.findWslc()) storage.ensureStoragePath(paths.wslcStorage);

const { createIpc } = require('./ipc/context.cjs');

let win = null;
const ipc = createIpc(() => win);

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 660,
    backgroundColor: '#0d1117',
    title: 'WSL Container Studio',
    icon: paths.appIcon,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d1117', symbolColor: '#c9d1d9', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // README 内のリンクなどでメインウィンドウが遷移しないようにする
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(devUrl || 'file://')) return;
    e.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  win.on('closed', () => {
    win = null;
    ipc.stopAll();
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  wslc.setSession(settings.load().session);
  for (const register of ['wslc', 'compose', 'hub', 'settings', 'gui-presets', 'files']) require(`./ipc/${register}.cjs`)(ipc);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
