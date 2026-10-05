// compose-core の単体テスト (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../electron/compose/core.cjs');

const FILE = path.join('C:\\work', 'myapp', 'compose.yaml');

function ctxOf(yaml, env = {}) {
  const ctx = core.load(yaml, { file: FILE, env });
  ctx.file = FILE;
  return ctx;
}

test('interpolate: 既定値・必須・$$ エスケープ', () => {
  const env = { A: 'x', EMPTY: '' };
  assert.equal(core.interpolate('${A} ${B:-def} ${EMPTY:-d2} ${EMPTY-d3} $$HOME $A', env), 'x def d2  $HOME x');
  assert.throws(() => core.interpolate('${NEED:?必須です}', env), /NEED/);
});

test('parseDotEnv', () => {
  assert.deepEqual(core.parseDotEnv('# c\nA=1\nexport B="two words"\nC=\'q\'\n bad line\n'), { A: '1', B: 'two words', C: 'q' });
});

test('shellSplit', () => {
  assert.deepEqual(core.shellSplit(`sh -c "echo 'hi there' && sleep 1" ''`), ['sh', '-c', "echo 'hi there' && sleep 1", '']);
});

test('durationToSeconds', () => {
  assert.equal(core.durationToSeconds('1m30s'), 90);
  assert.equal(core.durationToSeconds('10s'), 10);
  assert.equal(core.durationToSeconds(5), 5);
});

test('splitVolumeSpec は Windows ドライブレターを壊さない', () => {
  assert.deepEqual(core.splitVolumeSpec('C:\\data\\x:/data:ro'), ['C:\\data\\x', '/data', 'ro']);
  assert.deepEqual(core.splitVolumeSpec('db:/var/lib/db'), ['db', '/var/lib/db']);
});

test('プロジェクト名はフォルダー名から (name: があれば優先)', () => {
  assert.equal(ctxOf('services: {a: {image: x}}').project, 'myapp');
  assert.equal(ctxOf('name: Other_App\nservices: {a: {image: x}}').project, 'other_app');
});

test('depends_on の順序と循環検出', () => {
  const s = { web: { depends_on: ['api'] }, api: { depends_on: { db: { condition: 'service_healthy' } } }, db: {} };
  assert.deepEqual(core.orderServices(s), ['db', 'api', 'web']);
  assert.throws(() => core.orderServices({ a: { depends_on: ['b'] }, b: { depends_on: ['a'] } }), /循環/);
  assert.throws(() => core.orderServices({ a: { depends_on: ['zzz'] } }), /未定義/);
  assert.deepEqual(core.withDependencies(s, ['api']).sort(), ['api', 'db']);
});

test('serviceRunPlan: 主要オプションを wslc run 引数に変換', () => {
  const ctx = ctxOf(`
services:
  web:
    image: nginx:alpine
    container_name: myweb
    ports: ["8080:80", {target: 443, published: 8443, host_ip: 127.0.0.1}]
    environment:
      A: "1"
      B:
    volumes:
      - ./html:/usr/share/nginx/html:ro
      - data:/data
      - /cache
    command: nginx -g "daemon off;"
    working_dir: /app
    mem_limit: 512m
    shm_size: 1g
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost"]
      interval: 5s
      retries: 3
    networks: [front, back]
    x-wcs-gui:
      port: 5800
volumes:
  data:
networks:
  front:
  back:
    external: true
`);
  const p = core.serviceRunPlan(ctx, 'web');
  const a = p.args;
  assert.equal(p.containerName, 'myweb');
  assert.deepEqual(a.slice(0, 4), ['run', '-d', '--name', 'myweb']);
  const pairs = (flag) => a.flatMap((v, i) => (v === flag ? [a[i + 1]] : []));
  assert.deepEqual(pairs('-p'), ['8080:80', '127.0.0.1:8443:443']);
  assert.ok(pairs('-e').includes('A=1'));
  assert.deepEqual(pairs('-v'), [
    `${path.resolve('C:\\work\\myapp', './html')}:/usr/share/nginx/html:ro`,
    'myapp_data:/data',
    '/cache',
  ]);
  assert.deepEqual(pairs('-w'), ['/app']);
  assert.deepEqual(pairs('-m'), ['512m']);
  assert.deepEqual(pairs('--shm-size'), ['1g']);
  assert.deepEqual(pairs('--health-cmd'), ['curl -f http://localhost']);
  assert.deepEqual(pairs('--network'), ['myapp_front']);
  assert.ok(pairs('--network-alias').includes('web'));
  assert.deepEqual(p.extraNetworks.map((n) => n.name), ['back']);
  const labels = pairs('-l');
  assert.ok(labels.includes('com.docker.compose.project=myapp'));
  assert.ok(labels.includes('com.docker.compose.service=web'));
  assert.ok(labels.includes('wcs.gui.port=5800'));
  assert.ok(labels.some((l) => l.startsWith('wcs.compose.hash=')));
  // イメージとコマンドは末尾
  const imgIdx = a.indexOf('nginx:alpine');
  assert.deepEqual(a.slice(imgIdx), ['nginx:alpine', 'nginx', '-g', 'daemon off;']);
  assert.ok(p.warnings.some((w) => w.includes('restart')));
});

test('serviceRunPlan: entrypoint 配列と build', () => {
  const ctx = ctxOf(`
services:
  app:
    build:
      context: ./src
      dockerfile: Dockerfile.dev
      args: {VER: "2"}
    entrypoint: ["python", "-u"]
    command: ["main.py"]
`);
  const p = core.serviceRunPlan(ctx, 'app');
  assert.equal(p.image, 'myapp-app');
  const i = p.args.indexOf('--entrypoint');
  assert.equal(p.args[i + 1], 'python');
  assert.deepEqual(p.args.slice(p.args.indexOf('myapp-app')), ['myapp-app', '-u', 'main.py']);
  const src = path.resolve('C:\\work\\myapp', './src');
  assert.deepEqual(p.build.args, ['build', '-t', 'myapp-app', '-f', path.resolve(src, 'Dockerfile.dev'), '--build-arg', 'VER=2', src]);
});

test('設定が同じならハッシュも同じ、変われば変わる', () => {
  const a = core.serviceRunPlan(ctxOf('services: {s: {image: a, ports: ["1:1"]}}'), 's').hash;
  const b = core.serviceRunPlan(ctxOf('services: {s: {image: a, ports: ["1:1"]}}'), 's').hash;
  const c = core.serviceRunPlan(ctxOf('services: {s: {image: a, ports: ["2:1"]}}'), 's').hash;
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('networksToCreate / volumesToCreate', () => {
  const ctx = ctxOf(`
services:
  a: {image: x, volumes: ["v1:/a", "./b:/b"], networks: [n1]}
  b: {image: y}
volumes:
  v1: {driver: local}
networks:
  n1:
    ipam:
      config: [{subnet: 10.9.0.0/24}]
`);
  const nets = core.networksToCreate(ctx, ['a', 'b']);
  assert.deepEqual(nets.map((n) => n.name).sort(), ['myapp_default', 'myapp_n1']);
  const n1 = nets.find((n) => n.key === 'n1');
  assert.ok(n1.args.includes('--subnet') && n1.args.includes('10.9.0.0/24'));
  const vols = core.volumesToCreate(ctx, ['a', 'b']);
  assert.deepEqual(vols.map((v) => v.name), ['myapp_v1']);
  assert.ok(!vols[0].args.includes('-d'), 'driver: local は wslc に渡さない');
});

test('services が無いとエラー', () => {
  assert.throws(() => core.load('version: "3"', { file: FILE }), /services/);
});
