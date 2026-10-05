// 表示用のフォーマット関数
export function bytes(n) {
  if (n == null || Number.isNaN(n)) return '-';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

/** "8.42MB" などの文字列をバイト数に */
export function parseSize(s) {
  const m = String(s || '').match(/([\d.]+)\s*([kKMGT]?i?B)/);
  if (!m) return 0;
  const unit = m[2].toUpperCase().replace('I', '');
  const mul = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[unit] || 1;
  return parseFloat(m[1]) * mul;
}

export function compactNumber(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function timeAgo(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date || '');
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'たった今';
  if (s < 3600) return `${Math.floor(s / 60)} 分前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 時間前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 日前`;
  if (s < 86400 * 365) return `${Math.floor(s / 86400 / 30)} か月前`;
  return `${Math.floor(s / 86400 / 365)} 年前`;
}

/** "127.0.0.1:18080->80/tcp, :::8080->80/tcp" を分解 */
export function parsePorts(str) {
  if (!str) return [];
  const out = [];
  const seen = new Set();
  for (const part of String(str).split(/,\s*/)) {
    const m = part.match(/^(?:(.*):)?(\d+)->(\d+)\/(\w+)$/);
    if (m) {
      const key = `${m[2]}/${m[4]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ip: m[1] || '0.0.0.0', host: Number(m[2]), container: Number(m[3]), proto: m[4] });
    } else {
      const e = part.match(/^(\d+)\/(\w+)$/);
      if (e) out.push({ ip: '', host: null, container: Number(e[1]), proto: e[2] });
    }
  }
  return out;
}

/** list の Labels 文字列から特定ラベルを取り出す (値にカンマを含む JSON があるため正規表現で抽出) */
export function labelValue(labels, key) {
  if (!labels) return null;
  if (typeof labels === 'object') return labels[key] ?? null;
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = String(labels).match(new RegExp(`(?:^|,)${esc}=([^,]*)`));
  return m ? m[1] : null;
}

export function percent(s) {
  const v = parseFloat(String(s || '').replace('%', ''));
  return Number.isNaN(v) ? 0 : v;
}

export function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r(?!\n)/g, '\n');
}

export function shortId(id) {
  return String(id || '').replace(/^sha256:/, '').slice(0, 12);
}

function quoteArg(a) {
  return /[\s"'$&|<>]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
}

export function commandLine(args) {
  return `wslc ${args.map(quoteArg).join(' ')}`;
}
