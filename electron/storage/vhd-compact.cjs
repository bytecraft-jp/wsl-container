const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

// PowerShell は asar 内のファイルを読めないため、配布版では asarUnpack で展開した側を使う
const scriptDir = __dirname.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked');

function execute(exe, args) {
  return new Promise((resolve) => execFile(exe, args, { windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 },
    (error, stdout, stderr) => resolve({ code: error ? (error.code || -1) : 0, stdout, stderr })));
}

function validateTarget(target, vhds) {
  if (typeof target !== 'string' || !path.isAbsolute(target)) throw new Error('VHDX の絶対パスが必要です');
  const selected = vhds.find((v) => path.resolve(v.path).toLowerCase() === path.resolve(target).toLowerCase());
  if (!selected) throw new Error('一覧にある wslc の VHDX を選択してください');
  const real = fs.realpathSync(selected.path);
  if (real.toLowerCase() !== path.resolve(selected.path).toLowerCase() || !fs.statSync(real).isFile()) {
    throw new Error('リンク先の VHDX は最適化できません');
  }
  return { ...selected, path: real };
}

async function compactVhd(vhd, { exe, executeCommand = execute, log = () => {}, prepare = true } = {}) {
  const before = fs.statSync(vhd.path).size;
  if (prepare) {
    if (!exe) throw new Error('wslc.exe が見つかりません');
    // グローバルなアプリ設定ではなく、対象ディスクのセッションを明示する。
    const args = ['--session', vhd.session, 'system', 'session'];
    log('空き領域を回収しています…\n');
    const trim = await executeCommand(exe, [...args, 'run', 'fstrim', '-av']);
    if (trim.code !== 0) log('空き領域の回収を実行できませんでした。縮小量が少なくなる場合があります。\n');
    else log(trim.stdout || '空き領域を回収しました。\n');
    log(`セッション ${vhd.session} を終了しています…\n`);
    const stop = await executeCommand(exe, [...args, 'terminate']);
    if (stop.code !== 0) throw new Error(`セッションを終了できません: ${stop.stderr || stop.stdout}`);
  }
  log('VHDX を縮小・最適化しています。サイズによって数分かかります…\n');
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  let result = await executeCommand(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptDir, 'compact-vhd.ps1'), '-VhdPath', vhd.path]);
  let response;
  try { response = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim()); } catch { /* プロセス起動失敗等 */ }
  if (response?.code === 5) {
    log('管理者権限が必要です。Windows の確認画面で許可してください。\n');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-vhd-result-'));
    try {
      const output = path.join(dir, 'result.json');
      result = await executeCommand(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptDir, 'compact-vhd-elevate.ps1'), '-VhdPath', vhd.path, '-ResultPath', output]);
      response = null;
      try { response = JSON.parse(fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : result.stdout.trim()); } catch { /* 起動失敗等 */ }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  if (result.code !== 0 || response?.ok !== true) {
    if (response?.code === 1223) throw new Error('管理者権限の確認がキャンセルされたため、最適化できませんでした');
    const hint = response?.code === 5 ? 'アプリを管理者として起動して再実行してください。' : '対象セッションや外部の wslc を終了してから再実行してください。';
    throw new Error(`VHDX の最適化に失敗しました。${hint}\n${response?.error || result.stderr || result.stdout}`);
  }
  const after = fs.statSync(vhd.path).size;
  return { path: vhd.path, before, after, reclaimed: Math.max(0, before - after) };
}

module.exports = { validateTarget, compactVhd };
