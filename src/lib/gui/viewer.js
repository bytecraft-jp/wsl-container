/** GUI コンテナーの画面 URL。開始ページは同じホスト内に限る */
export function guiViewerUrl(port, scheme = 'http', guiPath = '') {
  const base = new URL(`${scheme}://127.0.0.1:${port}/`);
  const url = new URL(guiPath || '/', base);
  if (url.origin !== base.origin) throw new Error('GUI の開始ページは同じホスト内のパスを指定してください');
  return url.href;
}
