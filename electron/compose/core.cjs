// compose ファイルを wslc コマンドに変換する純粋ロジック (Electron 非依存・単体テスト可能)
const YAML = require('yaml');
const path = require('node:path');
const crypto = require('node:crypto');

const LABEL_PROJECT = 'com.docker.compose.project';
const LABEL_SERVICE = 'com.docker.compose.service';
const LABEL_HASH = 'wcs.compose.hash';
const LABEL_FILE = 'wcs.compose.file';
const LABEL_GUI_PORT = 'wcs.gui.port';

// wslc run が対応していないため無視するキー (警告を出す)
const UNSUPPORTED_KEYS = [
  'restart', 'privileged', 'cap_add', 'cap_drop', 'extra_hosts', 'devices', 'pid', 'ipc',
  'security_opt', 'sysctls', 'logging', 'network_mode', 'links', 'profiles', 'secrets', 'configs',
  'platform', 'init', 'expose',
];

/** .env 形式のテキストを読み取る */
function parseDotEnv(text) {
  const env = {};
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

/** ${VAR}, ${VAR:-default}, ${VAR-default}, $VAR, $$ を展開 */
function interpolate(text, env) {
  return text.replace(/\$\$|\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (all, expr, simple) => {
    if (all === '$$') return '$';
    if (simple) return env[simple] ?? '';
    const m = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:(:?-|:?\?)(.*))?$/);
    if (!m) return all;
    const [, name, op, arg] = m;
    const val = env[name];
    if (!op) return val ?? '';
    if (op === ':-') return val ? val : arg;
    if (op === '-') return val ?? arg;
    if ((op === ':?' && !val) || (op === '?' && val == null)) {
      throw new Error(`環境変数 ${name} が必要です: ${arg}`);
    }
    return val;
  });
}

/** シェル風の文字列分割 */
function shellSplit(str) {
  const out = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < str.length) cur += str[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < str.length) {
      cur += str[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += c;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

function sanitizeName(s) {
  return String(s || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^[-_]+/, '') || 'project';
}

function asList(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function kvList(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String);
  return Object.entries(v).map(([k, val]) => (val == null ? k : `${k}=${val}`));
}

/** "1m30s" -> 90 */
function durationToSeconds(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  let total = 0;
  const re = /(\d+(?:\.\d+)?)(h|ms|m|s|us|ns)/g;
  let m;
  let matched = false;
  while ((m = re.exec(v))) {
    matched = true;
    const n = parseFloat(m[1]);
    total += { h: 3600, m: 60, s: 1, ms: 0.001, us: 1e-6, ns: 1e-9 }[m[2]] * n;
  }
  return matched ? Math.round(total) : parseInt(v, 10);
}

function isBindSource(src) {
  return /^(\.|\/|~|[A-Za-z]:[\\/]|\\\\)/.test(src);
}

function resolveHostPath(src, baseDir) {
  if (/^[A-Za-z]:[\\/]/.test(src) || src.startsWith('\\\\') || src.startsWith('/')) return src;
  if (src.startsWith('~')) return path.join(process.env.USERPROFILE || process.env.HOME || '', src.slice(1));
  return path.resolve(baseDir, src);
}

/** "src:dst:mode" を分割 (Windows のドライブレター C: を考慮) */
function splitVolumeSpec(spec) {
  const m = spec.match(/^([A-Za-z]:[\\/][^:]*)(?::(.*))?$/);
  if (m) {
    const rest = m[2] ? m[2].split(':') : [];
    return [m[1], ...rest];
  }
  return spec.split(':');
}

function load(text, { file, env = {} } = {}) {
  const expanded = interpolate(text, env);
  const doc = YAML.parse(expanded) || {};
  if (typeof doc !== 'object') throw new Error('compose ファイルの形式が正しくありません');
  if (!doc.services || typeof doc.services !== 'object') throw new Error('services が定義されていません');
  const baseDir = file ? path.dirname(file) : process.cwd();
  const project = sanitizeName(doc.name || path.basename(baseDir));
  return { doc, project, baseDir };
}

function networkRealName(project, doc, key) {
  const def = doc.networks?.[key];
  if (def?.name) return def.name;
  if (def?.external) return typeof def.external === 'object' && def.external.name ? def.external.name : key;
  return `${project}_${key}`;
}

function volumeRealName(project, doc, key) {
  const def = doc.volumes?.[key];
  if (def?.name) return def.name;
  if (def?.external) return key;
  return `${project}_${key}`;
}

function serviceNetworks(svc) {
  if (!svc.networks) return [{ key: 'default', aliases: [] }];
  if (Array.isArray(svc.networks)) return svc.networks.map((k) => ({ key: k, aliases: [] }));
  return Object.entries(svc.networks).map(([k, v]) => ({
    key: k,
    aliases: asList(v?.aliases),
    ip: v?.ipv4_address,
  }));
}

function dependsOn(svc) {
  if (!svc.depends_on) return [];
  if (Array.isArray(svc.depends_on)) return svc.depends_on.map((name) => ({ name, condition: 'service_started' }));
  return Object.entries(svc.depends_on).map(([name, v]) => ({ name, condition: v?.condition || 'service_started' }));
}

/** 依存関係順に並べる。循環があればエラー */
function orderServices(services) {
  const names = Object.keys(services);
  const visited = new Map();
  const out = [];
  const visit = (n, stack) => {
    if (!services[n]) throw new Error(`depends_on に未定義のサービス "${n}" があります`);
    const st = visited.get(n);
    if (st === 'done') return;
    if (st === 'visiting') throw new Error(`depends_on が循環しています: ${[...stack, n].join(' → ')}`);
    visited.set(n, 'visiting');
    for (const d of dependsOn(services[n])) visit(d.name, [...stack, n]);
    visited.set(n, 'done');
    out.push(n);
  };
  names.forEach((n) => visit(n, []));
  return out;
}

/** 指定サービスとその依存を含む集合 */
function withDependencies(services, targets) {
  if (!targets || !targets.length) return Object.keys(services);
  const set = new Set();
  const add = (n) => {
    if (set.has(n) || !services[n]) return;
    set.add(n);
    dependsOn(services[n]).forEach((d) => add(d.name));
  };
  targets.forEach(add);
  return [...set];
}

function healthArgs(hc) {
  if (!hc) return [];
  if (hc.disable) return ['--no-healthcheck'];
  const a = [];
  let test = hc.test;
  if (Array.isArray(test)) {
    if (test[0] === 'NONE') return ['--no-healthcheck'];
    if (test[0] === 'CMD-SHELL') test = test.slice(1).join(' ');
    else if (test[0] === 'CMD') test = test.slice(1).map((t) => (/\s/.test(t) ? `"${t}"` : t)).join(' ');
    else test = test.join(' ');
  }
  if (test) a.push('--health-cmd', String(test));
  if (hc.interval) a.push('--health-interval', String(hc.interval));
  if (hc.timeout) a.push('--health-timeout', String(hc.timeout));
  if (hc.retries != null) a.push('--health-retries', String(hc.retries));
  if (hc.start_period) a.push('--health-start-period', String(hc.start_period));
  return a;
}

function imageFor(project, name, svc) {
  return svc.image || `${project}-${name}`;
}

function buildSpec(project, name, svc, baseDir) {
  if (!svc.build) return null;
  const b = typeof svc.build === 'string' ? { context: svc.build } : svc.build;
  const context = resolveHostPath(b.context || '.', baseDir);
  const args = ['build', '-t', imageFor(project, name, svc)];
  if (b.dockerfile) args.push('-f', resolveHostPath(b.dockerfile, context));
  kvList(b.args).forEach((kv) => args.push('--build-arg', kv));
  if (b.target) args.push('--target', b.target);
  kvList(b.labels).forEach((kv) => args.push('-l', kv));
  args.push(context);
  return { args, context };
}

/** 1 サービス分の wslc run 引数を組み立てる */
function serviceRunPlan(ctx, name) {
  const { doc, project, baseDir } = ctx;
  const svc = doc.services[name] || {};
  const warnings = [];
  for (const k of UNSUPPORTED_KEYS) {
    if (svc[k] != null) warnings.push(`${name}: "${k}" は wslc では未対応のため無視します`);
  }
  if (svc.deploy?.replicas > 1) warnings.push(`${name}: deploy.replicas は未対応のため 1 つだけ起動します`);

  const containerName = svc.container_name || `${project}-${name}-1`;
  const image = imageFor(project, name, svc);
  const flags = [];
  const nets = serviceNetworks(svc);
  const first = nets[0];

  if (svc.hostname) flags.push('-h', String(svc.hostname));
  if (svc.domainname) flags.push('--domainname', String(svc.domainname));
  if (svc.user != null) flags.push('-u', String(svc.user));
  if (svc.working_dir) flags.push('-w', String(svc.working_dir));
  if (svc.tty) flags.push('-t');
  if (svc.stdin_open) flags.push('-i');

  asList(svc.env_file).forEach((f) => {
    const p = typeof f === 'object' ? f.path : f;
    flags.push('--env-file', resolveHostPath(p, baseDir));
  });
  kvList(svc.environment).forEach((kv) => {
    if (!kv.includes('=') && process.env[kv] != null) kv = `${kv}=${process.env[kv]}`;
    flags.push('-e', kv);
  });

  for (const p of asList(svc.ports)) {
    if (typeof p === 'object') {
      let s = `${p.target}`;
      if (p.published) s = `${p.published}:${s}`;
      if (p.host_ip) s = `${p.host_ip}:${s}`;
      if (p.protocol && p.protocol !== 'tcp') s += `/${p.protocol}`;
      flags.push('-p', s);
    } else {
      flags.push('-p', String(p));
    }
  }

  for (const v of asList(svc.volumes)) {
    if (typeof v === 'object') {
      const ro = v.read_only ? ':ro' : '';
      if (v.type === 'tmpfs') {
        flags.push('--tmpfs', v.target);
      } else if (v.type === 'bind') {
        flags.push('-v', `${resolveHostPath(v.source, baseDir)}:${v.target}${ro}`);
      } else if (v.source) {
        flags.push('-v', `${volumeRealName(project, doc, v.source)}:${v.target}${ro}`);
      } else {
        flags.push('-v', v.target);
      }
      continue;
    }
    const parts = splitVolumeSpec(String(v));
    if (parts.length === 1) {
      flags.push('-v', parts[0]);
      continue;
    }
    const [src, dst, mode] = parts;
    const realSrc = isBindSource(src) ? resolveHostPath(src, baseDir) : volumeRealName(project, doc, src);
    flags.push('-v', `${realSrc}:${dst}${mode ? `:${mode}` : ''}`);
  }

  asList(svc.tmpfs).forEach((t) => flags.push('--tmpfs', String(t)));
  asList(svc.dns).forEach((d) => flags.push('--dns', String(d)));
  asList(svc.dns_search).forEach((d) => flags.push('--dns-search', String(d)));
  asList(svc.dns_opt).forEach((d) => flags.push('--dns-option', String(d)));
  if (svc.shm_size) flags.push('--shm-size', String(svc.shm_size));

  const limits = svc.deploy?.resources?.limits || {};
  const mem = svc.mem_limit || limits.memory;
  if (mem) flags.push('-m', String(mem));
  const cpus = svc.cpus || limits.cpus;
  if (cpus) flags.push('--cpus', String(cpus));
  const gpuReq = (svc.deploy?.resources?.reservations?.devices || []).some((d) => asList(d.capabilities).includes('gpu'));
  if (svc.gpus || gpuReq) flags.push('--gpus', 'all');

  if (svc.stop_signal) flags.push('--stop-signal', String(svc.stop_signal));
  if (svc.stop_grace_period) flags.push('--stop-timeout', String(durationToSeconds(svc.stop_grace_period)));
  if (svc.ulimits) {
    for (const [k, v] of Object.entries(svc.ulimits)) {
      flags.push('--ulimit', typeof v === 'object' ? `${k}=${v.soft}:${v.hard}` : `${k}=${v}`);
    }
  }
  flags.push(...healthArgs(svc.healthcheck));

  // ネットワーク (最初の 1 つは run 時、残りは network connect)
  flags.push('--network', networkRealName(project, doc, first.key), '--network-alias', name);
  first.aliases.forEach((a) => flags.push('--network-alias', String(a)));
  if (first.ip) flags.push('--ip', String(first.ip));
  const extraNetworks = nets.slice(1).map((n) => ({
    name: networkRealName(project, doc, n.key),
    aliases: [name, ...n.aliases.map(String)],
    ip: n.ip,
  }));

  // ラベル
  const labels = kvList(svc.labels);
  const gui = svc['x-wcs-gui'];
  // x-wcs-gui.port はホスト側で公開しているポート番号
  if (gui?.port) labels.push(`${LABEL_GUI_PORT}=${gui.port}`, `wcs.gui.scheme=${gui.scheme || 'http'}`);
  labels.push(`${LABEL_PROJECT}=${project}`, `${LABEL_SERVICE}=${name}`);
  if (ctx.file) labels.push(`${LABEL_FILE}=${ctx.file}`);

  // エントリーポイントとコマンド
  let entry = svc.entrypoint;
  let command = svc.command;
  if (typeof command === 'string') command = shellSplit(command);
  if (typeof entry === 'string') entry = shellSplit(entry);
  command = command ? command.map(String) : [];
  if (Array.isArray(entry) && entry.length) {
    flags.push('--entrypoint', String(entry[0]));
    command = [...entry.slice(1).map(String), ...command];
  }

  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify({ flags, labels, image, command, extraNetworks }))
    .digest('hex')
    .slice(0, 16);
  labels.push(`${LABEL_HASH}=${hash}`);

  const args = ['run', '-d', '--name', containerName, ...flags];
  labels.forEach((l) => args.push('-l', l));
  args.push(image, ...command);

  return {
    name,
    containerName,
    image,
    hash,
    args,
    extraNetworks,
    build: buildSpec(project, name, svc, baseDir),
    depends: dependsOn(svc),
    warnings,
  };
}

function networksToCreate(ctx, serviceNames) {
  const { doc, project } = ctx;
  const keys = new Set();
  serviceNames.forEach((n) => serviceNetworks(doc.services[n] || {}).forEach((x) => keys.add(x.key)));
  return [...keys].map((key) => {
    const def = doc.networks?.[key] || {};
    const args = ['network', 'create'];
    if (def.driver) args.push('-d', def.driver);
    if (def.internal) args.push('--internal');
    const ipam = def.ipam?.config?.[0];
    if (ipam?.subnet) args.push('--subnet', ipam.subnet);
    if (ipam?.gateway) args.push('--gateway', ipam.gateway);
    if (ipam?.ip_range) args.push('--ip-range', ipam.ip_range);
    Object.entries(def.driver_opts || {}).forEach(([k, v]) => args.push('-o', `${k}=${v}`));
    args.push('-l', `${LABEL_PROJECT}=${project}`);
    const name = networkRealName(project, doc, key);
    args.push(name);
    return { key, name, external: !!def.external, args };
  });
}

function volumesToCreate(ctx, serviceNames) {
  const { doc, project } = ctx;
  const used = new Set();
  for (const n of serviceNames) {
    for (const v of asList(doc.services[n]?.volumes)) {
      if (typeof v === 'object') {
        if (v.type !== 'bind' && v.type !== 'tmpfs' && v.source) used.add(v.source);
        continue;
      }
      const parts = splitVolumeSpec(String(v));
      if (parts.length > 1 && !isBindSource(parts[0])) used.add(parts[0]);
    }
  }
  return [...used].map((key) => {
    const def = doc.volumes?.[key] || {};
    const args = ['volume', 'create'];
    if (def.driver && def.driver !== 'local') args.push('-d', def.driver);
    Object.entries(def.driver_opts || {}).forEach(([k, v]) => args.push('-o', `${k}=${v}`));
    args.push('-l', `${LABEL_PROJECT}=${project}`);
    const name = volumeRealName(project, doc, key);
    args.push(name);
    return { key, name, external: !!def.external, args };
  });
}

module.exports = {
  LABEL_PROJECT,
  LABEL_SERVICE,
  LABEL_HASH,
  parseDotEnv,
  interpolate,
  shellSplit,
  durationToSeconds,
  splitVolumeSpec,
  load,
  orderServices,
  withDependencies,
  serviceRunPlan,
  networksToCreate,
  volumesToCreate,
};
