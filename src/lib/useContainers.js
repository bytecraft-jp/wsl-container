// コンテナー一覧と統計の定期取得 (複数画面で共用)
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { wslcJson } from './api.js';
import { state } from './store.js';

export function useContainers({ stats = true } = {}) {
  const containers = ref([]);
  const statsMap = ref({});
  const loading = ref(false);
  const error = ref('');
  let timer = null;
  let statsBusy = false;
  let alive = true;

  async function refresh() {
    loading.value = true;
    try {
      containers.value = await wslcJson(['list', '-a', '--no-trunc', '--format', 'json']);
      error.value = '';
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
    if (stats) refreshStats();
  }

  async function refreshStats() {
    if (statsBusy || !containers.value.some((c) => c.State === 'running')) {
      if (!containers.value.some((c) => c.State === 'running')) statsMap.value = {};
      return;
    }
    statsBusy = true;
    try {
      const list = await wslcJson(['stats', '--no-trunc', '--format', 'json']);
      const m = {};
      list.forEach((s) => {
        m[s.ID] = s;
        m[s.ID.slice(0, 12)] = s;
        if (s.Name) m[s.Name] = s;
      });
      statsMap.value = m;
    } catch {
      /* 統計は取得できなくても無視 */
    } finally {
      statsBusy = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (!alive) return;
    timer = setTimeout(async () => {
      if (document.visibilityState === 'visible') await refresh();
      schedule();
    }, state.settings.pollInterval || 3000);
  }

  watch(() => state.refreshTick, refresh);
  onMounted(async () => {
    await refresh();
    schedule();
  });
  onBeforeUnmount(() => {
    alive = false;
    clearTimeout(timer);
  });

  return { containers, statsMap, loading, error, refresh };
}
