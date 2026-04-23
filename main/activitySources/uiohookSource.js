function createUiohookSource(onActivity) {
  let uIOhook = null;
  let isRunning = false;
  let listener = null;

  function start() {
    if (isRunning) {
      return { ok: true, status: 'running' };
    }

    try {
      ({ uIOhook } = require('uiohook-napi'));
    } catch (error) {
      return {
        ok: false,
        status: 'unavailable',
        error: 'uiohook-napi is not installed'
      };
    }

    try {
      listener = () => onActivity(Date.now());
      uIOhook.on('keydown', listener);
      uIOhook.start();
      isRunning = true;
      return { ok: true, status: 'running' };
    } catch (error) {
      cleanupListener();
      return {
        ok: false,
        status: 'failed',
        error: error.message || String(error)
      };
    }
  }

  function stop() {
    cleanupListener();
    if (uIOhook && isRunning) {
      try {
        uIOhook.stop();
      } catch (error) {
        return { ok: false, status: 'failed', error: error.message || String(error) };
      }
    }
    isRunning = false;
    return { ok: true, status: 'disabled' };
  }

  function cleanupListener() {
    if (uIOhook && listener) {
      try {
        uIOhook.off('keydown', listener);
      } catch {}
    }
    listener = null;
  }

  return {
    start,
    stop,
    isRunning: () => isRunning
  };
}

module.exports = {
  createUiohookSource
};
