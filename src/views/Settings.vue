<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>設定</h1>
        <div class="sub">wslc の状態、Docker Hub の認証、アプリの動作</div>
      </div>
    </div>
    <div class="page-body">
      <div class="settings">
        <div v-if="dataPaths" class="card">
          <h3><HardDrive />データの保存先</h3>
          <p class="small selectable mono">{{ dataPaths.data }}</p>
          <p class="muted small">アプリ設定・キャッシュ・新規Compose・GUIビルド用ファイルをこのフォルダーに保存します。</p>
          <button class="btn" @click="invoke('app:openPath', dataPaths.data)"><FolderOpen />dataフォルダーを開く</button>
        </div>
        <div v-if="storageInfo" class="card">
          <h3><HardDrive />イメージ・コンテナーの保存先</h3>
          <label class="field">既定セッションの保存先フォルダー
            <div class="row">
              <input v-model="storageTarget" class="input mono" style="flex: 1" :disabled="storageBusy" />
              <button class="btn" :disabled="storageBusy" @click="pickStorage"><FolderOpen />選択</button>
            </div>
          </label>
          <p class="muted small" style="margin-top: 10px">変更は次回のwslcセッション起動から適用されます。既存のイメージ・コンテナー・ボリュームは元の場所に残り、新しい保存先には自動移動されません。保存先を戻すと元のデータを使えます。この設定は同じWindowsユーザーのwslcにも適用されます。</p>
          <div class="row">
            <button class="btn primary" :disabled="storageBusy || !storageTarget.trim() || storageTarget.trim() === storageInfo.storagePath" @click="saveStorage"><Save />保存先を変更</button>
            <button class="btn" :disabled="storageBusy" @click="invoke('app:openPath', storageInfo.storagePath)"><FolderOpen />保存先フォルダーを開く</button>
          </div>
          <div v-if="storageInfo.vhds.length" style="margin-top: 14px">
            <b class="small">見つかった仮想ディスク（実データ）</b>
            <p class="muted small" style="margin-top: 8px">イメージを削除しても VHDX は自動で縮小されないことがあります。「縮小・最適化」で空き領域を回収できます。現在の保存先では対象セッションを停止します。</p>
            <div v-for="vhd in storageInfo.vhds" :key="vhd.path" style="margin-top: 8px">
              <div class="small mono selectable" style="overflow-wrap: anywhere">{{ vhd.path }}</div>
              <div class="row small muted" style="flex-wrap: wrap">{{ bytes(vhd.size) }}<button class="btn ghost sm" @click="invoke('app:showItem', vhd.path)">エクスプローラーで表示</button>
                <button class="btn sm" :disabled="storageBusy || storageInfo.compactBusy" @click="optimizeVhd(vhd)"><HardDrive />縮小・最適化</button>
              </div>
            </div>
            <p v-if="storageBusy || storageInfo.compactBusy" class="small muted" role="status" style="margin-top: 12px">処理中です。進行状況は「タスク」で確認できます。</p>
            <div v-if="storageInfo.compactResult" class="notice" role="status" style="margin-top: 12px">
              <div><b>最適化が完了しました</b><div class="small selectable" style="overflow-wrap: anywhere">{{ storageInfo.compactResult.path }}</div>
                <div>{{ bytes(storageInfo.compactResult.before) }} → {{ bytes(storageInfo.compactResult.after) }}（{{ bytes(storageInfo.compactResult.reclaimed) }} 削減）</div>
                <div v-if="!storageInfo.compactResult.reclaimed" class="small muted">回収可能な領域がなかったため、サイズは変わりませんでした。</div>
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <h3><Cpu />WSL3 / wslc</h3>
          <div v-if="!status" class="muted">確認中…</div>
          <div v-else-if="!status.found" class="notice error">
            <CircleX />
            <div>
              wslc.exe が見つかりません。管理者権限の PowerShell で次を実行し、WSL3 に更新してください。
              <pre class="code" style="margin-top: 8px">wsl --update</pre>
            </div>
          </div>
          <template v-else>
            <table class="kv">
              <tr><td>実行ファイル</td><td class="mono selectable">{{ status.path }}</td></tr>
              <tr><td>バージョン</td><td class="mono">{{ info?.Version }}</td></tr>
              <tr><td>カーネル</td><td class="mono">{{ info?.KernelVersion }}</td></tr>
              <tr><td>Direct3D / DXCore</td><td class="mono">{{ info?.Direct3DVersion }} / {{ info?.DxCoreVersion }}</td></tr>
              <tr><td>セッション</td><td class="mono">{{ sessions }}</td></tr>
              <tr><td>端末</td><td>{{ status.pty ? 'ConPTY (node-pty) — フル機能' : 'パイプ接続 (簡易モード)' }}</td></tr>
            </table>
            <div v-if="!status.ok" class="notice error" style="margin-top: 10px"><CircleX /><div class="selectable">{{ status.error }}</div></div>
            <div class="grid-2" style="margin-top: 14px">
              <label class="field">
                使用するセッション名 (空欄で既定)
                <input v-model="form.session" class="input mono" placeholder="(既定のセッション)" />
              </label>
              <label class="field">
                一覧の自動更新間隔
                <select v-model.number="form.pollInterval" class="input">
                  <option :value="2000">2 秒</option>
                  <option :value="3000">3 秒</option>
                  <option :value="5000">5 秒</option>
                  <option :value="10000">10 秒</option>
                </select>
              </label>
            </div>
            <div class="row" style="margin-top: 12px">
              <button class="btn primary" @click="saveGeneral"><Save />保存</button>
              <button class="btn" @click="refreshStatus"><RefreshCw />再確認</button>
              <div class="spacer"></div>
              <button v-if="info?.SettingsFile" class="btn" @click="openSettingsFile"><FileCog />wslc の設定ファイルを開く</button>
            </div>
          </template>
        </div>

        <div class="card">
          <h3><KeyRound />Docker Hub / レジストリ認証</h3>
          <p class="muted small">
            公開イメージの検索と取得に認証は不要です。プライベートリポジトリ・プッシュ・取得回数の上限緩和に使います。
            トークンは Docker Hub の <a @click="openTokenPage">Account settings → Personal access tokens</a> で発行します。
            保存したトークンは Windows の DPAPI で暗号化されます。
          </p>
          <div class="grid-2">
            <label class="field">ユーザー名<input v-model="form.hubUsername" class="input mono" /></label>
            <label class="field">
              アクセストークン (PAT)
              <input v-model="token" type="password" class="input mono" :placeholder="state.settings.hasHubToken ? '●●●●●● (保存済み・変更時のみ入力)' : 'dckr_pat_…'" />
            </label>
          </div>
          <div class="row" style="margin-top: 12px; flex-wrap: wrap">
            <button class="btn primary" @click="saveHub"><Save />保存</button>
            <button class="btn" :disabled="!state.settings.hasHubToken" @click="testHub"><ShieldCheck />Hub API にログイン</button>
            <button class="btn" :disabled="!state.settings.hasHubToken" @click="registryLogin"><LogIn />wslc login (pull/push 用)</button>
            <button class="btn" @click="registryLogout"><LogOut />wslc logout</button>
            <div class="spacer"></div>
            <button class="btn danger" :disabled="!state.settings.hasHubToken" @click="clearToken"><Trash2 />トークンを削除</button>
          </div>
        </div>

        <div class="card">
          <h3><Info />このアプリについて</h3>
          <p class="small" style="line-height: 1.8">
            WSL Container Studio は WSL3 に同梱の WSL Container CLI (wslc) を使う GUI 管理ツールです。WSL2 のディストリビューションや Docker Desktop / Docker Engine は不要です。<br />
            compose は wslc に存在しないため、アプリ内のエンジンが compose.yaml を解釈して wslc コマンドを順に実行します。<br />
            GUI アプリは WSLg がコンテナーに渡されないため、Web VNC (noVNC など) 経由で表示します。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue';
import {
  Cpu, CircleX, Save, RefreshCw, FileCog, KeyRound, ShieldCheck, LogIn, LogOut, Trash2, Info, HardDrive, FolderOpen,
} from '@lucide/vue';
import { state, saveSettings, refreshStatus, act, toast, remoteJob } from '../lib/store.js';
import { invoke, wslc } from '../lib/api.js';
import { bytes } from '../lib/format.js';

const status = computed(() => state.status);
const info = computed(() => state.status?.info?.Client);
const sessions = computed(() => {
  const s = state.status?.info?.Server?.Sessions || [];
  return s.length ? s.map((x) => x.Name || x.name || JSON.stringify(x)).join(', ') : '(なし)';
});

const form = reactive({ session: '', pollInterval: 3000, hubUsername: '' });
const token = ref('');
const dataPaths = ref(null);
const storageInfo = ref(null);
const storageTarget = ref('');
const storageBusy = ref(false);
onMounted(() => invoke('app:paths').then((p) => (dataPaths.value = p)).catch((e) => toast(e.message, 'error')));
onMounted(() => invoke('storage:get').then((info) => {
  storageInfo.value = info;
  storageTarget.value = info.storagePath;
}).catch((e) => toast(e.message, 'error')));
watch(() => state.refreshTick, () => invoke('storage:get').then((info) => {
  storageInfo.value = info;
}).catch((e) => toast(e.message, 'error')));

async function pickStorage() {
  try {
    const selected = await invoke('fs:open', { title: 'イメージ・コンテナーの保存先', defaultPath: storageTarget.value, properties: ['openDirectory', 'createDirectory'] });
    if (selected?.[0]) storageTarget.value = selected[0];
  } catch (e) { toast(e.message, 'error'); }
}

async function optimizeVhd(vhd) {
  storageBusy.value = true;
  try {
    await remoteJob('VHDX の縮小・最適化', 'storage:compact', vhd.path);
    storageInfo.value = await invoke('storage:get');
    await refreshStatus();
  } catch (e) { toast(e.message, 'error'); }
  finally { storageBusy.value = false; }
}

async function saveStorage() {
  storageBusy.value = true;
  try {
    const result = await invoke('storage:setPath', storageTarget.value);
    state.settings = result.settings;
    storageInfo.value = result;
    storageTarget.value = result.storagePath;
    toast('保存先を保存しました。次回のwslcセッション起動から適用されます。', 'success');
  } catch (e) { toast(e.message, 'error'); }
  finally { storageBusy.value = false; }
}

watch(
  () => state.settings,
  (s) => Object.assign(form, { session: s.session || '', pollInterval: s.pollInterval || 3000, hubUsername: s.hubUsername || '' }),
  { immediate: true },
);

async function saveGeneral() {
  await act(() => saveSettings({ session: form.session.trim(), pollInterval: form.pollInterval }), { success: '保存しました' });
  refreshStatus();
}

async function saveHub() {
  await saveSettings({ hubUsername: form.hubUsername.trim() });
  if (token.value) {
    state.settings = await invoke('settings:setSecret', 'hubToken', token.value.trim());
    token.value = '';
  }
  toast('保存しました', 'success');
}

function testHub() {
  act(() => invoke('hub:login'), { success: 'Docker Hub API にログインしました', refresh: false });
}
function registryLogin() {
  act(() => invoke('registry:login'), { success: (r) => String(r).trim() || 'ログインしました', refresh: false });
}
function registryLogout() {
  act(() => invoke('registry:logout'), { success: 'ログアウトしました', refresh: false });
}
async function clearToken() {
  state.settings = await invoke('settings:setSecret', 'hubToken', '');
  toast('トークンを削除しました', 'success');
}
async function openSettingsFile() {
  const p = info.value.SettingsFile;
  if (await invoke('fs:exists', p)) invoke('app:openPath', p);
  else act(() => wslc(['settings']), { success: '設定ファイルを作成して既定のエディターで開きました', refresh: false });
}
function openTokenPage() {
  invoke('app:openExternal', 'https://app.docker.com/settings/personal-access-tokens');
}
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 920px;
}
.card h3 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.card h3 svg {
  width: 16px;
  color: var(--accent-2);
}
.kv {
  width: 100%;
  border-collapse: collapse;
}
.kv td {
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.kv td:first-child {
  color: var(--text-3);
  width: 160px;
}
p {
  margin: 0 0 12px;
  line-height: 1.7;
}
</style>
