// GUI コンテナー (noVNC など) を表示するビューアーウィンドウ
const { BrowserWindow } = require('electron');
const { randomUUID } = require('node:crypto');
const wslc = require('./services/wslc.cjs');
const { paths } = require('./services/paths.cjs');
const { resolveViewerAuth } = require('./services/viewer-auth.cjs');

function isLocalUrl(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

function openViewer(url, title) {
  if (!isLocalUrl(url)) throw new Error('ローカルホスト以外の URL は開けません');
  const v = new BrowserWindow({
    width: 1280,
    height: 800,
    title: title || url,
    icon: paths.appIcon,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      // 開くたびに新しいメモリー上のセッションを使い、古いキャッシュや認証を持ち越さない
      partition: `gui-viewer-${randomUUID()}`,
    },
  });
  // WebSocket (wss) 接続にも自己署名証明書の許可を適用する。
  // このウィンドウ専用セッションで、表示先のループバックホストだけを許可する。
  v.webContents.session.setCertificateVerifyProc((request, cb) => {
    cb(request.hostname === new URL(url).hostname ? 0 : -3);
  });
  // 自己署名証明書を使う GUI コンテナー (KasmVNC 等) を許可
  v.webContents.on('certificate-error', (e, u, _err, _cert, cb) => {
    if (isLocalUrl(u)) {
      e.preventDefault();
      cb(true);
    } else cb(false);
  });
  v.webContents.on('login', (e, details, authInfo, cb) => {
    e.preventDefault();
    resolveViewerAuth(url, details, authInfo, wslc).then((credentials) => {
      if (credentials && !v.isDestroyed()) cb(credentials.username, credentials.password);
      else cb();
    }).catch(() => cb());
  });
  v.webContents.on('page-title-updated', (e, t) => {
    e.preventDefault();
    v.setTitle(`${title || ''} — ${t}`);
  });
  // コンテナー起動直後はまだ待ち受けていないため、一定回数リトライする
  let retries = 0;
  v.webContents.on('did-fail-load', (_e, code, desc, failedUrl, isMainFrame) => {
    if (code === -3 || !isMainFrame || v.isDestroyed() || retries >= 60) return;
    retries++;
    const html = `<body style="background:#0d1117;color:#c9d1d9;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0">
      <div style="text-align:center"><h2>GUI アプリの起動を待っています…</h2><p>${failedUrl} (${retries}/60)</p><p style="opacity:.6">${desc}</p></div></body>`;
    v.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
    setTimeout(() => !v.isDestroyed() && v.loadURL(url).catch(() => {}), 2000);
  });
  v.loadURL(url).catch(() => {});
}

module.exports = { openViewer };
