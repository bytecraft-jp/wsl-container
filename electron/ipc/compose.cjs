// Compose の操作。長い処理はジョブとして進行状況をストリームで送る
const compose = require('../compose/engine.cjs');

module.exports = function registerCompose({ handle, send }) {
  const composeJob = (fn) => async (jobId, ...args) => {
    const log = (d) => send('stream:data', jobId, d);
    try {
      await fn(log, ...args);
      send('stream:exit', jobId, 0);
    } catch (e) {
      log(`❌ ${e.message}\n`);
      send('stream:exit', jobId, 1);
      throw e;
    }
  };
  handle('compose:up', composeJob((log, file, opts) => compose.up(file, opts || {}, log)));
  handle('compose:down', composeJob((log, file, opts) => compose.down(file, opts || {}, log)));
  handle('compose:simple', composeJob((log, file, action, services) => {
    if (!['start', 'stop', 'restart', 'kill'].includes(action)) throw new Error('invalid action');
    return compose.simple(file, action, services, log);
  }));
  handle('compose:pull', composeJob((log, file, services) => compose.pull(file, services, log)));
  handle('compose:build', composeJob((log, file, services) => compose.build(file, services, log)));
  handle('compose:ps', (file) => compose.ps(file));
  handle('compose:validate', (text, file) => compose.validate(text, file));
};
