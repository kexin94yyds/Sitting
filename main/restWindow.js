const path = require('path');
const { app, BrowserWindow, screen } = require('electron');

function createRestWindowService(dispatch) {
  let restWindow = null;
  let isDestroying = false;
  let latestState = null;

  function show(parentWindow, state) {
    latestState = state;

    try {
      if (!restWindow || restWindow.isDestroyed()) {
        const bounds = getRestWindowBounds();
      restWindow = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        resizable: false,
        fullscreenable: false,
        minimizable: false,
        maximizable: false,
        focusable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
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

      restWindow.once('ready-to-show', () => {
        sendState(latestState);
        showNow();
      });

      restWindow.loadFile(path.join(__dirname, '..', 'rest.html')).catch((error) => {
        console.error('Rest window load failed:', error);
      });
    }

    if (restWindow.webContents.isLoading()) {
      return true;
    }

    sendState(state);
    showNow();
    return true;
    } catch (error) {
      console.error('Rest window show failed:', error);
      return false;
    }
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
    restWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    restWindow.setAlwaysOnTop(true, 'screen-saver');
    if (restWindow.isMinimized()) {
      restWindow.restore();
    }
    restWindow.center();
    restWindow.show();
    app.focus({ steal: true });
    restWindow.moveTop();
    restWindow.focus();
    restWindow.flashFrame(true);
    setTimeout(() => {
      if (restWindow && !restWindow.isDestroyed()) {
        restWindow.flashFrame(false);
      }
    }, 2500);
  }
}

function getRestWindowBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const windowWidth = Math.min(720, Math.max(560, Math.round(width * 0.48)));
  const windowHeight = Math.min(560, Math.max(420, Math.round(height * 0.62)));

  return {
    width: windowWidth,
    height: windowHeight,
    x: Math.round(x + (width - windowWidth) / 2),
    y: Math.round(y + (height - windowHeight) / 2)
  };
}

function sanitizeState(state) {
  return JSON.parse(JSON.stringify(state));
}

module.exports = {
  createRestWindowService
};
