import { invoke } from '../api.js';
import { runJob } from '../store.js';

/** プリセットを依存 (共通ベースなど) から順にビルドする。途中で失敗したら false */
export async function buildPreset(p) {
  const builds = await invoke('gui-presets:prepare-build', p.id);
  for (const build of builds) {
    if (!await runJob(`ビルド: ${build.title}`, ['build', '-t', build.image, '-f', await invoke('fs:join', build.directory, build.dockerfile), build.directory])) return false;
  }
  return true;
}
