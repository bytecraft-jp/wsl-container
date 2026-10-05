const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validateTarget, compactVhd } = require('../electron/storage/vhd-compact.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-compact-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'storage.vhdx');
  fs.writeFileSync(file, Buffer.alloc(100));
  return { path: file, session: 'chosen-session' };
}

test('一覧外のファイル、相対パスは操作しない', (t) => {
  const vhd = fixture(t);
  assert.equal(validateTarget(vhd.path, [vhd]).session, vhd.session);
  assert.throws(() => validateTarget('storage.vhdx', [vhd]), /絶対パス/);
  assert.throws(() => validateTarget(path.join(path.dirname(vhd.path), 'other.vhdx'), [vhd]), /一覧/);
});

test('対象セッションの TRIM → 終了 → 最適化、削減量を報告', async (t) => {
  const vhd = fixture(t);
  const calls = [];
  const result = await compactVhd(vhd, { exe: 'wslc.exe', executeCommand: async (exe, args) => {
    calls.push({ exe, args });
    if (calls.length === 3) {
      fs.truncateSync(vhd.path, 40);
      return { code: 0, stdout: '{"ok":true}' };
    }
    return { code: 0, stdout: '' };
  } });
  assert.deepEqual(calls[0].args, ['--session', vhd.session, 'system', 'session', 'run', 'fstrim', '-av']);
  assert.equal(calls[1].args.at(-1), 'terminate');
  assert.equal(calls[2].args.at(-1), vhd.path);
  assert.deepEqual(result, { path: vhd.path, before: 100, after: 40, reclaimed: 60 });
});

test('セッション終了失敗時は VHDX に触らない', async (t) => {
  const vhd = fixture(t);
  let calls = 0;
  await assert.rejects(compactVhd(vhd, { exe: 'wslc.exe', executeCommand: async () => {
    calls++;
    return calls === 1 ? { code: 0 } : { code: 1, stderr: 'cannot stop' };
  } }), /セッションを終了できません/);
  assert.equal(calls, 2);
  assert.equal(fs.statSync(vhd.path).size, 100);
});

test('TRIM 非対応でも続行し、旧保存先ではセッションを停止しない', async (t) => {
  const vhd = fixture(t);
  for (const prepare of [true, false]) {
    const calls = [];
    const logs = [];
    const result = await compactVhd(vhd, { exe: 'wslc.exe', prepare, log: (d) => logs.push(d), executeCommand: async (exe, args) => {
      calls.push(args);
      if (args.includes('fstrim')) return { code: 1 };
      return { code: 0, stdout: '{"ok":true}' };
    } });
    assert.equal(calls.length, prepare ? 3 : 1);
    assert.equal(result.reclaimed, 0);
    if (prepare) assert.ok(logs.some((s) => s.includes('縮小量')));
  }
});

test('アクセス拒否や使用中を成功扱いにしない', async (t) => {
  const vhd = fixture(t);
  for (const code of [5, 32]) {
    await assert.rejects(compactVhd(vhd, { prepare: false, executeCommand: async () => ({
      code: 1, stdout: JSON.stringify({ ok: false, code, error: 'native failure' }),
    }) }), code === 5 ? /管理者/ : /終了して/);
  }
  await assert.rejects(compactVhd(vhd, { prepare: false, executeCommand: async () => ({ code: 0, stdout: 'garbage' }) }), /失敗/);
});

test('権限が必要な場合は昇格ヘルパーの結果を検証する', async (t) => {
  const vhd = fixture(t);
  let count = 0;
  const result = await compactVhd(vhd, { prepare: false, executeCommand: async (exe, args) => {
    count++;
    if (count === 1) return { code: 1, stdout: '{"ok":false,"code":5}' };
    assert.ok(args.some((s) => s.endsWith('compact-vhd-elevate.ps1')));
    fs.writeFileSync(args.at(-1), '{"ok":true}');
    return { code: 0, stdout: '' };
  } });
  assert.equal(count, 2);
  assert.equal(result.after, 100);
});

test('Windows ヘルパーがコンパイルでき、不正な VHDX を拒否する', { skip: process.platform !== 'win32' }, (t) => {
  const vhd = fixture(t);
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  let output;
  try {
    output = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('electron/storage/compact-vhd.ps1'), '-VhdPath', vhd.path], { windowsHide: true, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) { output = e.stdout; }
  const result = JSON.parse(output.trim());
  assert.equal(result.ok, false);
  assert.equal(typeof result.code, 'number');
  assert.equal(fs.statSync(vhd.path).size, 100);
});

test('Windows の実 API で一時 VHDX を作成して最適化する', { skip: process.platform !== 'win32' }, async (t) => {
  const vhd = fixture(t);
  fs.unlinkSync(vhd.path);
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CreateTestVhd {
 [StructLayout(LayoutKind.Sequential)] public struct Storage { public uint DeviceId; public Guid VendorId; }
 [StructLayout(LayoutKind.Explicit, Size=56)] public struct Params {
  [FieldOffset(0)] public uint Version;
  [FieldOffset(8)] public Guid Id;
  [FieldOffset(24)] public ulong MaximumSize;
  [FieldOffset(32)] public uint BlockSize;
  [FieldOffset(36)] public uint SectorSize;
 }
 [DllImport("virtdisk.dll", CharSet=CharSet.Unicode)] static extern uint CreateVirtualDisk(ref Storage s, string path, uint access, IntPtr security, uint flags, uint provider, ref Params p, IntPtr overlap, out IntPtr handle);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 public static void Create(string path) {
  var s = new Storage { DeviceId = 3, VendorId = new Guid("ec984aec-a0f9-47e9-901f-71415a66345b") };
  var p = new Params { Version = 1, Id = Guid.NewGuid(), MaximumSize = 64UL*1024*1024 };
  IntPtr h;
  uint result = CreateVirtualDisk(ref s, path, 0x00200000, IntPtr.Zero, 0, 0, ref p, IntPtr.Zero, out h);
  if (result != 0) throw new System.ComponentModel.Win32Exception((int)result);
  CloseHandle(h);
 }
}
'@
try { [CreateTestVhd]::Create([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(vhd.path).toString('base64')}'))) }
catch { if ($_.Exception.InnerException.NativeErrorCode -eq 5) { 'ACCESS_DENIED' } else { throw } }
`;
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const created = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8' });
  if (created.includes('ACCESS_DENIED')) { t.skip('一時 VHDX の作成には管理者権限が必要'); return; }
  const result = await compactVhd(vhd, { prepare: false });
  assert.ok(result.after > 0);
  assert.ok(result.after <= result.before);
});
