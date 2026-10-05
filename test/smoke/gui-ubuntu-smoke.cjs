// Actual Ubuntu images, disposable containers/volumes; optionally build with --build.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const wslc = require('../../electron/services/wslc.cjs');
const { loadPresets, prepareBuild } = require('../../electron/gui/presets.cjs');
const root = path.resolve(__dirname, '..', '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-ubuntu-test-'));
const options = { builtinsDir: path.join(root, 'electron/gui/presets'), customDir: path.join(temporary, 'presets'), buildsDir: path.join(temporary, 'builds') };
const presets = loadPresets(options).presets;
const prefix = `wcs-ubuntu-smoke-${process.pid}`;
const containers = [];
const volumes = [];
const results = [];
async function run(args, opts) {
  const result = await wslc.run(args, opts);
  if (result.code !== 0) throw Error(`${args.slice(0, 3).join(' ')}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
async function build(step) {
  console.log(`Build: ${step.id}`);
  const log = path.join(temporary, `${step.id}-build.log`);
  const stream = fs.createWriteStream(log);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(wslc.findWslc(), ['build', '-t', step.image, '-f', path.join(step.directory, step.dockerfile), step.directory], { windowsHide: true });
    child.stdout.pipe(stream, { end: false }); child.stderr.pipe(stream, { end: false });
    child.on('error', reject); child.on('exit', resolve);
  });
  await new Promise(resolve => stream.end(resolve));
  if (code !== 0) throw Error(fs.readFileSync(log, 'utf8').slice(-5000));
}
async function main() {
  const built = new Set();
  const selected = process.argv.find(arg => arg.startsWith('--apps='))?.slice(7).split(',') || ['firefox', 'chrome', 'ubuntu-gnome'];
  for (const [index, id] of selected.entries()) {
    const p = presets.find(preset => preset.id === id);
    if (process.argv.includes('--build')) {
      for (const step of prepareBuild(id, options)) {
        if (!built.has(step.id)) { await build(step); built.add(step.id); }
      }
    }
    const name = `${prefix}-${id}`;
    const volume = `${name}-config`;
    await run(['volume', 'create', volume]); volumes.push(volume);
    const port = 15800 + index;
    await run(['run', '-d', '--name', name, '--shm-size', '2g', '-p', `127.0.0.1:${port}:5800`, '-v', `${volume}:/config`, p.image]);
    // xdotool / xclip are test-only tools; the images themselves stay app-only.
    await run(['exec', name, 'sh', '-c', 'apt-get update -qq && apt-get install -y -qq --no-install-recommends xdotool xclip >/dev/null'], { timeout: 180000 });
    containers.push(name);
    try {
      await run(['exec', name, ...p.readyCommand], { timeout: 90000 });
      await run(['exec', name, 'sh', '-c', 'pgrep -x fcitx5 && locale -a | grep -i ja_JP && test "$(stat -c %u /config)" = 1000']);
      assert.equal((await fetch(`http://127.0.0.1:${port}/vnc.html`)).status, 200);
      const field = id === 'ubuntu-gnome'
        ? 'xdotool key --clearmodifiers super; sleep 1; xdotool key Escape; gedit /tmp/ime-smoke.txt & sleep 3; xdotool search --sync --onlyvisible --class gedit windowactivate --sync;'
        : `sleep 4; xdotool search --sync --onlyvisible --class ${id === 'firefox' ? 'firefox' : 'google-chrome'} windowactivate --sync; xdotool key --clearmodifiers ctrl+t; sleep 1; xdotool key --clearmodifiers ctrl+l; sleep 1;`;
      const output = 'xdotool key --clearmodifiers ctrl+a ctrl+c; sleep 1; xclip -o -selection clipboard';
      const input = `set -eu\nexport DISPLAY=:0\nfcitx_pid=$(pgrep -x fcitx5 | head -n1)\nexport DBUS_SESSION_BUS_ADDRESS=$(tr '\\0' '\\n' < /proc/$fcitx_pid/environ | sed -n 's/^DBUS_SESSION_BUS_ADDRESS=//p')\n${field}\nxdotool key --clearmodifiers Zenkaku_Hankaku\nsleep 1\nxdotool type --clearmodifiers --delay 130 nihongo\nxdotool key space\nsleep 1\nxdotool key Return\nsleep 1\n${output}\n`;
      const converted = await run(['exec', '-i', '-u', '1000', name, 'bash', '-s'], { input, timeout: 60000 });
      assert.ok(converted.includes('日本語'), `Japanese conversion failed (${id}): ${converted}`);
      await run(['exec', name, 'sh', '-c', 'echo preserved > /config/.wcs-smoke-marker']);
      await run(['restart', name]);
      await run(['exec', name, ...p.readyCommand], { timeout: 90000 });
      assert.equal(await run(['exec', name, 'cat', '/config/.wcs-smoke-marker']), 'preserved');
      results.push({ id, japaneseInput: true, noVNC: true, restart: true });
      console.log(JSON.stringify(results.at(-1)));
    } catch (error) {
      const logs = await wslc.run(['logs', '--tail', '100', name]);
      throw Error(`${error.message}\n${logs.stdout}\n${logs.stderr}`);
    }
    await run(['remove', '-f', name]); containers.pop();
    await run(['volume', 'remove', volume]); volumes.pop();
  }
  console.log(JSON.stringify({ verified: results }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const name of containers) await wslc.run(['remove', '-f', name]);
  for (const name of volumes) await wslc.run(['volume', 'remove', name]);
  if (process.exitCode) console.error(`Build logs retained at ${temporary}`);
  else fs.rmSync(temporary, { recursive: true, force: true });
});
