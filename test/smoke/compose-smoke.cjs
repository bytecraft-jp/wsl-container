// 実機の wslc に対して compose エンジンを動かす結合テスト (up → ps → 再 up → down -v)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const compose = require('../../electron/compose/engine.cjs');
const wslc = require('../../electron/services/wslc.cjs');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-smoke-'));
  const projDir = path.join(dir, 'wcssmoke');
  fs.mkdirSync(path.join(projDir, 'html'), { recursive: true });
  fs.writeFileSync(path.join(projDir, 'html', 'index.html'), 'hello-from-compose\n');
  fs.writeFileSync(path.join(projDir, '.env'), 'WEB_PORT=18765\n');
  const file = path.join(projDir, 'compose.yaml');
  fs.writeFileSync(
    file,
    `services:
  web:
    image: nginx:alpine
    ports: ["127.0.0.1:\${WEB_PORT}:80"]
    volumes:
      - ./html:/usr/share/nginx/html:ro
    depends_on:
      worker:
        condition: service_started
    networks: [front, back]
  worker:
    image: alpine:latest
    command: sh -c "echo started > /data/flag; sleep infinity"
    volumes: [data:/data]
    networks: [back]
volumes:
  data:
networks:
  front:
  back:
`,
  );
  const log = (d) => process.stdout.write(d);
  let failed = false;
  try {
    await compose.up(file, {}, log);
    const ps = await compose.ps(file);
    console.log('\nPS:', JSON.stringify(ps, null, 1));
    if (ps.containers.filter((c) => c.running).length !== 2) throw new Error('2 コンテナーが起動していません');

    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch('http://127.0.0.1:18765/').then((r) => r.text());
    console.log('HTTP:', res.trim());
    if (!res.includes('hello-from-compose')) throw new Error('バインドマウントの内容が返りません');

    // web から worker へサービス名で到達できるか (back ネットワーク)
    const ping = await wslc.run(['exec', 'wcssmoke-web-1', 'sh', '-c', 'getent hosts worker || nslookup worker']);
    console.log('DNS:', ping.stdout.trim() || ping.stderr.trim());
    if (ping.code !== 0) throw new Error('サービス名で名前解決できません');

    console.log('\n--- 2 回目の up (変更なしなので再作成されないこと)');
    let second = '';
    await compose.up(file, {}, (d) => (second += d));
    console.log(second);
    if (!second.includes('最新です')) throw new Error('変更なしなのに再作成されました');
  } catch (e) {
    failed = true;
    console.error('\nFAILED:', e.message);
  } finally {
    await compose.down(file, { volumes: true }, log).catch((e) => console.error('down failed', e.message));
    const after = await compose.ps(file);
    console.log('after down containers:', after.containers.length);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
})();
