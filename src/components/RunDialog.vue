<template>
  <Modal v-if="state.runDialog" :title="state.runDialog.title || 'コンテナーを実行'" width="820px" @close="close">
    <template #icon><Play /></template>
    <div class="run">
      <div class="tabs">
        <button v-for="t in tabs" :key="t.id" class="tab" :class="{ active: tab === t.id }" @click="tab = t.id">
          <component :is="t.icon" />{{ t.label }}
          <span v-if="t.count && t.count()" class="badge blue">{{ t.count() }}</span>
        </button>
      </div>

      <div class="pane">
        <template v-if="tab === 'basic'">
          <div class="grid-2">
            <label class="field">
              イメージ *
              <input v-model="f.image" class="input mono" list="run-images" placeholder="nginx:alpine" />
              <datalist id="run-images"><option v-for="i in images" :key="i" :value="i" /></datalist>
            </label>
            <label class="field">
              コンテナー名
              <input v-model="f.name" class="input mono" placeholder="(自動)" />
            </label>
          </div>
          <label class="field">
            コマンド (任意)
            <input v-model="f.command" class="input mono" placeholder='例: sh -c "echo hello && sleep infinity"' />
          </label>
          <div class="row wrap">
            <label class="check"><input v-model="f.interactive" type="checkbox" />標準入力を開く (-i)</label>
            <label class="check"><input v-model="f.tty" type="checkbox" />TTY を割り当てる (-t)</label>
            <label class="check"><input v-model="f.rm" type="checkbox" />停止時に削除 (--rm)</label>
            <label class="check"><input v-model="f.openTerminal" type="checkbox" />起動後にターミナルを開く</label>
          </div>
          <div class="grid-2">
            <label class="field">
              イメージの取得
              <select v-model="f.pull" class="input">
                <option value="missing">ローカルになければ取得 (既定)</option>
                <option value="always">常に最新を取得</option>
                <option value="never">取得しない</option>
              </select>
            </label>
            <label class="field">
              ネットワーク
              <select v-model="f.network" class="input">
                <option value="">bridge (既定)</option>
                <option v-for="n in networks" :key="n" :value="n">{{ n }}</option>
              </select>
            </label>
          </div>
        </template>

        <template v-else-if="tab === 'ports'">
          <h4>ポート公開 <span class="muted small">ホスト側は 127.0.0.1 で待ち受けます</span></h4>
          <RowsEditor
            v-model="f.ports"
            add-label="ポートを追加"
            :columns="[
              { key: 'host', placeholder: 'ホスト (例 8080)' },
              { key: 'container', placeholder: 'コンテナー (例 80)' },
              { key: 'proto', type: 'select', options: ['tcp', 'udp'], default: 'tcp' },
            ]"
          />
          <h4>ボリューム / フォルダーのマウント</h4>
          <p class="muted small">ソースには Windows のフォルダー (例 C:\work) か名前付きボリュームを指定できます。</p>
          <RowsEditor
            v-model="f.volumes"
            add-label="マウントを追加"
            browse
            @browse="browse"
            :columns="[
              { key: 'source', placeholder: 'C:\\path または ボリューム名', flex: 1.4, list: 'run-volumes' },
              { key: 'target', placeholder: '/コンテナー内のパス' },
              { key: 'readonly', type: 'check', label: '読み取り専用' },
            ]"
          />
          <datalist id="run-volumes"><option v-for="v in volumes" :key="v" :value="v" /></datalist>
        </template>

        <template v-else-if="tab === 'env'">
          <h4>環境変数</h4>
          <RowsEditor
            v-model="f.env"
            add-label="環境変数を追加"
            :columns="[
              { key: 'key', placeholder: 'KEY' },
              { key: 'value', placeholder: 'value', flex: 2 },
            ]"
          />
          <h4>ラベル</h4>
          <RowsEditor
            v-model="f.labels"
            add-label="ラベルを追加"
            :columns="[
              { key: 'key', placeholder: 'key' },
              { key: 'value', placeholder: 'value', flex: 2 },
            ]"
          />
        </template>

        <template v-else-if="tab === 'advanced'">
          <div class="grid-3">
            <label class="field">ホスト名<input v-model="f.hostname" class="input mono" /></label>
            <label class="field">作業ディレクトリ<input v-model="f.workdir" class="input mono" placeholder="/app" /></label>
            <label class="field">ユーザー<input v-model="f.user" class="input mono" placeholder="1000:1000" /></label>
            <label class="field">CPU 数<input v-model="f.cpus" class="input mono" placeholder="例 1.5" /></label>
            <label class="field">メモリ上限<input v-model="f.memory" class="input mono" placeholder="例 2G" /></label>
            <label class="field">/dev/shm サイズ<input v-model="f.shm" class="input mono" placeholder="例 1g" /></label>
            <label class="field">エントリーポイント<input v-model="f.entrypoint" class="input mono" /></label>
          </div>
          <label class="check"><input v-model="f.gpus" type="checkbox" />GPU を割り当てる (--gpus all)</label>
        </template>

        <template v-else-if="tab === 'gui'">
          <div class="notice">
            <MonitorPlay />
            <div>
              コンテナー内で noVNC / KasmVNC などの Web 画面を提供するイメージなら、アプリ内のビューアーで GUI を表示できます。
              公開したホスト側ポートを指定してください。
            </div>
          </div>
          <div class="grid-2">
            <label class="field">GUI ビューアーのポート (ホスト側)<input v-model="f.guiPort" class="input mono" placeholder="例 5800" /></label>
            <label class="field">
              プロトコル
              <select v-model="f.guiScheme" class="input"><option>http</option><option>https</option></select>
            </label>
          </div>
          <label class="field">GUI の開始ページ<input v-model="f.guiPath" class="input mono" placeholder="例 /vnc.html?autoconnect=1" /></label>
          <label class="check"><input v-model="f.openViewer" type="checkbox" />起動後にビューアーを開く</label>
        </template>
      </div>

      <div class="preview">
        <div class="row">
          <TerminalSquare />
          <b class="small">実行されるコマンド</b>
          <div class="spacer"></div>
          <button class="btn ghost sm" @click="copyText(cmd)"><Copy />コピー</button>
        </div>
        <pre class="code">{{ cmd }}</pre>
      </div>
    </div>
    <template #footer>
      <button class="btn" @click="close">キャンセル</button>
      <button class="btn primary" :disabled="!f.image.trim() || busy" @click="run">
        <LoaderCircle v-if="busy" class="spin" /><Play v-else />実行
      </button>
    </template>
  </Modal>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import {
  Play, Copy, LoaderCircle, TerminalSquare, Settings2, Cable, ListTree, SlidersHorizontal, MonitorPlay,
} from '@lucide/vue';
import Modal from './Modal.vue';
import RowsEditor from './RowsEditor.vue';
import { state, runJob, copyText, openTerminal, openViewer, toast } from '../lib/store.js';
import { wslcJson, invoke } from '../lib/api.js';
import { emptyRunForm, buildRunArgs } from '../lib/runArgs.js';
import { commandLine } from '../lib/format.js';

const f = reactive(emptyRunForm());
const tab = ref('basic');
const busy = ref(false);
const images = ref([]);
const networks = ref([]);
const volumes = ref([]);

const tabs = [
  { id: 'basic', label: '基本', icon: Settings2 },
  { id: 'ports', label: 'ポート・マウント', icon: Cable, count: () => f.ports.length + f.volumes.length },
  { id: 'env', label: '環境変数・ラベル', icon: ListTree, count: () => f.env.length + f.labels.length },
  { id: 'advanced', label: '詳細', icon: SlidersHorizontal },
  { id: 'gui', label: 'GUI', icon: MonitorPlay, count: () => (f.guiPort ? 1 : 0) },
];

const cmd = computed(() => (f.image.trim() ? commandLine(buildRunArgs(f)) : 'wslc run …'));

watch(
  () => state.runDialog?.key,
  async (k) => {
    if (!k) return;
    const p = state.runDialog;
    Object.assign(f, emptyRunForm(), JSON.parse(JSON.stringify(p.form || {})));
    if (p.image) f.image = p.image;
    tab.value = p.tab || 'basic';
    busy.value = false;
    try {
      const [imgs, nets, vols] = await Promise.all([
        wslcJson(['images', '--format', 'json']),
        wslcJson(['network', 'list', '--format', 'json']),
        wslcJson(['volume', 'list', '--format', 'json']),
      ]);
      images.value = imgs.filter((i) => i.Repository !== '<none>').map((i) => `${i.Repository}:${i.Tag}`);
      networks.value = nets.map((n) => n.Name).filter((n) => n !== 'bridge');
      volumes.value = vols.map((v) => v.Name);
    } catch {
      /* 補完候補は取れなくても実行可能 */
    }
  },
);

async function browse(row) {
  const r = await invoke('fs:open', { properties: ['openDirectory'] });
  if (r?.[0]) row.source = r[0];
}

function close() {
  state.runDialog = null;
}

async function run() {
  busy.value = true;
  const args = buildRunArgs(f);
  const name = f.name || f.image;
  const opts = { ...f };
  close();
  const ok = await runJob(`コンテナー実行: ${name}`, args);
  if (!ok) return;
  if (opts.guiPort && opts.openViewer) {
    toast('GUI ビューアーを開いています…', 'info');
    openViewer(opts.guiPort, opts.guiScheme, name, opts.guiPath);
  }
  if (opts.openTerminal) {
    const job = state.jobs[0];
    const id = (job?.log.match(/^[0-9a-f]{64}$/m) || [])[0]?.slice(0, 12) || opts.name;
    if (id) openTerminal(name, { kind: 'exec', container: id });
  }
}
</script>

<style scoped>
.run {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 300px;
}
.pane h4 {
  font-size: 13px;
  margin-top: 4px;
}
.wrap {
  flex-wrap: wrap;
  gap: 16px;
}
.preview .row svg {
  width: 15px;
  color: var(--accent-2);
}
.preview pre {
  margin-top: 6px;
  max-height: 110px;
}
</style>
