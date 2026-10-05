// Docker Hub API とレジストリ (wslc login / logout)
const wslc = require('../services/wslc.cjs');
const hub = require('../services/hub.cjs');
const settings = require('../services/settings.cjs');

function credentials() {
  const s = settings.load();
  const token = settings.getSecret('hubToken');
  if (!s.hubUsername || !token) throw new Error('Docker Hub のユーザー名とトークンを設定してください');
  return { username: s.hubUsername, token };
}

module.exports = function registerHub({ handle }) {
  handle('hub:search', (q, page) => hub.search(q, page));
  handle('hub:tags', (repo, page) => hub.tags(repo, page));
  handle('hub:repo', (repo) => hub.repo(repo));
  handle('hub:myRepos', () => hub.myRepos(settings.load().hubUsername));
  handle('hub:login', async () => {
    const { username, token } = credentials();
    await hub.login(username, token);
    return true;
  });
  handle('hub:status', () => ({ loggedIn: hub.isLoggedIn() }));

  // トークンは stdin で渡しコマンドラインに残さない
  handle('registry:login', async (server) => {
    const { username, token } = credentials();
    const args = ['login', '-u', username, '--password-stdin'];
    if (server) args.push(server);
    const r = await wslc.run(args, { input: token, timeout: 60000 });
    if (r.code !== 0) throw new Error(r.stderr || r.stdout);
    return r.stdout || 'ログインしました';
  });
  handle('registry:logout', async (server) => {
    const r = await wslc.run(server ? ['logout', server] : ['logout']);
    hub.logout();
    return r.stdout;
  });
};
