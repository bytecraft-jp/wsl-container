<template>
  <div class="page">
    <div class="compose">
      <!-- プロジェクト一覧 -->
      <aside class="projects" @contextmenu="onProjectsMenu">
        <div class="p-head">
          <b>プロジェクト</b>
          <div class="spacer"></div>
          <button class="btn ghost icon sm" title="開く" @click="openExisting"><FolderOpen /></button>
          <button class="btn ghost icon sm" title="新規作成" @click="showNew = true"><Plus /></button>
        </div>
        <div
          v-for="p in projects"
          :key="p.file"
          class="p-item"
          :class="{ active: current?.file === p.file }"
          @click="openProject(p)"
          @contextmenu="onProjectMenu($event, p)"
        >
          <FileCode2 />
          <div class="p-main">
            <div class="ellipsis"><b>{{ p.name }}</b></div>
            <div class="muted small ellipsis" :title="p.file">{{ p.file }}</div>
          </div>
        </div>
        <div v-if="!projects.length" class="empty small">
          <FileCode2 />
          <div>プロジェクトがありません</div>
          <button class="btn primary sm" style="margin-top: 10px" @click="showNew = true"><Plus />新規作成</button>
        </div>
      </aside>

      <!-- エディター -->
      <section v-if="current" class="editor">
        <div class="e-head">
          <div class="e-title">
            <h2>{{ current.name }}<span v-if="dirty" class="dirty" title="未保存">●</span></h2>
            <div class="muted small ellipsis">{{ current.file }}</div>
          </div>
          <div class="spacer"></div>
          <div class="segmented">
            <button :class="{ active: mode === 'gui' }" @click="mode = 'gui'"><LayoutGrid />GUI</button>
            <button :class="{ active: mode === 'split' }" @click="mode = 'split'"><Columns2 />分割</button>
            <button :class="{ active: mode === 'text' }" @click="mode = 'text'"><Code />テキスト</button>
            <button :class="{ active: mode === 'plan' }" @click="showPlan"><ListChecks />実行プラン</button>
          </div>
        </div>
        <div class="toolbar e-actions">
          <button class="btn" :disabled="!dirty" @click="save"><Save />保存<span class="kbd">Ctrl+S</span></button>
          <button class="btn" @click="dockerfileEditor = true"><FileCode2 />Dockerfile を作成・編集</button>
          <div class="sep"></div>
          <button class="btn primary" :disabled="!!parseError" @click="up()"><Play />起動 (up)</button>
          <button class="btn" @click="simple('stop')"><Square />停止</button>
          <button class="btn" @click="simple('restart')"><RotateCw />再起動</button>
          <button class="btn danger" @click="down"><Trash2 />停止して削除 (down)</button>
          <button class="btn ghost icon" title="その他" @click="moreMenu"><EllipsisVertical /></button>
          <div class="spacer"></div>
          <span v-if="parseError" class="badge red" :title="parseError">YAML エラー</span>
          <span v-else class="badge green">YAML OK</span>
        </div>

        <div class="e-body" :class="mode">
          <div v-if="mode === 'gui' || mode === 'split'" class="gui">
            <div v-if="parseError" class="notice error"><CircleX /><div class="selectable">YAML を解析できません: {{ parseError }}</div></div>
            <template v-else>
              <div class="svc-list" @contextmenu="onSvcAreaMenu">
                <div class="row svc-list-head">
                  <b class="small">サービス</b>
                  <div class="spacer"></div>
                  <button class="btn ghost sm" @click="addService()"><Plus />追加</button>
                </div>
                <div
                  v-for="(s, name) in doc.services || {}"
                  :key="name"
                  class="svc"
                  :class="{ active: selectedSvc === name }"
                  @click="selectedSvc = name"
                  @dblclick="up([name])"
                  @contextmenu="onSvcMenu($event, name)"
                >
                  <span class="dot" :class="svcState(name)"></span>
                  <div class="svc-main">
                    <div class="ellipsis"><b>{{ name }}</b></div>
                    <div class="muted small ellipsis">{{ s?.image || (s?.build ? 'build: ' + (s.build.context || s.build) : '(イメージ未設定)') }}</div>
                  </div>
                  <MonitorPlay v-if="s?.['x-wcs-gui']" class="gui-ic" />
                </div>
                <div class="row svc-list-head" style="margin-top: 14px">
                  <b class="small">ボリューム</b>
                  <div class="spacer"></div>
                  <button class="btn ghost sm" @click="addTop('volumes')"><Plus /></button>
                </div>
                <div v-for="(v, k) in doc.volumes || {}" :key="k" class="top-item" @contextmenu="onTopMenu($event, 'volumes', k)">
                  <HardDrive /><span class="ellipsis">{{ k }}</span>
                </div>
                <div class="row svc-list-head" style="margin-top: 14px">
                  <b class="small">ネットワーク</b>
                  <div class="spacer"></div>
                  <button class="btn ghost sm" @click="addTop('networks')"><Plus /></button>
                </div>
                <div v-for="(v, k) in doc.networks || {}" :key="k" class="top-item" @contextmenu="onTopMenu($event, 'networks', k)">
                  <Network /><span class="ellipsis">{{ k }}</span>
                </div>
              </div>
              <div class="svc-edit">
                <ComposeServiceForm
                  v-if="selectedSvc && doc.services?.[selectedSvc] !== undefined"
                  :key="selectedSvc + formKey"
                  :doc="doc"
                  :name="selectedSvc"
                  :images="images"
                  :base-dir="baseDir"
                  @changed="onGuiChanged"
                  @rename="renameService(selectedSvc, $event)"
                />
                <div v-else class="empty">左のサービスを選択するか、追加してください</div>
              </div>
            </template>
          </div>
          <div v-if="mode === 'text' || mode === 'split'" class="text">
            <CodeEditor :model-value="text" @update:model-value="onTextChanged" @save="save" />
          </div>
          <div v-if="mode === 'plan'" class="plan">
            <div v-if="planError" class="notice error"><CircleX /><div class="selectable">{{ planError }}</div></div>
            <template v-else-if="plan">
              <div class="notice">
                <Info />
                <div>
                  wslc には compose コマンドがないため、このアプリが compose ファイルを解釈して下記の wslc コマンドを順に実行します。
                  起動順: <b>{{ plan.order.join(' → ') }}</b>
                </div>
              </div>
              <div v-for="w in plan.warnings" :key="w" class="notice warn"><TriangleAlert /><div>{{ w }}</div></div>
              <div v-for="c in plan.commands" :key="c.service" class="card">
                <h3>{{ c.service }}</h3>
                <pre v-if="c.build" class="code">{{ commandLine(c.build) }}</pre>
                <pre class="code">{{ commandLine(c.run) }}</pre>
              </div>
            </template>
          </div>
        </div>
      </section>

      <section v-else class="editor empty-editor">
        <div class="empty">
          <FileCode2 />
          <h3 style="margin: 8px 0">Compose プロジェクト</h3>
          <div>複数のコンテナーを compose.yaml でまとめて管理します。GUI でもテキストでも編集できます。</div>
          <div class="row" style="justify-content: center; margin-top: 16px">
            <button class="btn" @click="openExisting"><FolderOpen />既存のファイルを開く</button>
            <button class="btn primary" @click="showNew = true"><Plus />新規作成</button>
          </div>
        </div>
      </section>
    </div>

    <!-- 新規作成 -->
    <Modal v-if="showNew" title="新しい Compose プロジェクト" width="600px" @close="showNew = false">
      <template #icon><Plus /></template>
      <div class="col" style="gap: 14px">
        <label class="field">プロジェクト名<input v-model="newName" class="input mono" placeholder="myapp" /></label>
        <label class="field">
          保存先フォルダー (この中に「プロジェクト名」フォルダーを作ります)
          <div class="row">
            <input v-model="newDir" class="input mono" style="flex: 1" />
            <button class="btn" @click="pickNewDir"><FolderOpen />選択</button>
          </div>
        </label>
        <div class="field">
          <span class="small muted">テンプレート</span>
          <div class="templates">
            <button v-for="t in COMPOSE_TEMPLATES" :key="t.id" class="tpl" :class="{ active: newTpl === t.id }" @click="newTpl = t.id">
              {{ t.title }}
            </button>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn" @click="showNew = false">キャンセル</button>
        <button class="btn primary" :disabled="!newName.trim() || !newDir" @click="createProject">作成</button>
      </template>
    </Modal>

    <DockerfileEditor v-if="dockerfileEditor && current" :compose-file="current.file" :build="doc.services?.[selectedSvc]?.build" @close="dockerfileEditor = false" />
    <Modal v-if="logsFor" :title="`ログ: ${logsFor}`" width="900px" @close="logsFor = ''">
      <div style="height: 60vh"><LogViewer :container="logsFor" /></div>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import YAML from 'yaml';
import {
  FolderOpen, Plus, FileCode2, Save, Play, Square, RotateCw, Trash2, EllipsisVertical, LayoutGrid, Columns2, Code,
  ListChecks, CircleX, Info, TriangleAlert, HardDrive, Network, MonitorPlay, Download, Hammer, Copy, FileText,
  Terminal, Pencil, FolderSearch, X, RefreshCw, ArrowUp, ArrowDown,
} from '@lucide/vue';
import CodeEditor from '../components/CodeEditor.vue';
import DockerfileEditor from '../components/DockerfileEditor.vue';
import ComposeServiceForm from '../components/ComposeServiceForm.vue';
import Modal from '../components/Modal.vue';
import LogViewer from '../components/LogViewer.vue';
import { invoke, wslcJson } from '../lib/api.js';
import { state, saveSettings, remoteJob, confirm, prompt, toast, openTerminal, openViewer } from '../lib/store.js';
import { commandLine } from '../lib/format.js';
import { showMenu } from '../lib/contextMenu.js';
import { COMPOSE_TEMPLATES } from '../lib/composeTemplates.js';

const projects = computed(() => state.settings.composeProjects || []);
const current = ref(null);
const text = ref('');
const doc = ref({});
const parseError = ref('');
const dirty = ref(false);
const mode = ref('split');
const selectedSvc = ref('');
const formKey = ref(0);
const images = ref([]);
const ps = ref(null);
const plan = ref(null);
const planError = ref('');
const logsFor = ref('');
const dockerfileEditor = ref(false);

const showNew = ref(false);
const newName = ref('');
const newDir = ref('');
const newTpl = ref('blank');

const baseDir = computed(() => current.value?.file.replace(/[\\/][^\\/]+$/, '') || '');

function stringify(d) {
  const document = new YAML.Document(d);
  // "8080:80" のようなポート指定は慣例どおりダブルクォートで出力する
  YAML.visit(document, {
    Pair(_, pair) {
      if (YAML.isScalar(pair.key) && pair.key.value === 'ports' && YAML.isSeq(pair.value)) {
        pair.value.items.forEach((it) => {
          if (YAML.isScalar(it) && typeof it.value === 'string') it.type = 'QUOTE_DOUBLE';
        });
      }
    },
  });
  return document.toString({ lineWidth: 0, nullStr: '' });
}

// ---- テキスト ⇔ GUI 同期 ----
function onTextChanged(v) {
  text.value = v;
  dirty.value = true;
  try {
    const parsed = YAML.parse(v) || {};
    if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('トップレベルはマッピングである必要があります');
    doc.value = parsed;
    parseError.value = '';
    if (!doc.value.services?.[selectedSvc.value]) selectedSvc.value = Object.keys(doc.value.services || {})[0] || '';
  } catch (e) {
    parseError.value = e.message.split('\n')[0];
  }
}

function onGuiChanged() {
  text.value = stringify(doc.value);
  dirty.value = true;
}

function setText(v) {
  text.value = v;
  onTextChanged(v);
  formKey.value++;
}

// ---- プロジェクト ----
async function openProject(p) {
  if (dirty.value && current.value && current.value.file !== p.file) {
    const ok = await confirm({ title: '未保存の変更', message: `${current.value.name} の変更が保存されていません。破棄しますか？`, okText: '破棄', danger: true });
    if (!ok) return;
  }
  try {
    const content = await invoke('fs:read', p.file);
    current.value = p;
    setText(content);
    dirty.value = false;
    selectedSvc.value = Object.keys(doc.value.services || {})[0] || '';
    refreshPs();
    consumeInbox();
  } catch (e) {
    toast(`開けませんでした: ${e.message}`, 'error');
  }
}

async function addProject(file) {
  const dir = file.replace(/[\\/][^\\/]+$/, '');
  const name = dir.split(/[\\/]/).pop();
  const list = projects.value.filter((p) => p.file !== file);
  const p = { name, file };
  await saveSettings({ composeProjects: [p, ...list] });
  return p;
}

async function openExisting() {
  const f = await invoke('fs:open', { filters: [{ name: 'Compose', extensions: ['yaml', 'yml'] }] });
  if (!f?.[0]) return;
  const p = await addProject(f[0]);
  openProject(p);
}

async function pickNewDir() {
  const r = await invoke('fs:open', { properties: ['openDirectory', 'createDirectory'] });
  if (r?.[0]) newDir.value = r[0];
}

async function createProject() {
  const name = newName.value.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!name) return toast('プロジェクト名には英数字・-・_ を使ってください', 'warn');
  const file = await invoke('fs:join', newDir.value, name, 'compose.yaml');
  if (await invoke('fs:exists', file)) return toast('同じ場所に compose.yaml が既に存在します', 'error');
  const tpl = COMPOSE_TEMPLATES.find((t) => t.id === newTpl.value);
  await invoke('fs:write', file, tpl.yaml);
  if (newTpl.value === 'nginx') {
    await invoke('fs:write', await invoke('fs:join', newDir.value, name, 'html', 'index.html'), '<h1>Hello from WSL Container Studio!</h1>\n');
  }
  showNew.value = false;
  const p = await addProject(file);
  openProject(p);
  toast(`${name} を作成しました`, 'success');
}

async function removeProject(p) {
  await saveSettings({ composeProjects: projects.value.filter((x) => x.file !== p.file) });
  if (current.value?.file === p.file) current.value = null;
}

async function save() {
  if (!current.value) return;
  try {
    await invoke('fs:write', current.value.file, text.value);
    dirty.value = false;
    toast('保存しました', 'success', 1500);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ---- 実行 ----
async function ensureSaved() {
  if (parseError.value) {
    toast('YAML のエラーを修正してください', 'error');
    return false;
  }
  if (dirty.value) await save();
  return true;
}

async function up(services = [], opts = {}) {
  if (!(await ensureSaved())) return;
  const label = services.length ? `${current.value.name} [${services.join(', ')}]` : current.value.name;
  await remoteJob(`compose up: ${label}`, 'compose:up', current.value.file, { services, ...opts });
  refreshPs();
}

async function simple(action, services = []) {
  if (!(await ensureSaved())) return;
  const label = { stop: '停止', restart: '再起動', start: '開始', kill: '強制終了' }[action];
  await remoteJob(`compose ${label}: ${current.value.name}`, 'compose:simple', current.value.file, action, services);
  refreshPs();
}

async function down() {
  const ok = await confirm({
    title: 'プロジェクトを停止して削除',
    message: `${current.value.name} のコンテナーとネットワークを削除します。\n名前付きボリュームは残ります (メニューから「ボリュームも削除」を選べます)。`,
    okText: '削除',
    danger: true,
  });
  if (!ok) return;
  await ensureSaved();
  await remoteJob(`compose down: ${current.value.name}`, 'compose:down', current.value.file, {});
  refreshPs();
}

async function downVolumes() {
  const ok = await confirm({ title: 'ボリュームも削除', message: 'コンテナー・ネットワークに加えて、名前付きボリュームのデータも削除します。', okText: '削除', danger: true });
  if (ok) {
    await ensureSaved();
    await remoteJob(`compose down -v: ${current.value.name}`, 'compose:down', current.value.file, { volumes: true });
  }
}

async function refreshPs() {
  if (!current.value) return;
  try {
    ps.value = await invoke('compose:ps', current.value.file);
  } catch {
    ps.value = null;
  }
}

function svcContainer(name) {
  return ps.value?.containers.find((c) => c.service === name);
}
function svcState(name) {
  const c = svcContainer(name);
  if (!c) return '';
  return c.running ? 'running' : 'exited';
}

async function showPlan() {
  mode.value = 'plan';
  plan.value = null;
  planError.value = '';
  try {
    plan.value = await invoke('compose:validate', text.value, current.value.file);
  } catch (e) {
    planError.value = e.message;
  }
}

// ---- サービス編集 ----
function uniqueName(base) {
  let n = base.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'app';
  const existing = doc.value.services || {};
  if (!existing[n]) return n;
  let i = 2;
  while (existing[`${n}${i}`]) i++;
  return `${n}${i}`;
}

function addService(image = '') {
  doc.value.services = doc.value.services || {};
  const base = image ? image.split('/').pop().split(':')[0] : 'app';
  const name = uniqueName(base);
  doc.value.services[name] = image ? { image } : { image: 'alpine:latest', command: 'sleep infinity' };
  selectedSvc.value = name;
  onGuiChanged();
  formKey.value++;
}

function duplicateService(name) {
  const n = uniqueName(name);
  const copy = JSON.parse(JSON.stringify(doc.value.services[name] || {}));
  delete copy.container_name;
  delete copy.ports;
  doc.value.services[n] = copy;
  selectedSvc.value = n;
  onGuiChanged();
}

function renameService(from, to) {
  if (doc.value.services[to]) return toast(`${to} は既に存在します`, 'error');
  const entries = Object.entries(doc.value.services).map(([k, v]) => [k === from ? to : k, v]);
  doc.value.services = Object.fromEntries(entries);
  for (const s of Object.values(doc.value.services)) {
    if (Array.isArray(s?.depends_on)) s.depends_on = s.depends_on.map((d) => (d === from ? to : d));
    else if (s?.depends_on?.[from]) {
      s.depends_on = Object.fromEntries(Object.entries(s.depends_on).map(([k, v]) => [k === from ? to : k, v]));
    }
  }
  selectedSvc.value = to;
  onGuiChanged();
}

async function removeService(name) {
  const ok = await confirm({ title: 'サービスを削除', message: `サービス ${name} を compose ファイルから削除します。`, okText: '削除', danger: true });
  if (!ok) return;
  delete doc.value.services[name];
  for (const s of Object.values(doc.value.services)) {
    if (Array.isArray(s?.depends_on)) s.depends_on = s.depends_on.filter((d) => d !== name);
    else if (s?.depends_on) delete s.depends_on[name];
  }
  selectedSvc.value = Object.keys(doc.value.services)[0] || '';
  onGuiChanged();
}

function moveService(name, dir) {
  const keys = Object.keys(doc.value.services);
  const i = keys.indexOf(name);
  const j = i + dir;
  if (j < 0 || j >= keys.length) return;
  [keys[i], keys[j]] = [keys[j], keys[i]];
  doc.value.services = Object.fromEntries(keys.map((k) => [k, doc.value.services[k]]));
  onGuiChanged();
}

async function addTop(kind) {
  const name = await prompt({ title: kind === 'volumes' ? 'ボリュームを追加' : 'ネットワークを追加', label: '名前', okText: '追加' });
  if (!name) return;
  doc.value[kind] = doc.value[kind] || {};
  doc.value[kind][name.trim()] = null;
  onGuiChanged();
  formKey.value++;
}

function removeTop(kind, key) {
  delete doc.value[kind][key];
  if (!Object.keys(doc.value[kind]).length) delete doc.value[kind];
  onGuiChanged();
  formKey.value++;
}

// ---- 右クリックメニュー ----
function onSvcMenu(e, name) {
  selectedSvc.value = name;
  const c = svcContainer(name);
  const s = doc.value.services[name] || {};
  const gui = s['x-wcs-gui'];
  showMenu(e, [
    { label: 'このサービスを起動', icon: Play, hint: 'ダブルクリック', action: () => up([name]) },
    { label: '再作成して起動', icon: RefreshCw, action: () => up([name], { forceRecreate: true }) },
    { label: '停止', icon: Square, disabled: !c?.running, action: () => simple('stop', [name]) },
    { label: '再起動', icon: RotateCw, disabled: !c, action: () => simple('restart', [name]) },
    { divider: true },
    gui && { label: 'GUI を開く', icon: MonitorPlay, disabled: !c?.running, action: () => openViewer(gui.port, gui.scheme || 'http', name) },
    { label: 'ログを表示', icon: FileText, disabled: !c, action: () => (logsFor.value = c.name) },
    { label: 'ターミナルを開く', icon: Terminal, disabled: !c?.running, action: () => openTerminal(c.name, { kind: 'exec', container: c.name }) },
    { divider: true },
    { label: '名前を変更…', icon: Pencil, action: async () => {
      const n = await prompt({ title: 'サービス名を変更', label: '新しい名前', value: name, okText: '変更' });
      if (n && n !== name) renameService(name, n.trim());
    } },
    { label: '複製', icon: Copy, action: () => duplicateService(name) },
    { label: '上へ移動', icon: ArrowUp, disabled: Object.keys(doc.value.services)[0] === name, action: () => moveService(name, -1) },
    { label: '下へ移動', icon: ArrowDown, action: () => moveService(name, 1) },
    { divider: true },
    { label: 'サービスを削除', icon: Trash2, danger: true, action: () => removeService(name) },
  ], name);
}

function onSvcAreaMenu(e) {
  if (e.target.closest('.svc, .top-item, button')) return;
  showMenu(e, [
    { label: 'サービスを追加', icon: Plus, action: () => addService() },
    { label: 'ボリュームを追加', icon: HardDrive, action: () => addTop('volumes') },
    { label: 'ネットワークを追加', icon: Network, action: () => addTop('networks') },
  ]);
}

function onTopMenu(e, kind, key) {
  showMenu(e, [{ label: '削除', icon: Trash2, danger: true, action: () => removeTop(kind, key) }], key);
}

function moreMenu(e) {
  showMenu(e, [
    { label: 'イメージを取得 (pull)', icon: Download, action: () => remoteJob(`compose pull: ${current.value.name}`, 'compose:pull', current.value.file, []) },
    { label: 'イメージをビルド (build)', icon: Hammer, action: () => remoteJob(`compose build: ${current.value.name}`, 'compose:build', current.value.file, []) },
    { label: 'ビルドして起動', icon: Play, action: () => up([], { build: true }) },
    { label: 'すべて再作成して起動', icon: RefreshCw, action: () => up([], { forceRecreate: true }) },
    { label: '孤立コンテナーを削除して起動', icon: Play, action: () => up([], { removeOrphans: true }) },
    { divider: true },
    { label: 'フォルダーを開く', icon: FolderSearch, action: () => invoke('app:showItem', current.value.file) },
    { label: 'YAML をコピー', icon: Copy, action: () => navigator.clipboard.writeText(text.value) },
    { divider: true },
    { label: '停止して削除 (ボリュームも削除)', icon: Trash2, danger: true, action: downVolumes },
  ]);
}

function onProjectMenu(e, p) {
  showMenu(e, [
    { label: '開く', icon: FolderOpen, action: () => openProject(p) },
    { label: 'エクスプローラーで表示', icon: FolderSearch, action: () => invoke('app:showItem', p.file) },
    { divider: true },
    { label: '一覧から外す', icon: X, action: () => removeProject(p) },
  ], p.name);
}

function onProjectsMenu(e) {
  if (e.target.closest('.p-item, button')) return;
  showMenu(e, [
    { label: '新規プロジェクト…', icon: Plus, action: () => (showNew.value = true) },
    { label: '既存のファイルを開く…', icon: FolderOpen, action: openExisting },
  ]);
}

// ---- 他画面からの「Compose に追加」 ----
function consumeInbox() {
  if (!state.composeInbox.length) return;
  if (!current.value) {
    toast('追加先のプロジェクトを開くか作成してください', 'warn');
    return;
  }
  const items = state.composeInbox.splice(0);
  items.forEach((it) => addService(it.image));
  mode.value = mode.value === 'text' ? 'split' : mode.value;
  toast(`${items.map((i) => i.image).join(', ')} をサービスとして追加しました`, 'success');
}
watch(() => state.composeInbox.length, consumeInbox);

function onKey(e) {
  if (dockerfileEditor.value) return;
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    save();
  }
}

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  return confirm({ title: '未保存の変更', message: 'Compose ファイルの変更が保存されていません。移動しますか？', okText: '移動 (破棄)', danger: true });
});

watch(() => state.refreshTick, refreshPs);
onMounted(async () => {
  window.addEventListener('keydown', onKey);
  invoke('app:paths').then((p) => (newDir.value = p.compose));
  wslcJson(['images', '--format', 'json'])
    .then((l) => (images.value = l.filter((i) => i.Repository !== '<none>').map((i) => `${i.Repository}:${i.Tag}`)))
    .catch(() => {});
  if (projects.value.length) await openProject(projects.value[0]);
  else consumeInbox();
});
// 設定の読み込みが画面表示より遅れた場合も、最初のプロジェクトを開く
watch(
  () => projects.value.length,
  (n, old) => {
    if (n && !old && !current.value) openProject(projects.value[0]);
  },
);
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.compose {
  flex: 1;
  min-height: 0;
  display: flex;
  height: 100%;
}
.projects {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 14px 10px;
  overflow: auto;
}
.p-head {
  display: flex;
  align-items: center;
  padding: 0 4px 10px 6px;
}
.p-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.p-item:hover {
  background: var(--panel);
}
.p-item.active {
  background: var(--accent-bg);
}
.p-item > svg {
  width: 16px;
  color: var(--accent-2);
  flex-shrink: 0;
}
.p-main {
  min-width: 0;
}
.editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 20px 16px;
  gap: 10px;
}
.empty-editor {
  justify-content: center;
}
.e-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.e-title {
  min-width: 0;
}
.e-title h2 {
  font-size: 18px;
}
.dirty {
  color: var(--yellow);
  margin-left: 6px;
  font-size: 14px;
}
.e-actions .sep {
  width: 1px;
  height: 22px;
  background: var(--border);
}
.e-body {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 12px;
}
.e-body.split {
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
}
.e-body.gui,
.e-body.text,
.e-body.plan {
  grid-template-columns: 1fr;
}
.gui {
  min-height: 0;
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 12px;
}
.gui > .notice {
  grid-column: 1 / -1;
  align-self: start;
}
.svc-list {
  overflow: auto;
  padding-right: 2px;
}
.svc-list-head {
  padding: 2px 2px 6px 4px;
  color: var(--text-3);
}
.svc {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--panel);
  margin-bottom: 6px;
  cursor: pointer;
}
.svc:hover {
  border-color: var(--border-2);
}
.svc.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.svc-main {
  flex: 1;
  min-width: 0;
}
.gui-ic {
  width: 14px;
  color: var(--purple);
}
.top-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 6px;
  color: var(--text-2);
}
.top-item:hover {
  background: var(--panel);
}
.top-item svg {
  width: 14px;
}
.svc-edit {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}
.text {
  min-width: 0;
  min-height: 0;
}
.plan {
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.templates {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.tpl {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-2);
  background: var(--panel-2);
  color: var(--text-2);
  font: inherit;
  cursor: pointer;
}
.tpl.active {
  border-color: var(--accent);
  color: var(--text);
  background: var(--accent-bg);
}
</style>
