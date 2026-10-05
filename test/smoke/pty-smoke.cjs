// node-pty (ConPTY) 経由で wslc exec -it が対話できるか確認する
const wslc = require('../../electron/services/wslc.cjs');
const pty = require('../../electron/services/pty.cjs');

(async () => {
  const name = 'wcs-pty-smoke';
  await wslc.run(['remove', '-f', name]);
  const r = await wslc.run(['run', '-d', '--name', name, 'alpine:latest', 'sleep', '120']);
  if (r.code !== 0) throw new Error(r.stderr);
  console.log('hasPty:', pty.hasPty());
  let out = '';
  const p = pty.start({ kind: 'exec', container: name, cols: 100, rows: 30 }, {
    onData: (d) => (out += d),
    onExit: (c) => console.log('exit', c),
  });
  await new Promise((res) => setTimeout(res, 2500));
  p.write('echo PTY_$((40+2)); stty size\r');
  await new Promise((res) => setTimeout(res, 1500));
  p.resize(120, 40);
  await new Promise((res) => setTimeout(res, 500));
  p.write('stty size; exit\r');
  await new Promise((res) => setTimeout(res, 2000));
  p.kill();
  const clean = out.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
  console.log('--- output ---\n' + clean);
  console.log('PTY_42 found:', clean.includes('PTY_42'));
  console.log('resize ok:', clean.includes('40 120'));
  await wslc.run(['remove', '-f', name]);
  process.exit(0);
})();
