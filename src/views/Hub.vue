<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Docker Hub</h1>
        <div class="sub">イメージを検索して、クリックで詳細とタグ一覧、右クリックで取得・実行・Compose 追加</div>
      </div>
      <div class="spacer"></div>
      <div class="segmented">
        <button :class="{ active: mode === 'search' }" @click="mode = 'search'"><Search />検索</button>
        <button :class="{ active: mode === 'mine' }" @click="loadMine"><User />マイリポジトリ</button>
      </div>
    </div>
    <div class="hub">
      <div class="left">
        <div v-if="mode === 'search'" class="searchbar">
          <Search />
          <input
            ref="searchInput"
            v-model="query"
            class="input"
            placeholder="例: nginx, postgres, python, jlesage/firefox"
            @keydown.enter="search(1)"
          />
          <button class="btn primary" :disabled="!query.trim() || loading" @click="search(1)">検索</button>
        </div>
        <div v-if="mode === 'search' && !results.length && !loading" class="popular">
          <div class="muted small" style="margin-bottom: 8px">よく使われるイメージ</div>
          <button v-for="p in popular" :key="p" class="chip" @click="(query = p), search(1)">{{ p }}</button>
        </div>
        <div v-if="error" class="notice error"><CircleX /><div class="selectable">{{ error }}</div></div>
        <div class="results">
          <div v-if="loading" class="muted" style="padding: 12px">検索中…</div>
          <div
            v-for="r in results"
            :key="r.name"
            class="result"
            :class="{ active: current?.name === r.name }"
            @click="select(r)"
            @dblclick="pull(r.name)"
            @contextmenu="onMenu($event, r)"
          >
            <div class="r-icon" :class="{ official: r.official }">
              <BadgeCheck v-if="r.official" /><Lock v-else-if="r.isPrivate" /><Package v-else />
            </div>
            <div class="r-main">
              <div class="row">
                <b class="ellipsis">{{ r.name }}</b>
                <span v-if="r.official" class="badge green">公式</span>
                <span v-if="r.isPrivate" class="badge yellow">非公開</span>
              </div>
              <div class="muted small ellipsis">{{ r.description || '説明なし' }}</div>
            </div>
            <div class="r-meta small muted">
              <span><Star />{{ compactNumber(r.stars) }}</span>
              <span><Download />{{ compactNumber(r.pulls) }}</span>
            </div>
          </div>
        </div>
        <div v-if="mode === 'search' && total > results.length" class="pager">
          <button class="btn sm" :disabled="page <= 1" @click="search(page - 1)">前へ</button>
          <span class="muted small">{{ page }} ページ / 全 {{ total.toLocaleString() }} 件</span>
          <button class="btn sm" @click="search(page + 1)">次へ</button>
        </div>
      </div>

      <div class="right">
        <div v-if="!current" class="empty"><Search /><div>左の一覧からイメージを選択してください</div></div>
        <template v-else>
          <div class="r-head">
            <div>
              <h2>{{ current.name }}</h2>
              <div class="muted small">{{ repo?.description || current.description }}</div>
            </div>
            <div class="spacer"></div>
            <button class="btn" @click="openHub(current.name)"><ExternalLink />Hub で開く</button>
            <button class="btn" @click="openRun({ image: `${current.name}:${selectedTag}` })"><Play />実行</button>
            <button class="btn primary" @click="pull(`${current.name}:${selectedTag}`)"><Download />取得</button>
          </div>
          <div class="row pull-line">
            <span class="muted small">タグ</span>
            <select v-model="selectedTag" class="input mono" style="width: 220px">
              <option v-for="t in tags" :key="t.name" :value="t.name">{{ t.name }}</option>
              <option v-if="!tags.some((t) => t.name === 'latest')" value="latest">latest</option>
            </select>
            <code class="cmd selectable">wslc pull {{ current.name }}:{{ selectedTag }}</code>
            <button class="btn ghost icon sm" @click="copyText(`wslc pull ${current.name}:${selectedTag}`)"><Copy /></button>
          </div>
          <div class="tabs">
            <button class="tab" :class="{ active: rtab === 'overview' }" @click="rtab = 'overview'"><BookOpen />概要</button>
            <button class="tab" :class="{ active: rtab === 'tags' }" @click="rtab = 'tags'"><Tag />タグ ({{ tagCount }})</button>
          </div>
          <div class="r-body">
            <div v-if="rtab === 'overview'" class="markdown selectable" v-html="readme"></div>
            <div v-else>
              <table class="table">
                <thead><tr><th>タグ</th><th style="width: 110px">サイズ</th><th style="width: 120px">更新</th><th>アーキテクチャ</th></tr></thead>
                <tbody>
                  <tr
                    v-for="t in tags"
                    :key="t.name"
                    :class="{ selected: selectedTag === t.name }"
                    @click="selectedTag = t.name"
                    @dblclick="pull(`${current.name}:${t.name}`)"
                    @contextmenu="onTagMenu($event, t)"
                  >
                    <td class="mono"><b>{{ t.name }}</b></td>
                    <td class="mono small">{{ bytes(t.size) }}</td>
                    <td class="small">{{ timeAgo(t.updated) }}</td>
                    <td class="small muted ellipsis">{{ t.archs.join(', ') }}</td>
                  </tr>
                </tbody>
              </table>
              <button v-if="tagsNext" class="btn sm" style="margin-top: 10px" @click="loadTags(tagPage + 1)">さらに読み込む</button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  Search, User, Star, Download, Package, BadgeCheck, Lock, ExternalLink, Play, Copy, Tag, BookOpen, CircleX,
  FileCode2, MonitorPlay,
} from '@lucide/vue';
import { invoke } from '../lib/api.js';
import { state, runJob, openRun, copyText, toast } from '../lib/store.js';
import { compactNumber, bytes, timeAgo } from '../lib/format.js';
import { showMenu } from '../lib/contextMenu.js';

const router = useRouter();
const mode = ref('search');
const query = ref('');
const results = ref([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const error = ref('');
const current = ref(null);
const repo = ref(null);
const tags = ref([]);
const tagCount = ref(0);
const tagsNext = ref(false);
const tagPage = ref(1);
const selectedTag = ref('latest');
const rtab = ref('overview');
const searchInput = ref(null);

const popular = ['nginx', 'postgres', 'mysql', 'redis', 'node', 'python', 'ubuntu', 'alpine', 'jlesage/firefox', 'linuxserver/webtop'];

const readme = computed(() => {
  const md = repo.value?.fullDescription || repo.value?.description || current.value?.description || '';
  return DOMPurify.sanitize(marked.parse(md || '_説明はありません_'));
});

async function search(p) {
  if (!query.value.trim()) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await invoke('hub:search', query.value.trim(), p);
    results.value = r.results;
    total.value = r.count;
    page.value = p;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function loadMine() {
  mode.value = 'mine';
  if (!state.settings.hubUsername) {
    error.value = '設定画面で Docker Hub のユーザー名とアクセストークンを登録してください。';
    results.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const st = await invoke('hub:status');
    if (!st.loggedIn && state.settings.hasHubToken) await invoke('hub:login');
    results.value = await invoke('hub:myRepos');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function select(r) {
  current.value = r;
  repo.value = null;
  tags.value = [];
  selectedTag.value = 'latest';
  rtab.value = 'overview';
  invoke('hub:repo', r.name).then((x) => (repo.value = x)).catch(() => {});
  loadTags(1);
}

async function loadTags(p) {
  try {
    const r = await invoke('hub:tags', current.value.name, p);
    tags.value = p === 1 ? r.results : [...tags.value, ...r.results];
    tagCount.value = r.count;
    tagsNext.value = r.next;
    tagPage.value = p;
    // latest が存在しないリポジトリ (タグが 1 ページに収まり latest が無い) のときだけ先頭のタグを既定にする
    if (p === 1 && !r.next && r.results.length && !r.results.some((t) => t.name === 'latest')) selectedTag.value = r.results[0].name;
  } catch (e) {
    toast(e.message, 'error');
  }
}

function pull(ref_) {
  runJob(`pull ${ref_}`, ['pull', ref_]);
}

function openHub(name) {
  const path = name.includes('/') ? `r/${name}` : `_/${name}`;
  invoke('app:openExternal', `https://hub.docker.com/${path}`);
}

function addToCompose(image) {
  state.composeInbox.push({ image });
  router.push('/compose');
}

function imageMenu(image) {
  return [
    { label: `${image} を取得`, icon: Download, action: () => pull(image) },
    { label: '実行…', icon: Play, action: () => openRun({ image }) },
    { label: 'GUI アプリとして実行…', icon: MonitorPlay, action: () => openRun({ image, tab: 'gui' }) },
    { label: 'Compose に追加', icon: FileCode2, action: () => addToCompose(image) },
    { divider: true },
    { label: '名前をコピー', icon: Copy, action: () => copyText(image) },
    { label: 'pull コマンドをコピー', icon: Copy, action: () => copyText(`wslc pull ${image}`) },
  ];
}

function onMenu(e, r) {
  showMenu(e, [
    { label: '詳細を表示', icon: BookOpen, action: () => select(r) },
    ...imageMenu(`${r.name}:latest`),
    { label: 'Docker Hub で開く', icon: ExternalLink, action: () => openHub(r.name) },
  ], r.name);
}

function onTagMenu(e, t) {
  selectedTag.value = t.name;
  showMenu(e, imageMenu(`${current.value.name}:${t.name}`), `${current.value.name}:${t.name}`);
}

onMounted(() => searchInput.value?.focus());
</script>

<style scoped>
.hub {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(360px, 40%) minmax(0, 1fr);
  gap: 14px;
  padding: 0 24px 24px;
}
.left,
.right {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.right {
  min-width: 0;
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}
.searchbar {
  position: relative;
  display: flex;
  gap: 8px;
}
.searchbar > svg {
  position: absolute;
  left: 11px;
  top: 10px;
  width: 15px;
  color: var(--text-3);
}
.searchbar .input {
  flex: 1;
  height: 36px;
  padding-left: 34px;
  font-size: 14px;
}
.searchbar .btn {
  height: 36px;
}
.chip {
  margin: 0 6px 6px 0;
  padding: 5px 12px;
  border-radius: 14px;
  border: 1px solid var(--border-2);
  background: var(--panel);
  color: var(--text-2);
  font: inherit;
  cursor: pointer;
}
.chip:hover {
  border-color: var(--accent);
  color: var(--text);
}
.results {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.result {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  cursor: pointer;
}
.result:hover {
  border-color: var(--border-2);
}
.result.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.r-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: var(--panel-3);
  flex-shrink: 0;
}
.r-icon.official {
  background: var(--green-bg);
  color: var(--green);
}
.r-icon svg {
  width: 17px;
}
.r-main {
  flex: 1;
  min-width: 0;
}
.r-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.r-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.r-meta svg {
  width: 12px;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.r-head {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
}
.r-head > div:first-child {
  min-width: 0;
  flex: 1 1 260px;
}
.r-head h2 {
  font-size: 18px;
  margin-bottom: 4px;
}
.pull-line {
  padding: 8px 10px;
  background: var(--bg-2);
  border-radius: var(--radius-sm);
}
.cmd {
  flex: 1;
  font-size: 12px;
  color: var(--accent-2);
}
.r-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.markdown {
  overflow-wrap: anywhere;
  line-height: 1.7;
  padding: 4px 4px 20px;
}
.markdown :deep(pre) {
  background: var(--bg-2);
  padding: 10px;
  border-radius: 6px;
  overflow: auto;
}
.markdown :deep(code) {
  font-size: 12px;
}
.markdown :deep(img) {
  max-width: 100%;
}
.markdown :deep(table) {
  border-collapse: collapse;
}
.markdown :deep(td),
.markdown :deep(th) {
  border: 1px solid var(--border);
  padding: 4px 8px;
}
.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3) {
  margin: 18px 0 8px;
}
</style>
