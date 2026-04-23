const path = require('path');
const { BrowserWindow } = require('electron');

function createRestWindowService(dispatch) {
  let restWindow = null;

  function show(parentWindow, state) {
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
        dispatch({ type: 'SNOOZE' });
      });

      restWindow.loadFile(path.join(__dirname, '..', 'rest.html'));
    }

    restWindow.once('ready-to-show', () => {
      sendState(state);
      restWindow.show();
      restWindow.setAlwaysOnTop(true, 'floating');
      restWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    });

    if (restWindow.webContents.isLoading()) {
      return;
    }

    sendState(state);
    restWindow.show();
    restWindow.setAlwaysOnTop(true, 'floating');
    restWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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
      restWindow.destroy();
    }
    restWindow = null;
  }

  return {
    show,
    hide,
    sendState,
    destroy
  };
}

function sanitizeState(state) {
  return JSON.parse(JSON.stringify(state));
}

module.exports = {
  createRestWindowService
};
