<template>
  <div class="svc-form" @input="changed" @change="changed" @click="onClick">
    <section>
      <h4><Box />基本</h4>
      <div class="grid-2">
        <label class="field">
          サービス名
          <input :value="name" class="input mono" @change.stop="rename($event.target.value)" @input.stop />
        </label>
        <label class="field">
          コンテナー名 (任意)
          <input v-model="m.container_name" class="input mono" placeholder="(自動)" />
        </label>
      </div>
      <div class="grid-2">
        <label class="field">
          イメージ
          <input v-model="m.image" class="input mono" list="cs-images" placeholder="nginx:alpine" />
          <datalist id="cs-images"><option v-for="i in images" :key="i" :value="i" /></datalist>
        </label>
        <label class="field">
          ビルド (Dockerfile のフォルダー・任意)
          <div class="row">
            <input v-model="m.build" class="input mono" style="flex: 1" placeholder="./app" />
            <button class="btn icon" title="フォルダーを選択" @click="pickBuild"><FolderOpen /></button>
          </div>
        </label>
      </div>
      <label class="field">
        コマンド (任意)
        <input v-model="m.command" class="input mono" placeholder='例: npm start / sh -c "…"' />
      </label>
    </section>

    <section>
      <h4><Cable />ポート</h4>
      <RowsEditor
        v-model="m.ports"
        add-label="ポートを追加"
        :columns="[
          { key: 'host', placeholder: 'ホスト側 8080' },
          { key: 'container', placeholder: 'コンテナー側 80' },
          { key: 'proto', type: 'select', options: ['tcp', 'udp'], default: 'tcp' },
        ]"
      />
    </section>

    <section>
      <h4><ListTree />環境変数</h4>
      <RowsEditor v-model="m.env" add-label="環境変数を追加" :columns="[{ key: 'key', placeholder: 'KEY' }, { key: 'value', placeholder: 'value', flex: 2 }]" />
    </section>

    <section>
      <h4><HardDrive />ボリューム / マウント</h4>
      <p class="muted small">相対パス (./data) は compose ファイルのフォルダーが基準です。名前付きボリュームは自動で作成されます。</p>
      <RowsEditor
        v-model="m.volumes"
        add-label="マウントを追加"
        browse
        @browse="pickVolume"
        :columns="[
          { key: 'source', placeholder: './data または ボリューム名', flex: 1.4 },
          { key: 'target', placeholder: '/コンテナー内のパス' },
          { key: 'ro', type: 'check', label: 'ro' },
        ]"
      />
    </section>

    <section v-if="otherServices.length || networkKeys.length">
      <h4><GitFork />依存関係とネットワーク</h4>
      <div v-if="otherServices.length" class="field">
        <span class="small muted">先に起動するサービス (depends_on)</span>
        <div class="row wrap">
          <label v-for="s in otherServices" :key="s" class="check">
            <input type="checkbox" :checked="m.depends.includes(s)" @change="toggleDep(s)" />{{ s }}
          </label>
        </div>
      </div>
      <div v-if="networkKeys.length" class="field">
        <span class="small muted">参加するネットワーク (未選択なら default)</span>
        <div class="row wrap">
          <label v-for="n in networkKeys" :key="n" class="check">
            <input type="checkbox" :checked="m.networks.includes(n)" @change="toggleNet(n)" />{{ n }}
          </label>
        </div>
      </div>
    </section>

    <section>
      <h4><SlidersHorizontal />詳細</h4>
      <div class="grid-3">
        <label class="field">作業ディレクトリ<input v-model="m.working_dir" class="input mono" /></label>
        <label class="field">ユーザー<input v-model="m.user" class="input mono" /></label>
        <label class="field">ホスト名<input v-model="m.hostname" class="input mono" /></label>
        <label class="field">メモリ上限<input v-model="m.mem_limit" class="input mono" placeholder="1g" /></label>
        <label class="field">CPU<input v-model="m.cpus" class="input mono" placeholder="1.5" /></label>
        <label class="field">/dev/shm<input v-model="m.shm_size" class="input mono" placeholder="1g" /></label>
      </div>
      <label class="field">ヘルスチェック (シェルコマンド)<input v-model="m.health" class="input mono" placeholder="curl -f http://localhost/ || exit 1" /></label>
      <div class="row wrap">
        <label class="check"><input v-model="m.tty" type="checkbox" />TTY (tty: true)</label>
        <label class="check"><input v-model="m.stdin_open" type="checkbox" />標準入力 (stdin_open: true)</label>
        <label class="check"><input v-model="m.gpus" type="checkbox" />GPU を使う</label>
      </div>
    </section>

    <section>
      <h4><MonitorPlay />GUI ビューアー</h4>
      <p class="muted small">noVNC などの Web 画面を公開しているなら、そのホスト側ポートを指定するとワンクリックで GUI を開けます。</p>
      <div class="grid-3">
        <label class="field">ホスト側ポート<input v-model="m.guiPort" class="input mono" placeholder="5800" /></label>
      </div>
    </section>
  </div>
</template>

<script setup>
import { reactive, watch, computed, nextTick } from 'vue';
import { Box, Cable, ListTree, HardDrive, GitFork, SlidersHorizontal, MonitorPlay, FolderOpen } from '@lucide/vue';
import RowsEditor from './RowsEditor.vue';
import { invoke } from '../lib/api.js';

const props = defineProps({
  doc: { type: Object, required: true },
  name: { type: String, required: true },
  images: { type: Array, default: () => [] },
  baseDir: { type: String, default: '' },
});
const emit = defineEmits(['changed', 'rename']);

const m = reactive({});
const svc = computed(() => props.doc.services?.[props.name] || {});
const otherServices = computed(() => Object.keys(props.doc.services || {}).filter((s) => s !== props.name));
const networkKeys = computed(() => Object.keys(props.doc.networks || {}));

function splitVol(spec) {
  const mm = String(spec).match(/^([A-Za-z]:[\\/][^:]*)(?::(.*))?$/);
  const parts = mm ? [mm[1], ...(mm[2] ? mm[2].split(':') : [])] : String(spec).split(':');
  if (parts.length === 1) return { source: '', target: parts[0], ro: false };
  return { source: parts[0], target: parts[1], ro: parts[2] === 'ro' };
}

function parsePort(p) {
  if (typeof p === 'object') return { host: String(p.published ?? ''), container: String(p.target ?? ''), proto: p.protocol || 'tcp', ip: p.host_ip || '' };
  const [main, proto = 'tcp'] = String(p).split('/');
  const parts = main.split(':');
  const container = parts.pop();
  const host = parts.pop() || '';
  return { host, container, proto, ip: parts.join(':') };
}

function load() {
  const s = svc.value;
  const env = Array.isArray(s.environment)
    ? s.environment.map((e) => {
        const i = String(e).indexOf('=');
        return i < 0 ? { key: e, value: '' } : { key: e.slice(0, i), value: e.slice(i + 1) };
      })
    : Object.entries(s.environment || {}).map(([key, value]) => ({ key, value: value == null ? '' : String(value) }));
  const hc = s.healthcheck?.test;
  Object.assign(m, {
    container_name: s.container_name || '',
    image: s.image || '',
    build: typeof s.build === 'string' ? s.build : s.build?.context || '',
    command: Array.isArray(s.command) ? s.command.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ') : s.command || '',
    ports: (s.ports || []).map(parsePort),
    env,
    volumes: (s.volumes || []).map((v) => (typeof v === 'object' ? { source: v.source || '', target: v.target, ro: !!v.read_only } : splitVol(v))),
    depends: Array.isArray(s.depends_on) ? [...s.depends_on] : Object.keys(s.depends_on || {}),
    networks: Array.isArray(s.networks) ? [...s.networks] : Object.keys(s.networks || {}),
    working_dir: s.working_dir || '',
    user: s.user != null ? String(s.user) : '',
    hostname: s.hostname || '',
    mem_limit: s.mem_limit || '',
    cpus: s.cpus != null ? String(s.cpus) : '',
    shm_size: s.shm_size || '',
    health: Array.isArray(hc) ? (hc[0] === 'CMD-SHELL' ? hc.slice(1).join(' ') : hc.slice(hc[0] === 'CMD' ? 1 : 0).join(' ')) : hc || '',
    tty: !!s.tty,
    stdin_open: !!s.stdin_open,
    gpus: !!s.gpus,
    guiPort: s['x-wcs-gui']?.port ? String(s['x-wcs-gui'].port) : '',
  });
}

const setOrDelete = (o, k, v) => {
  if (v === '' || v == null || v === false || (Array.isArray(v) && !v.length)) delete o[k];
  else o[k] = v;
};

/** フォームの内容を compose のサービス定義に書き戻す */
function writeBack() {
  const s = props.doc.services[props.name];
  if (!s) return;
  setOrDelete(s, 'container_name', m.container_name.trim());
  setOrDelete(s, 'image', m.image.trim());
  if (m.build.trim()) {
    if (typeof s.build === 'object' && s.build) s.build.context = m.build.trim();
    else s.build = m.build.trim();
  } else delete s.build;
  setOrDelete(s, 'command', m.command.trim());
  setOrDelete(
    s,
    'ports',
    m.ports
      .filter((p) => p.container)
      .map((p) => `${p.ip ? `${p.ip}:` : ''}${p.host ? `${p.host}:` : ''}${p.container}${p.proto && p.proto !== 'tcp' ? `/${p.proto}` : ''}`),
  );
  const env = {};
  m.env.filter((e) => e.key).forEach((e) => (env[e.key] = e.value));
  setOrDelete(s, 'environment', Object.keys(env).length ? env : null);
  setOrDelete(
    s,
    'volumes',
    m.volumes.filter((v) => v.target).map((v) => (v.source ? `${v.source}:${v.target}${v.ro ? ':ro' : ''}` : v.target)),
  );
  // 名前付きボリュームをトップレベルに登録
  for (const v of m.volumes) {
    if (v.source && !/^(\.|\/|~|[A-Za-z]:[\\/])/.test(v.source)) {
      props.doc.volumes = props.doc.volumes || {};
      if (!(v.source in props.doc.volumes)) props.doc.volumes[v.source] = null;
    }
  }
  if (m.depends.length) {
    if (s.depends_on && !Array.isArray(s.depends_on)) {
      const map = {};
      m.depends.forEach((d) => (map[d] = s.depends_on[d] || { condition: 'service_started' }));
      s.depends_on = map;
    } else s.depends_on = [...m.depends];
  } else delete s.depends_on;
  if (m.networks.length) {
    if (s.networks && !Array.isArray(s.networks)) {
      const map = {};
      m.networks.forEach((n) => (map[n] = s.networks[n] ?? null));
      s.networks = map;
    } else s.networks = [...m.networks];
  } else delete s.networks;
  setOrDelete(s, 'working_dir', m.working_dir.trim());
  setOrDelete(s, 'user', m.user.trim());
  setOrDelete(s, 'hostname', m.hostname.trim());
  setOrDelete(s, 'mem_limit', m.mem_limit.trim());
  setOrDelete(s, 'cpus', m.cpus.trim());
  setOrDelete(s, 'shm_size', m.shm_size.trim());
  if (m.health.trim()) {
    s.healthcheck = { ...(s.healthcheck || {}), test: ['CMD-SHELL', m.health.trim()] };
  } else if (s.healthcheck) {
    delete s.healthcheck.test;
    if (!Object.keys(s.healthcheck).length) delete s.healthcheck;
  }
  setOrDelete(s, 'tty', m.tty);
  setOrDelete(s, 'stdin_open', m.stdin_open);
  setOrDelete(s, 'gpus', m.gpus ? 'all' : null);
  if (m.guiPort.trim()) s['x-wcs-gui'] = { ...(s['x-wcs-gui'] || {}), port: Number(m.guiPort) || m.guiPort.trim() };
  else delete s['x-wcs-gui'];
}

let pending = false;
function changed() {
  if (pending) return;
  pending = true;
  nextTick(() => {
    pending = false;
    writeBack();
    emit('changed');
  });
}
function onClick(e) {
  if (e.target.closest('button')) changed();
}

function toggleDep(s) {
  const i = m.depends.indexOf(s);
  i >= 0 ? m.depends.splice(i, 1) : m.depends.push(s);
}
function toggleNet(n) {
  const i = m.networks.indexOf(n);
  i >= 0 ? m.networks.splice(i, 1) : m.networks.push(n);
}
function rename(v) {
  const n = v.trim().replace(/[^a-zA-Z0-9_.-]/g, '');
  if (n && n !== props.name) emit('rename', n);
}

async function pickBuild() {
  const r = await invoke('fs:open', { properties: ['openDirectory'], defaultPath: props.baseDir || undefined });
  if (r?.[0]) {
    m.build = r[0];
    changed();
  }
}
async function pickVolume(row) {
  const r = await invoke('fs:open', { properties: ['openDirectory'], defaultPath: props.baseDir || undefined });
  if (r?.[0]) {
    row.source = r[0];
    changed();
  }
}

watch(() => [props.name, svc.value], load, { immediate: true });
</script>

<style scoped>
.svc-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
}
h4 {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
}
h4 svg {
  width: 15px;
  color: var(--accent-2);
}
p {
  margin: 0;
}
.wrap {
  flex-wrap: wrap;
  gap: 14px;
}
</style>
