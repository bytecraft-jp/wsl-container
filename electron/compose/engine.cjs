// 自前の compose エンジン。compose-core で組み立てた計画を wslc で実行する
const fs = require('node:fs');
const path = require('node:path');
const wslc = require('../services/wslc.cjs');
const core = require('./core.cjs');

function readContext(file) {
  const text = fs.readFileSync(file, 'utf8');
  let env = { ...process.env };
  const envFile = path.join(path.dirname(file), '.env');
  if (fs.existsSync(envFile)) env = { ...env, ...core.parseDotEnv(fs.readFileSync(envFile, 'utf8')) };
  const ctx = core.load(text, { file, env });
  ctx.file = file;
  return ctx;
}

async function must(args, log, opts) {
  log(`$ wslc ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}\n`);
  const r = await wslc.run(args, opts);
  if (r.stdout.trim()) log(r.stdout.endsWith('\n') ? r.stdout : `${r.stdout}\n`);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || `exit ${r.code}`).trim());
  if (r.stderr.trim()) log(r.stderr);
  return r;
}

function streamed(args, log, opts = {}) {
  log(`$ wslc ${args.join(' ')}\n`);
  return new Promise((resolve, reject) => {
    wslc.stream(args, {
      cwd: opts.cwd,
      onData: log,
      onExit: (code) => (code === 0 ? resolve() : reject(new Error(`wslc ${args[0]} が終了コード ${code} で失敗しました`))),
    });
  });
}

async function names(kind) {
  const r = await wslc.run([kind, 'list', '--format', 'json']);
  return new Set(wslc.parseJsonLines(r.stdout).map((x) => x.Name));
}

async function inspectMany(ids) {
  if (!ids.length) return [];
  const r = await wslc.run(['inspect', ...ids]);
  try {
    return JSON.parse(r.stdout);
  } catch {
    return [];
  }
}

async function imageExists(image) {
  const r = await wslc.run(['inspect', '--type', 'image', image]);
  return r.code === 0;
}

/** プロジェクトに属するコンテナー一覧 (inspect 結果) */
async function projectContainers(project) {
  const r = await wslc.run(['list', '-a', '--format', 'json']);
  const ids = wslc.parseJsonLines(r.stdout).map((c) => c.ID);
  const all = await inspectMany(ids);
  return all.filter((c) => (c.Config?.Labels || c.Labels || {})[core.LABEL_PROJECT] === project);
}

function labelsOf(c) {
  return c.Config?.Labels || c.Labels || {};
}

async function waitFor(containerName, condition, log, timeoutMs = 180000) {
  if (condition === 'service_started') return;
  const until = Date.now() + timeoutMs;
  log(`… ${containerName} の ${condition === 'service_healthy' ? '正常性' : '完了'}を待機しています\n`);
  while (Date.now() < until) {
    const [c] = await inspectMany([containerName]);
    const st = c?.State || {};
    if (condition === 'service_healthy' && st.Health?.Status === 'healthy') return;
    if (condition === 'service_healthy' && !st.Health && st.Running) return;
    if (condition === 'service_completed_successfully' && st.Running === false && st.Status !== 'created') {
      if (st.ExitCode === 0) return;
      throw new Error(`${containerName} が終了コード ${st.ExitCode} で終了しました`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${containerName} の待機がタイムアウトしました`);
}

async function up(file, opts = {}, log = () => {}) {
  const ctx = readContext(file);
  const { doc, project } = ctx;
  const order = core.orderServices(doc.services);
  const targets = new Set(core.withDependencies(doc.services, opts.services));
  const serviceNames = order.filter((n) => targets.has(n));
  log(`▶ プロジェクト "${project}" を起動します (${serviceNames.join(', ')})\n`);

  const existingNets = await names('network');
  for (const n of core.networksToCreate(ctx, serviceNames)) {
    if (existingNets.has(n.name)) continue;
    if (n.external) throw new Error(`外部ネットワーク "${n.name}" が存在しません`);
    await must(n.args, log);
  }
  const existingVols = await names('volume');
  for (const v of core.volumesToCreate(ctx, serviceNames)) {
    if (existingVols.has(v.name)) continue;
    if (v.external) throw new Error(`外部ボリューム "${v.name}" が存在しません`);
    await must(v.args, log);
  }

  const plans = Object.fromEntries(serviceNames.map((n) => [n, core.serviceRunPlan(ctx, n)]));
  for (const name of serviceNames) {
    const plan = plans[name];
    plan.warnings.forEach((w) => log(`⚠ ${w}\n`));

    for (const d of plan.depends) {
      if (plans[d.name]) await waitFor(plans[d.name].containerName, d.condition, log);
    }

    if (plan.build && (opts.build || !(await imageExists(plan.image)))) {
      await streamed(plan.build.args, log, { cwd: ctx.baseDir });
    } else if (!plan.build && (opts.pull || !(await imageExists(plan.image)))) {
      await streamed(['pull', plan.image], log);
    }

    const [existing] = await inspectMany([plan.containerName]);
    if (existing) {
      const same = labelsOf(existing)[core.LABEL_HASH] === plan.hash;
      if (same && !opts.forceRecreate) {
        if (existing.State?.Running) {
          log(`✔ ${plan.containerName} は最新です\n`);
        } else {
          await must(['start', plan.containerName], log);
        }
        continue;
      }
      log(`↻ ${plan.containerName} を再作成します\n`);
      await must(['remove', '-f', plan.containerName], log);
    }
    await must(plan.args, log);
    for (const n of plan.extraNetworks) {
      const a = ['network', 'connect'];
      n.aliases.forEach((al) => a.push('--network-alias', al));
      if (n.ip) a.push('--ip', n.ip);
      await must([...a, n.name, plan.containerName], log);
    }
    log(`✔ ${plan.containerName} を起動しました\n`);
  }

  if (!opts.services?.length) {
    const containers = await projectContainers(project);
    const known = new Set(serviceNames);
    for (const c of containers) {
      const svc = labelsOf(c)[core.LABEL_SERVICE];
      if (svc && !known.has(svc)) {
        const nm = (c.Name || '').replace(/^\//, '');
        if (opts.removeOrphans) await must(['remove', '-f', nm], log);
        else log(`⚠ 孤立したコンテナー ${nm} があります (サービス "${svc}" は定義にありません)\n`);
      }
    }
  }
  log(`✅ 完了しました\n`);
}

async function down(file, opts = {}, log = () => {}) {
  const ctx = readContext(file);
  const { project } = ctx;
  log(`■ プロジェクト "${project}" を停止・削除します\n`);
  const containers = await projectContainers(project);
  for (const c of containers) await must(['remove', '-f', (c.Name || '').replace(/^\//, '')], log);
  const allServices = Object.keys(ctx.doc.services);
  const existingNets = await names('network');
  for (const n of core.networksToCreate(ctx, allServices)) {
    if (!n.external && existingNets.has(n.name)) {
      await must(['network', 'remove', n.name], log).catch((e) => log(`⚠ ${e.message}\n`));
    }
  }
  if (opts.volumes) {
    const existingVols = await names('volume');
    for (const v of core.volumesToCreate(ctx, allServices)) {
      if (!v.external && existingVols.has(v.name)) await must(['volume', 'remove', v.name], log);
    }
  }
  if (opts.removeImages) {
    for (const s of allServices) {
      const img = ctx.doc.services[s].image || `${project}-${s}`;
      if (ctx.doc.services[s].build || opts.removeImages === 'all') {
        await must(['rmi', img], log).catch((e) => log(`⚠ ${e.message}\n`));
      }
    }
  }
  log(`✅ 完了しました\n`);
}

async function simple(file, action, services, log = () => {}) {
  const ctx = readContext(file);
  const containers = await projectContainers(ctx.project);
  const filtered = containers.filter((c) => !services?.length || services.includes(labelsOf(c)[core.LABEL_SERVICE]));
  const nm = filtered.map((c) => (c.Name || '').replace(/^\//, ''));
  if (!nm.length) {
    log('対象のコンテナーがありません\n');
    return;
  }
  await must([action, ...nm], log);
}

async function pull(file, services, log = () => {}) {
  const ctx = readContext(file);
  for (const [name, svc] of Object.entries(ctx.doc.services)) {
    if (services?.length && !services.includes(name)) continue;
    if (svc.image && !svc.build) await streamed(['pull', svc.image], log);
  }
  log(`✅ 完了しました\n`);
}

async function build(file, services, log = () => {}) {
  const ctx = readContext(file);
  for (const name of Object.keys(ctx.doc.services)) {
    if (services?.length && !services.includes(name)) continue;
    const plan = core.serviceRunPlan(ctx, name);
    if (plan.build) await streamed(plan.build.args, log, { cwd: ctx.baseDir });
  }
  log(`✅ 完了しました\n`);
}

async function ps(file) {
  const ctx = readContext(file);
  const containers = await projectContainers(ctx.project);
  return {
    project: ctx.project,
    services: Object.keys(ctx.doc.services),
    containers: containers.map((c) => ({
      id: (c.Id || '').slice(0, 12),
      name: (c.Name || '').replace(/^\//, ''),
      service: labelsOf(c)[core.LABEL_SERVICE],
      running: !!c.State?.Running,
      status: c.State?.Status || (c.State?.Running ? 'running' : 'exited'),
      health: c.State?.Health?.Status || '',
      ports: Object.entries(c.Ports || c.NetworkSettings?.Ports || {}).flatMap(([k, v]) =>
        (v || []).map((b) => `${b.HostIp || '0.0.0.0'}:${b.HostPort}->${k}`),
      ),
    })),
  };
}

/** 検証のみ (起動はしない) */
function validate(text, file) {
  const env = { ...process.env };
  const envFile = file ? path.join(path.dirname(file), '.env') : null;
  if (envFile && fs.existsSync(envFile)) Object.assign(env, core.parseDotEnv(fs.readFileSync(envFile, 'utf8')));
  const ctx = core.load(text, { file, env });
  ctx.file = file;
  const order = core.orderServices(ctx.doc.services);
  const plans = order.map((n) => core.serviceRunPlan(ctx, n));
  return {
    project: ctx.project,
    order,
    warnings: plans.flatMap((p) => p.warnings),
    commands: plans.map((p) => ({ service: p.name, build: p.build?.args || null, run: p.args })),
  };
}

module.exports = { up, down, simple, pull, build, ps, validate };
