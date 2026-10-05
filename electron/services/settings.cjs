// アプリ設定の永続化。トークンは safeStorage (Windows DPAPI) で暗号化して保存する
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { paths, toStored, fromStored } = require('./paths.cjs');

const DEFAULTS = {
  session: '',
  wslcStoragePath: '',
  pollInterval: 3000,
  hubUsername: '',
  composeProjects: [],
};

function file() {
  return paths.settings;
}

let cache = null;
function load() {
  if (cache) return cache;
  // 旧版の設定を初回だけコピーする。旧ファイルは保持する。
  const legacy = path.join(app.getPath('appData'), 'WSL Container Studio', 'settings.json');
  if (!fs.existsSync(file()) && fs.existsSync(legacy)) {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.copyFileSync(legacy, file(), fs.constants.COPYFILE_EXCL);
  }
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8').replace(/^\uFEFF/, '')) };
    cache.composeProjects = (cache.composeProjects || []).map((p) => ({ ...p, file: fromStored(p.file) }));
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save() {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const stored = { ...cache, composeProjects: (cache.composeProjects || []).map((p) => ({ ...p, file: toStored(p.file) })) };
  fs.writeFileSync(file(), JSON.stringify(stored, null, 2), 'utf8');
}

function publicSettings() {
  const s = { ...load() };
  const secrets = s.secrets || {};
  delete s.secrets;
  s.hasHubToken = !!secrets.hubToken;
  return s;
}

function set(patch) {
  load();
  // eslint-disable-next-line no-unused-vars
  const { secrets, hasHubToken, ...rest } = patch || {};
  Object.assign(cache, rest);
  save();
  return publicSettings();
}

function setSecret(key, value) {
  load();
  cache.secrets = cache.secrets || {};
  if (!value) {
    delete cache.secrets[key];
  } else if (safeStorage.isEncryptionAvailable()) {
    cache.secrets[key] = { enc: true, v: safeStorage.encryptString(value).toString('base64') };
  } else {
    cache.secrets[key] = { enc: false, v: Buffer.from(value, 'utf8').toString('base64') };
  }
  save();
  return publicSettings();
}

function getSecret(key) {
  const s = load().secrets?.[key];
  if (!s) return '';
  const buf = Buffer.from(s.v, 'base64');
  return s.enc ? safeStorage.decryptString(buf) : buf.toString('utf8');
}

module.exports = { load, set, setSecret, getSecret, publicSettings };
