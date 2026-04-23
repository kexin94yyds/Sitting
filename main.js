const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { createInitialState, normalizeSettings, reduce } = require('./main/reminderState');
const { createPowerMonitorSource } = require('./main/activitySources/powerMonitorSource');
const { createUiohookSource } = require('./main/activitySources/uiohookSource');
const { createNotificationService } = require('./main/notificationService');
const { createRestWindowService } = require('./main/restWindow');
const { getAccessibilityStatus, requestAccessibilityPermission } = require('./main/permissionService');

const store = new Store();
const SETTINGS_KEY = 'reminderSettingsV2';
const RUNTIME_KEY = 'reminderRuntimeV2';

let mainWindow = null;
let tray = null;
let state = createInitialState(loadSettings());
let powerMonitorSource = null;
let notificationService = null;
let restWindowService = null;
let typingHookSource = null;
let tickTimer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'favicon.png'),
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('show', () => {
    mainWindow.focus();
    sendStateToWindow(mainWindow);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    sendStateToWindow(mainWindow);
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'favicon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip('久坐提醒');
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      showWindow();
    }
  });

  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;

  const isTracking = state.phase !== 'idle' && state.phase !== 'paused';
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isTracking ? '暂停提醒' : '开始提醒',
      click: () => {
        dispatch({ type: isTracking ? 'PAUSE_TRACKING' : 'START_TRACKING' });
      }
    },
    {
      label: '设置',
      click: () => showWindow()
    },
    {
      label: '开始休息',
      enabled: isTracking,
      click: () => dispatch({ type: 'START_BREAK' })
    },
    {
      label: '稍后 5 分钟',
      enabled: isTracking,
      click: () => dispatch({ type: 'SNOOZE' })
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function showWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function startRuntime() {
  notificationService = createNotificationService(dispatch);
  restWindowService = createRestWindowService(dispatch);
  powerMonitorSource = createPowerMonitorSource(powerMonitor, dispatch, () => state.settings);
  powerMonitorSource.start();

  hydrateRuntimeState();
  if (state.mode === 'typing') {
    startTypingHook();
  }

  tickTimer = setInterval(runTick, 1000);
  runTick();
}

function stopRuntime() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  stopTypingHook();
  powerMonitorSource?.stop();
  restWindowService?.destroy();
}

function runTick() {
  const snapshot = powerMonitorSource.getSnapshot();
  dispatch({ type: 'ACTIVITY_SNAPSHOT', ...snapshot });
  dispatch({ type: 'TICK', systemActive: snapshot.systemActive });
}

function dispatch(event) {
  const previousState = state;
  state = reduce(state, event);

  persistState();
  try {
    runEffects(previousState, state, event);
  } catch (error) {
    console.error('Reminder side effect failed:', error);
  } finally {
    broadcastState();
    updateTrayMenu();
  }
}

function runEffects(previousState, nextState) {
  if (previousState.mode === 'typing' && nextState.mode !== 'typing') {
    stopTypingHook();
  }

  if (nextState.phase === 'notifying' && nextState.lastNotificationAt === 0) {
    notificationService.showBreakNotification(nextState);
    return;
  }

  if (nextState.phase === 'break-window') {
    restWindowService.show(mainWindow, nextState);
    return;
  }

  if (previousState.phase === 'break-window' && nextState.phase !== 'break-window') {
    restWindowService.hide();
  }
}

function broadcastState() {
  const payload = getPublicState();
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('reminder-state', payload);
    }
  });

  if (state.phase === 'tracking') {
    mainWindow?.webContents.send('reminder-started', getThresholdMinutes());
  }

  if (state.phase === 'idle' || state.phase === 'paused') {
    mainWindow?.webContents.send('reminder-stopped');
  }
}

function sendStateToWindow(window) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send('reminder-state', getPublicState());
}

function getPublicState() {
  return {
    ...state,
    remainingMs: Math.max(0, state.settings.thresholdMs - state.accumulatedMs)
  };
}

function loadSettings() {
  const saved = store.get(SETTINGS_KEY);
  if (saved) {
    return normalizeSettings(saved);
  }

  return normalizeSettings({
    thresholdMs: store.get('reminderInterval', 45) * 60 * 1000,
    breakMs: store.get('breakMinutes', 5) * 60 * 1000,
    snoozeMs: 5 * 60 * 1000
  });
}

function hydrateRuntimeState() {
  const saved = store.get(RUNTIME_KEY);
  if (saved) {
    dispatch({
      type: 'HYDRATE',
      state: {
        ...saved,
        lastTickAt: Date.now(),
        flags: {
          locked: false,
          suspended: false,
          systemActive: false
        }
      }
    });
    return;
  }

  if (store.get('isRunning', false)) {
    dispatch({ type: 'START_TRACKING' });
  }
}

function persistState() {
  store.set(SETTINGS_KEY, { ...state.settings, mode: state.mode });
  store.set('reminderInterval', getThresholdMinutes());
  store.set('isRunning', state.phase !== 'idle' && state.phase !== 'paused');
  store.set(RUNTIME_KEY, {
    phase: state.phase,
    mode: state.mode,
    accumulatedMs: state.accumulatedMs,
    lastTickAt: Date.now(),
    snoozeUntil: state.snoozeUntil,
    cooldownUntil: state.cooldownUntil,
    lastNotificationAt: state.lastNotificationAt,
    typing: state.typing,
    settings: state.settings
  });
}

function getThresholdMinutes() {
  return Math.max(1, Math.round(state.settings.thresholdMs / 60000));
}

function toSettingsPatch(settings = {}) {
  const patch = {};
  if (settings.reminderInterval !== undefined) {
    patch.thresholdMs = Number(settings.reminderInterval) * 60 * 1000;
  }
  if (settings.thresholdMinutes !== undefined) {
    patch.thresholdMs = Number(settings.thresholdMinutes) * 60 * 1000;
  }
  if (settings.thresholdMs !== undefined) {
    patch.thresholdMs = Number(settings.thresholdMs);
  }
  if (settings.breakMinutes !== undefined) {
    patch.breakMs = Number(settings.breakMinutes) * 60 * 1000;
  }
  if (settings.breakMs !== undefined) {
    patch.breakMs = Number(settings.breakMs);
  }
  if (settings.snoozeMinutes !== undefined) {
    patch.snoozeMs = Number(settings.snoozeMinutes) * 60 * 1000;
  }
  if (settings.snoozeMs !== undefined) {
    patch.snoozeMs = Number(settings.snoozeMs);
  }
  if (settings.idleThresholdSec !== undefined) {
    patch.idleThresholdSec = Number(settings.idleThresholdSec);
  }
  if (settings.notificationGraceMs !== undefined) {
    patch.notificationGraceMs = Number(settings.notificationGraceMs);
  }
  if (settings.typingGapMinutes !== undefined) {
    patch.typingGapMs = Number(settings.typingGapMinutes) * 60 * 1000;
  }
  if (settings.typingGapMs !== undefined) {
    patch.typingGapMs = Number(settings.typingGapMs);
  }
  if (settings.mode === 'typing' || settings.mode === 'system-active') {
    patch.mode = settings.mode;
  }
  return patch;
}

function startTypingHook() {
  if (state.mode !== 'typing') {
    return { ok: false, status: 'disabled', error: 'typing mode is not active' };
  }

  const permissionStatus = getAccessibilityStatus();
  dispatch({ type: 'PERMISSION_STATUS', status: permissionStatus });

  if (process.platform === 'darwin' && permissionStatus !== 'authorized') {
    dispatch({ type: 'HOOK_STATUS', status: 'permission-blocked', error: 'Accessibility permission is required' });
    return { ok: false, status: 'permission-blocked', error: 'Accessibility permission is required' };
  }

  if (!typingHookSource) {
    typingHookSource = createUiohookSource((eventTime) => {
      dispatch({ type: 'KEY_ACTIVITY' }, eventTime);
    });
  }

  const result = typingHookSource.start();
  dispatch({ type: 'HOOK_STATUS', status: result.status, error: result.error });
  return result;
}

function stopTypingHook() {
  if (!typingHookSource) {
    dispatch({ type: 'HOOK_STATUS', status: 'disabled' });
    return;
  }

  const result = typingHookSource.stop();
  dispatch({ type: 'HOOK_STATUS', status: result.status, error: result.error });
}

function enableTypingMode(promptForPermission) {
  const permissionStatus = promptForPermission ? requestAccessibilityPermission() : getAccessibilityStatus();
  dispatch({ type: 'PERMISSION_STATUS', status: permissionStatus });
  dispatch({ type: 'UPDATE_SETTINGS', settings: { mode: 'typing' } });
  const hookResult = startTypingHook();
  return {
    state: getPublicState(),
    hookResult
  };
}

function registerIpc() {
  ipcMain.handle('get-settings', () => ({
    reminderInterval: getThresholdMinutes(),
    isRunning: state.phase !== 'idle' && state.phase !== 'paused',
    repeatEnabled: false,
    state: getPublicState()
  }));

  ipcMain.handle('get-reminder-state', () => getPublicState());

  ipcMain.handle('update-reminder-settings', (event, settings) => {
    dispatch({ type: 'UPDATE_SETTINGS', settings: toSettingsPatch(settings) });
    if (settings?.mode === 'typing') {
      return enableTypingMode(false).state;
    }
    if (settings?.mode === 'system-active') {
      stopTypingHook();
    }
    return getPublicState();
  });

  ipcMain.handle('request-typing-mode-enable', () => {
    return enableTypingMode(true);
  });

  ipcMain.handle('start-tracking', () => {
    dispatch({ type: 'START_TRACKING' });
    return getPublicState();
  });

  ipcMain.handle('pause-tracking', () => {
    dispatch({ type: 'PAUSE_TRACKING' });
    return getPublicState();
  });

  ipcMain.handle('stop-tracking', () => {
    dispatch({ type: 'STOP_TRACKING' });
    return getPublicState();
  });

  ipcMain.handle('start-break', () => {
    dispatch({ type: 'START_BREAK' });
    return getPublicState();
  });

  ipcMain.handle('snooze', (event, minutes) => {
    const ms = Number(minutes) > 0 ? Number(minutes) * 60 * 1000 : state.settings.snoozeMs;
    dispatch({ type: 'SNOOZE', ms });
    return getPublicState();
  });

  ipcMain.handle('skip-once', () => {
    dispatch({ type: 'SKIP_ONCE' });
    return getPublicState();
  });

  ipcMain.on('start-reminder', (event, intervalMinutes) => {
    dispatch({ type: 'UPDATE_SETTINGS', settings: toSettingsPatch({ reminderInterval: intervalMinutes }) });
    dispatch({ type: 'START_TRACKING' });
  });

  ipcMain.on('stop-reminder', () => {
    dispatch({ type: 'PAUSE_TRACKING' });
  });

  ipcMain.on('update-settings', (event, settings) => {
    dispatch({ type: 'UPDATE_SETTINGS', settings: toSettingsPatch(settings) });
  });

  ipcMain.on('show-window', () => {
    showWindow();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerIpc();
  startRuntime();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopRuntime();
});
