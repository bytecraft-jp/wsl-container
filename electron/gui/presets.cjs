const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const YAML = require('yaml');

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const EXT = /\.(?:yaml|yml|json)$/i;
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function within(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function text(value, key, fallback = '') {
  if (value == null) return fallback;
  if (typeof value !== 'string' || /\0/.test(value)) throw new Error(`${key} は文字列で指定してください`);
  return value;
}
function port(value, key) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${key} は 1〜65535 の整数で指定してください`);
  return value;
}
function strings(value, key) {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && !v.includes('\0'))) throw new Error(`${key} は文字列の配列で指定してください`);
  return value;
}
function assetPath(root, directory, relative, directoryOnly = false) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('build のパスは定義ファイルからの相対パスで指定してください');
  const resolved = path.resolve(directory, relative);
  if (!within(root, resolved)) throw new Error('build のパスはプリセットの保存領域内に指定してください');
  const real = fs.realpathSync(resolved);
  if (!within(fs.realpathSync(root), real)) throw new Error('保存領域外へのリンクは使用できません');
  const stat = fs.statSync(real);
  if (directoryOnly ? !stat.isDirectory() : !stat.isFile()) throw new Error(`build の参照先が${directoryOnly ? 'フォルダー' : 'ファイル'}ではありません`);
  return real;
}

function normalize(raw, file, kind, root) {
  if (!object(raw)) throw new Error('プリセットはオブジェクトで指定してください');
  if (typeof raw.id !== 'string' || !ID.test(raw.id)) throw new Error('id は英小文字・数字・ハイフン・アンダースコアで指定してください（最大64文字）');
  for (const key of ['title', 'image']) if (typeof raw[key] !== 'string' || !raw[key].trim()) throw new Error(`${key} が必要です`);
  const p = {
    id: raw.id, title: text(raw.title, 'title'), image: text(raw.image, 'image'),
    description: text(raw.description, 'description'), port: port(raw.port, 'port'),
    hostPort: port(raw.hostPort ?? raw.port, 'hostPort'), scheme: raw.scheme ?? 'http',
    guiPath: text(raw.guiPath, 'guiPath'), shm: text(raw.shm, 'shm'),
    configTarget: text(raw.configTarget, 'configTarget', '/config'),
    containerName: text(raw.containerName, 'containerName', `wcs-gui-${raw.id}`),
    color: text(raw.color, 'color', '#6c8cff'), env: {},
    order: raw.order ?? 100, sourceFile: file, sourceKind: kind,
  };
  if (!['http', 'https'].includes(p.scheme)) throw new Error('scheme は http または https を指定してください');
  if (!Number.isFinite(p.order)) throw new Error('order は数値で指定してください');
  if (raw.hidden != null) {
    if (typeof raw.hidden !== 'boolean') throw new Error('hidden は true / false で指定してください');
    p.hidden = raw.hidden;
  }
  if (!/^#[0-9a-f]{6}$/i.test(p.color)) throw new Error('color は #rrggbb で指定してください');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(p.containerName)) throw new Error('containerName が不正です');
  if (!p.configTarget.startsWith('/')) throw new Error('configTarget はコンテナー内の絶対パスで指定してください');
  if (p.guiPath) {
    const base = new URL('http://127.0.0.1/');
    if (new URL(p.guiPath, base).origin !== base.origin) throw new Error('guiPath は同じホスト内のパスで指定してください');
  }
  if (raw.env != null) {
    if (!object(raw.env)) throw new Error('env はキーと値のオブジェクトで指定してください');
    for (const [key, value] of Object.entries(raw.env)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) || !['string', 'number', 'boolean'].includes(typeof value) || String(value).includes('\0')) throw new Error('env のキーまたは値が不正です');
      p.env[key] = String(value);
    }
  }
  if (raw.auth != null) {
    if (raw.auth !== 'kasm') throw new Error('auth は kasm を指定してください');
    p.auth = raw.auth;
  }
  if (raw.readyCommand != null) {
    p.readyCommand = strings(raw.readyCommand, 'readyCommand');
    if (!p.readyCommand.length || !p.readyCommand[0]) throw new Error('readyCommand には実行するコマンドが必要です');
  }
  for (const key of ['command', 'entrypoint', 'user', 'workdir', 'network', 'memory', 'cpus', 'configVolume']) {
    if (raw[key] != null) p[key] = text(raw[key], key);
  }
  if (raw.volumes != null) {
    if (!Array.isArray(raw.volumes)) throw new Error('volumes は配列で指定してください');
    p.volumes = raw.volumes.map((v) => {
      if (!object(v) || typeof v.target !== 'string' || !v.target.startsWith('/')) throw new Error('volumes の target はコンテナー内の絶対パスで指定してください');
      if (v.readonly != null && typeof v.readonly !== 'boolean') throw new Error('volumes の readonly は true / false で指定してください');
      return { source: text(v.source, 'volumes.source'), target: text(v.target, 'volumes.target'), readonly: !!v.readonly };
    });
  }
  if (raw.build != null) {
    if (!object(raw.build)) throw new Error('build は context / dockerfile を持つオブジェクトで指定してください');
    const context = assetPath(root, path.dirname(file), raw.build.context ?? '.', true);
    const dockerfile = text(raw.build.dockerfile, 'build.dockerfile', 'Dockerfile');
    assetPath(context, context, dockerfile);
    const requires = raw.build.requires == null ? [] : strings(raw.build.requires, 'build.requires');
    if (!requires.every(id => ID.test(id))) throw new Error('build.requires はプリセットの id の配列で指定してください');
    p.build = { context, dockerfile, requires };
  }
  return p;
}

// Flat YAML/JSON files, or directories containing preset.yaml/yml/json.
function definitionFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile() && EXT.test(entry.name)) files.push(path.join(dir, entry.name));
    else if (entry.isDirectory()) {
      const manifests = ['preset.yaml', 'preset.yml', 'preset.json'].map((n) => path.join(dir, entry.name, n));
      files.push(...manifests.filter((file) => fs.existsSync(file)));
    }
  }
  return files;
}

/** examplesDir の見本は、初回だけ customDir/examples へコピーする */
function loadPresets({ builtinsDir, customDir, examplesDir }) {
  fs.mkdirSync(customDir, { recursive: true });
  if (examplesDir && fs.existsSync(examplesDir) && !fs.existsSync(path.join(customDir, 'examples'))) {
    const destination = path.join(customDir, 'examples');
    fs.mkdirSync(destination);
    copyContext(examplesDir, destination);
  }
  const presets = new Map();
  const errors = [];
  for (const [kind, dir] of [['builtin', builtinsDir], ['custom', customDir]]) {
    const seen = new Set();
    let files;
    try { files = definitionFiles(dir); } catch (e) { errors.push({ file: dir, message: e.message }); continue; }
    for (const file of files) {
      try {
        if (!within(fs.realpathSync(dir), fs.realpathSync(file))) throw new Error('保存領域外のプリセットは読み込めません');
        const raw = YAML.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), { uniqueKeys: true, maxAliasCount: 20 });
        const preset = normalize(raw, file, kind, dir);
        if (seen.has(preset.id)) throw new Error(`id「${preset.id}」が同じ保存先内で重複しています`);
        seen.add(preset.id);
        // 同梱プリセットを上書きしている自作プリセット (同梱プリセットを編集して保存したもの)
        if (kind === 'custom' && presets.get(preset.id)?.sourceKind === 'builtin') preset.overridesBuiltin = true;
        presets.set(preset.id, preset);
      } catch (e) { errors.push({ file, message: e.message }); }
    }
  }
  return { presets: [...presets.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)), errors, directory: customDir };
}

/** 既存ファイルは上書きしない。destination が null ならリンクの検査だけ行う */
function copyContext(source, destination) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`ビルド用ファイルにリンクは使用できません: ${from}`);
    if (!destination) {
      if (entry.isDirectory()) copyContext(from, null);
      continue;
    }
    const to = path.join(destination, entry.name);
    if (fs.existsSync(to) && fs.lstatSync(to).isSymbolicLink()) throw new Error(`ビルド先にリンクは使用できません: ${to}`);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyContext(from, to);
    } else if (entry.isFile() && !fs.existsSync(to)) fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  }
}

// 自作プリセットは自分のフォルダーをそのままビルドする。同梱プリセットは asar 内にあり
// wslc から読めないため、毎回 data/gui-builds/<id>/ へ作り直す (古いファイルを残さない)。
function prepareDefinition(p, options) {
  if (!p) throw new Error('プリセットが見つかりません。再読み込みしてください');
  if (!p.build) throw new Error('このプリセットにはビルド設定がありません');
  if (p.sourceKind === 'custom') {
    copyContext(p.build.context, null);
    return { directory: p.build.context, dockerfile: p.build.dockerfile };
  }
  const directory = path.join(options.buildsDir, p.id);
  fs.mkdirSync(options.buildsDir, { recursive: true });
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error('ビルド先にリンクは使用できません');
  fs.mkdirSync(directory, { recursive: true });
  mirrorContext(p.build.context, directory);
  return { directory, dockerfile: p.build.dockerfile };
}

/**
 * destination を source と同じ内容にする。フォルダーは消さずにファイルを上書きし、source にないものだけ削除する。
 * Windows ではエクスプローラーなどがフォルダーのハンドルを持っていると、削除が ENOTEMPTY になったり、
 * 削除直後の同名フォルダーの作成が EPERM になったりするため
 */
function mirrorContext(source, destination) {
  const entries = fs.readdirSync(source, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  for (const name of fs.readdirSync(destination)) {
    if (!names.has(name)) fs.rmSync(path.join(destination, name), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`ビルド用ファイルにリンクは使用できません: ${from}`);
    const existing = fs.existsSync(to) ? fs.lstatSync(to) : null;
    if (existing?.isSymbolicLink()) throw new Error(`ビルド先にリンクは使用できません: ${to}`);
    if (entry.isDirectory()) {
      if (existing && !existing.isDirectory()) fs.rmSync(to, { force: true, maxRetries: 10, retryDelay: 100 });
      fs.mkdirSync(to, { recursive: true });
      mirrorContext(from, to);
    } else if (entry.isFile()) {
      if (existing?.isDirectory()) fs.rmSync(to, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      fs.copyFileSync(from, to);
    }
  }
}

/** id のプリセットと、build.requires で依存するプリセットをビルド順に並べる */
function buildOrder(id, presets) {
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Error(`ビルド依存が循環しています: ${key}`);
    const p = presets.get(key);
    if (!p?.build) throw new Error(`ビルド用プリセットが見つかりません: ${key}`);
    visiting.add(key);
    for (const dependency of p.build.requires) visit(dependency);
    visiting.delete(key);
    visited.add(key);
    ordered.push(p);
  }
  visit(id);
  return ordered;
}

function prepareBuild(id, options) {
  const presets = new Map(loadPresets(options).presets.map(p => [p.id, p]));
  return buildOrder(id, presets).map(p => ({ id: p.id, title: p.title, image: p.image, ...prepareDefinition(p, options) }));
}

// skip: 定義ファイル。内容は正規化した設定としてハッシュに含めるため、表示用の項目の変更では作り直さない
function hashContext(hash, dir, skip, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) hashContext(hash, full, skip, relative);
    else if (entry.isFile() && full !== skip) hash.update(`${relative}\0`).update(fs.readFileSync(full)).update('\0');
  }
}

// 表示だけに使う項目。変更してもコンテナーを作り直さない
const DISPLAY_KEYS = new Set(['title', 'description', 'color', 'order', 'hidden', 'sourceFile', 'sourceKind', 'overridesBuiltin', 'build', 'readyCommand']);

/**
 * プリセットの内容のハッシュ。依存するプリセット (共通ベースなど) のビルド用ファイルと、
 * コンテナーの実行設定を含む。起動時に既存コンテナーのラベルと比べ、変更があれば作り直す。
 */
function presetHash(id, options) {
  const presets = new Map(loadPresets(options).presets.map(p => [p.id, p]));
  const p = presets.get(id);
  if (!p) throw new Error('プリセットが見つかりません。再読み込みしてください');
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(Object.entries(p).filter(([key]) => !DISPLAY_KEYS.has(key))));
  if (p.build) {
    for (const item of buildOrder(id, presets)) {
      hash.update(`\0${item.id}\0${item.image}\0${item.build.dockerfile}\0`);
      hashContext(hash, item.build.context, fs.realpathSync(item.sourceFile));
    }
  }
  return hash.digest('hex').slice(0, 16);
}

// ---- エディター用: プリセットのファイルの読み書き ----
const MAX_EDIT_SIZE = 1024 * 1024;

function findPreset(id, options) {
  const p = loadPresets(options).presets.find(item => item.id === id);
  if (!p) throw new Error('プリセットが見つかりません。再読み込みしてください');
  return p;
}

/** フォルダー形式 (preset.yaml) はフォルダー全体、単一ファイル形式は定義ファイルだけが編集対象 */
function editRoot(p) {
  return /^preset\.(?:ya?ml|json)$/i.test(path.basename(p.sourceFile)) ? path.dirname(p.sourceFile) : null;
}

function textFiles(dir, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...textFiles(full, relative));
    else if (entry.isFile() && fs.statSync(full).size <= MAX_EDIT_SIZE && !fs.readFileSync(full).includes(0)) files.push(relative);
  }
  return files;
}

function presetFiles(id, options) {
  const p = findPreset(id, options);
  const root = editRoot(p);
  const definition = path.basename(p.sourceFile);
  const dockerfile = root && p.build ? path.relative(root, path.join(p.build.context, p.build.dockerfile)).split(path.sep).join('/') : '';
  const rank = (name) => (name === definition ? 0 : name === dockerfile ? 1 : 2);
  const names = (root ? textFiles(root) : [definition]).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const directory = root || path.dirname(p.sourceFile);
  return {
    id: p.id, title: p.title, kind: p.sourceKind, definition, dockerfile,
    // 同梱プリセットはアプリ本体内にあるため、保存時に自作プリセットとしてコピーする
    saveDirectory: p.sourceKind === 'builtin' ? (root ? path.join(options.customDir, p.id) : options.customDir) : directory,
    files: names.map(name => ({ name, content: fs.readFileSync(path.join(directory, name), 'utf8') })),
  };
}

function savePresetFile(id, name, content, options) {
  if (typeof content !== 'string') throw new Error('保存する内容が不正です');
  const p = findPreset(id, options);
  const root = editRoot(p);
  const source = root || path.dirname(p.sourceFile);
  const allowed = root ? textFiles(root) : [path.basename(p.sourceFile)];
  if (!allowed.includes(name)) throw new Error(`編集できないファイルです: ${name}`);
  let directory = source;
  if (p.sourceKind === 'builtin') {
    fs.mkdirSync(options.customDir, { recursive: true });
    if (root) {
      directory = path.join(options.customDir, p.id);
      if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error('保存先にリンクは使用できません');
      fs.mkdirSync(directory, { recursive: true });
      copyContext(root, directory);
    } else directory = options.customDir;
  }
  const target = path.resolve(directory, name);
  if (!within(directory, target)) throw new Error('保存先がプリセットのフォルダー外です');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return { path: target, directory };
}

module.exports = { loadPresets, prepareBuild, presetHash, presetFiles, savePresetFile };
