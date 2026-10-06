import { invoke, wslc, wslcJson } from '../api.js';
import { runJob, openViewer, toast, bumpRefresh, loadGuiPresets } from '../store.js';
import { GUI_PRESETS } from './presets.js';
import { labelValue } from '../format.js';
import { buildRunArgs } from '../runArgs.js';
import { buildPreset } from './build.js';
import { presetForm, PRESET_LABEL, PRESET_HASH_LABEL } from './presetForm.js';

/**
 * プリセットを起動して開く。定義・Dockerfile (共通ベースを含む) が前回の作成時から変わっていなければ
 * 既存コンテナーを再利用し、変わっていればビルドし直してコンテナーを作り直す (設定ボリュームは残す)。
 * 失敗時は例外を投げる。ビルドが失敗した場合は false
 */
export async function launchPreset(listed) {
  // 画面の一覧は定義ファイルを編集した後も古いままのことがあるため、起動のたびに読み直す。
  // ハッシュ (最新のファイルから計算) と実行設定 (env など) を必ず同じ定義から作る
  await loadGuiPresets();
  const p = GUI_PRESETS.find((item) => item.id === listed.id);
  if (!p) throw new Error(`プリセット「${listed.id}」が見つかりません。定義ファイルのエラーを確認してください`);
  const name = p.containerName || `wcs-gui-${p.id}`;
  const hash = await invoke('gui-presets:hash', p.id);
  const existing = (await wslcJson(['list', '-a', '--format', 'json'])).find((c) => c.Names === name);
  if (existing) {
    const owner = labelValue(existing.Labels, PRESET_LABEL);
    if (owner ? owner !== p.id : existing.Image !== p.image) {
      throw new Error(`コンテナー「${name}」は別のプリセットまたはイメージで使用しています。containerName を変更して起動してください。`);
    }
    if (existing.Image === p.image && labelValue(existing.Labels, PRESET_HASH_LABEL) === hash) {
      if (existing.State !== 'running') await wslc(['start', name]);
      openViewer(p.hostPort, p.scheme, p.title, p.guiPath);
      return true;
    }
  }
  if (p.build && !await buildPreset(p)) return false;
  if (existing) {
    toast(`${p.title} の定義または Dockerfile が変更されたため、コンテナーを作り直します（設定ボリュームは保持します）。`, 'info', 6000);
    await wslc(['remove', '-f', name]);
  } else {
    toast(`${p.title} を準備しています。初回は数分かかります。`, 'info', 6000);
  }
  const ok = await runJob(`GUI 起動: ${p.title}`, buildRunArgs(presetForm(p, hash)));
  if (!ok) throw new Error(`${p.title} を起動できませんでした`);
  if (p.readyCommand) await wslc(['exec', name, ...p.readyCommand]);
  bumpRefresh();
  openViewer(p.hostPort, p.scheme, p.title, p.guiPath);
  return true;
}
