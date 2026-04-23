const path = require('path');
const { BrowserWindow } = require('electron');

function createRestWindowService(dispatch) {
  let restWindow = null;
  let isDestroying = false;
  let latestState = null;

  function show(parentWindow, state) {
    latestState = state;

    if (!restWindow || restWindow.isDestroyed()) {
      restWindow = new BrowserWindow({
        width: 420,
        height: 300,
        resizable: false,
        fullscreenable: false,
        minimizable: false,
        maximizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        parent: parentWindow || undefined,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, '..', 'preload.js')
        },
        title: '该休息一下了',
        icon: path.join(__dirname, '..', 'favicon.png')
      });

      restWindow.on('closed', () => {
        restWindow = null;
      });

      restWindow.on('close', () => {
        if (!isDestroying) {
          dispatch({ type: 'SNOOZE' });
        }
      });

      restWindow.webContents.on('did-finish-load', () => {
        sendState(latestState);
        showNow();
      });

      restWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Rest window failed to load:', errorCode, errorDescription);
      });

      restWindow.loadFile(path.join(__dirname, '..', 'rest.html')).catch((error) => {
        console.error('Rest window load failed:', error);
      });
    }

    restWindow.once('ready-to-show', () => {
      sendState(state);
      showNow();
    });

    if (restWindow.webContents.isLoading()) {
      return;
    }

    sendState(state);
    showNow();
  }

  function hide() {
    if (restWindow && !restWindow.isDestroyed()) {
      restWindow.hide();
    }
  }

  function sendState(state) {
    if (restWindow && !restWindow.isDestroyed()) {
      restWindow.webContents.send('reminder-state', sanitizeState(state));
    }
  }

  function destroy() {
    if (restWindow && !restWindow.isDestroyed()) {
      isDestroying = true;
      restWindow.destroy();
    }
    isDestroying = false;
    restWindow = null;
  }

  return {
    show,
    hide,
    sendState,
    destroy
  };

  function showNow() {
    if (!restWindow || restWindow.isDestroyed()) return;
    restWindow.show();
    restWindow.focus();
    restWindow.setAlwaysOnTop(true, 'floating');
    restWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
}

function sanitizeState(state) {
  return JSON.parse(JSON.stringify(state));
}

module.exports = {
  createRestWindowService
};
