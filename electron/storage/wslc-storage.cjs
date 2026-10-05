// Windows 標準の wslc.exe の設定ファイル (%LOCALAPPDATA%\wslc\settings.yaml) の
// session.storagePath でイメージ・コンテナー・ボリュームの保存先を設定する
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

function settingsFile() {
  return path.join(process.env.LOCALAPPDATA || '', 'wslc', 'settings.yaml');
}

function vhdPath(storagePath, session) {
  return path.join(storagePath, 'wslc', 'sessions', session, 'storage.vhdx');
}

/** アプリで選択した保存先、既存のwslc設定、初期値の順に解決する。 */
function resolveStoragePath(preferred, fallback, { file = settingsFile() } = {}) {
  if (preferred) {
    if (typeof preferred !== 'string' || !path.isAbsolute(preferred)) throw new Error('保存先には絶対パスが必要です');
    return path.resolve(preferred);
  }
  let content;
  try { content = fs.readFileSync(file, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
  const doc = YAML.parseDocument(content);
  if (doc.errors.length) throw new Error(`wslc の設定ファイルを解析できません: ${doc.errors[0].message}`);
  const configured = doc.getIn(['session', 'storagePath']);
  if (configured === 'default') return process.env.LOCALAPPDATA || fallback;
  if (configured == null) return fallback;
  if (typeof configured !== 'string' || !path.isAbsolute(configured)) throw new Error('wslc の保存先には絶対パスが必要です');
  return path.resolve(configured);
}

/** 指定した保存先にあるVHDXの一覧。設定と実データの場所を区別して表示する。 */
function findVhds(bases) {
  const result = [];
  const seen = new Set();
  for (const base of bases.filter(Boolean)) {
    const resolved = path.resolve(base);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    const dir = path.join(resolved, 'wslc', 'sessions');
    let sessions;
    try { sessions = fs.readdirSync(dir); } catch { continue; }
    for (const session of sessions) {
      const file = vhdPath(resolved, session);
      try { result.push({ session, path: file, size: fs.statSync(file).size }); } catch { /* VHDなし */ }
    }
  }
  return result;
}

/**
 * storagePath を設定する。既存のコメントや他の設定は保持する
 * @returns {{ file, storagePath, previous, changed }}
 */
function ensureStoragePath(storagePath, { file = settingsFile() } = {}) {
  if (!path.isAbsolute(storagePath)) throw new Error('保存先には絶対パスが必要です');
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    text = '';
  }
  const doc = YAML.parseDocument(text || '{}');
  if (doc.errors.length) throw new Error(`wslc の設定ファイルを解析できません: ${doc.errors[0].message}`);

  const current = doc.getIn(['session', 'storagePath']);
  const previous = current == null || current === 'default' ? null : String(current);
  if (previous && path.resolve(previous) === path.resolve(storagePath)) {
    return { file, storagePath, previous, changed: false };
  }

  if (!YAML.isMap(doc.contents)) doc.contents = doc.createNode({});
  const session = doc.get('session', true);
  if (!YAML.isMap(session)) {
    // 既定テンプレートでは session: の中身がすべてコメントなので値は null。コメントは残したまま map にする
    const map = doc.createNode({});
    if (session?.commentBefore) map.commentBefore = session.commentBefore;
    if (session?.comment) map.comment = session.comment;
    doc.set('session', map);
  }
  doc.setIn(['session', 'storagePath'], storagePath);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(storagePath, { recursive: true });
  if (text && !fs.existsSync(`${file}.wcs-backup`)) {
    fs.writeFileSync(`${file}.wcs-backup`, text, { encoding: 'utf8', flag: 'wx' });
  }
  fs.writeFileSync(file, doc.toString({ lineWidth: 0 }), 'utf8');
  return { file, storagePath, previous, changed: true };
}

module.exports = { settingsFile, ensureStoragePath, vhdPath, resolveStoragePath, findVhds };
