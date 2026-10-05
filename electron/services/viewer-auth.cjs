function kasmContainer(c) {
  const labels = c.Config?.Labels || c.Labels;
  return /^(?:docker\.io\/)?kasmweb\/chrome[:@]/.test(c.Config?.Image || c.Image || '')
    || (typeof labels === 'string' ? /(?:^|,)wcs\.gui\.auth=kasm(?:,|$)/.test(labels) : labels?.['wcs.gui.auth'] === 'kasm');
}

/** Kasm の認証情報は、表示先ポートを公開するコンテナーからだけ取得する。 */
async function resolveViewerAuth(viewerUrl, details, authInfo, wslc) {
  const viewer = new URL(viewerUrl);
  const request = new URL(details.url);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'];
  if (viewer.protocol !== 'https:' || !loopback.includes(viewer.hostname)
    || request.origin !== viewer.origin || authInfo.isProxy
    || !['basic', 'digest'].includes(authInfo.scheme?.toLowerCase())
    || authInfo.host !== viewer.hostname || String(authInfo.port) !== (viewer.port || '443')
    || details.firstAuthAttempt === false) return null;

  const listed = await wslc.run(['ps', '--format', 'json'], { timeout: 15000 });
  if (listed.code !== 0) return null;
  const candidates = wslc.parseJsonLines(listed.stdout)
    .filter(kasmContainer);
  for (const candidate of candidates) {
    const inspected = await wslc.run(['inspect', '--format', 'json', candidate.ID], { timeout: 15000 });
    if (inspected.code !== 0) continue;
    const c = wslc.parseJsonLines(inspected.stdout)[0];
    if (!c || !kasmContainer(c)) continue;
    const ports = c.Ports || c.NetworkSettings?.Ports || {};
    if (!(ports['6901/tcp'] || []).some((b) => String(b.HostPort) === viewer.port
      && ['127.0.0.1', '::1'].includes(b.HostIp))) continue;
    const password = c.Config.Env?.find((entry) => entry.startsWith('VNC_PW='))?.slice(7);
    if (password) return { username: 'kasm_user', password };
  }
  return null;
}

module.exports = { resolveViewerAuth };
