// Docker Hub API クライアント (メインプロセスで実行するので CORS の制約を受けない)
const BASE = 'https://hub.docker.com/v2';
let jwt = null;

async function request(url, { auth = false, method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (auth && jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      msg = j.detail || j.message || msg;
    } catch { /* ignore */ }
    throw new Error(`Docker Hub: ${msg}`);
  }
  return res.json();
}

function splitRepo(repo) {
  const parts = repo.split('/');
  return parts.length === 1 ? ['library', parts[0]] : [parts[0], parts.slice(1).join('/')];
}

async function search(query, page = 1, pageSize = 30) {
  const q = encodeURIComponent(query);
  const j = await request(`${BASE}/search/repositories/?query=${q}&page=${page}&page_size=${pageSize}`);
  return {
    count: j.count || 0,
    results: (j.results || []).map((r) => ({
      name: r.repo_name,
      description: r.short_description || '',
      stars: r.star_count || 0,
      pulls: r.pull_count || 0,
      official: !!r.is_official,
      automated: !!r.is_automated,
    })),
  };
}

async function tags(repoName, page = 1) {
  const [ns, name] = splitRepo(repoName);
  const j = await request(
    `${BASE}/namespaces/${ns}/repositories/${name}/tags?page=${page}&page_size=50&ordering=last_updated`,
    { auth: true },
  );
  return {
    count: j.count || 0,
    next: !!j.next,
    results: (j.results || []).map((t) => ({
      name: t.name,
      size: t.full_size || 0,
      updated: t.last_updated,
      archs: [...new Set((t.images || []).filter((i) => i.os !== 'unknown').map((i) => [i.os, i.architecture, i.variant].filter(Boolean).join('/')))],
    })),
  };
}

async function repo(repoName) {
  const [ns, name] = splitRepo(repoName);
  const j = await request(`${BASE}/repositories/${ns}/${name}/`, { auth: true });
  return {
    name: repoName,
    description: j.description || '',
    fullDescription: j.full_description || '',
    stars: j.star_count || 0,
    pulls: j.pull_count || 0,
    updated: j.last_updated,
    isPrivate: !!j.is_private,
  };
}

async function login(username, token) {
  const j = await request(`${BASE}/users/login`, { method: 'POST', body: { username, password: token } });
  jwt = j.token;
  return true;
}

function logout() {
  jwt = null;
}

async function myRepos(username) {
  const j = await request(`${BASE}/repositories/${encodeURIComponent(username)}/?page_size=100`, { auth: true });
  return (j.results || []).map((r) => ({
    name: `${r.namespace}/${r.name}`,
    description: r.description || '',
    stars: r.star_count || 0,
    pulls: r.pull_count || 0,
    isPrivate: !!r.is_private,
    official: false,
  }));
}

module.exports = { search, tags, repo, login, logout, myRepos, isLoggedIn: () => !!jwt };
