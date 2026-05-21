const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { createInitialState, normalizeSettings, reduce, deriveState, MS_PER_MINUTE } = require('./main/reminderState');
const { createRestWindowService } = require('./main/restWindow');

const store = new Store();
const SETTINGS_KEY = 'standingGoalSettingsV1';
const RUNTIME_KEY = 'standingGoalRuntimeV1';

let mainWindow = null;
let tray = null;
let state = createInitialState(loadSettings());
let restWindowService = null;
let tickTimer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 760,
    minWidth: 620,
    minHeight: 680,
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

  mainWindow.once('ready-to-show', () => {
    showWindow();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('show', () => {
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

  const publicState = getPublicState();
  const isRunning = publicState.phase === 'work' || publicState.phase === 'prompt' || publicState.phase === 'resting';
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isRunning ? '暂停提醒' : '开始提醒',
      click: () => dispatch({ type: isRunning ? 'PAUSE' : 'START' })
    },
    {
      label: '显示设置',
      click: () => showWindow()
    },
    {
      label: '开始休息',
      enabled: publicState.phase === 'prompt',
      click: () => dispatch({ type: 'START_REST' })
    },
    {
      label: '稍后提醒',
      enabled: publicState.phase === 'prompt' || publicState.phase === 'resting',
      click: () => dispatch({ type: 'SNOOZE' })
    },
    {
      label: '跳过本次',
      enabled: publicState.phase === 'prompt' || publicState.phase === 'resting',
      click: () => dispatch({ type: 'SKIP_ONCE' })
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
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  app.focus({ steal: true });
  mainWindow.moveTop();
  mainWindow.focus();
}

function startRuntime() {
  restWindowService = createRestWindowService(dispatch);
  hydrateRuntimeState();

  tickTimer = setInterval(runTick, 1000);
  runTick();
}

function stopRuntime() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  restWindowService?.destroy();
}

function runTick() {
  dispatch({ type: 'TICK', idleSec: powerMonitor.getSystemIdleTime() });
}

function dispatch(event) {
  const previousState = state;
  state = reduce(state, event);

  persistState();
  try {
    runEffects(deriveState(previousState), getPublicState(), event);
  } catch (error) {
    console.error('Reminder side effect failed:', error);
  } finally {
    broadcastState();
    updateTrayMenu();
  }
}

function runEffects(previousState, nextState) {
  const wasRestVisible = isRestVisiblePhase(previousState.phase);
  const isRestVisible = isRestVisiblePhase(nextState.phase);

  if (isRestVisible) {
    const didShow = restWindowService.show(mainWindow, nextState);
    if (didShow === false && nextState.phase === 'prompt') {
      showWindow();
    }
    return;
  }

  if (wasRestVisible && !isRestVisible) {
    restWindowService.hide();
  }
}

function isRestVisiblePhase(phase) {
  return phase === 'prompt' || phase === 'resting';
}

function broadcastState() {
  const payload = getPublicState();
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('reminder-state', payload);
    }
  });
}

function sendStateToWindow(window) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send('reminder-state', getPublicState());
}

function getPublicState() {
  return deriveState(state);
}

function loadSettings() {
  const saved = store.get(SETTINGS_KEY);
  if (saved) {
    return normalizeSettings(saved);
  }

  return normalizeSettings({
    intervalMs: store.get('reminderInterval', 45) * MS_PER_MINUTE,
    restBlockMs: store.get('breakMinutes', 5) * MS_PER_MINUTE,
    dailyGoalMs: 30 * MS_PER_MINUTE,
    snoozeMs: 5 * MS_PER_MINUTE,
    idleConfirmSec: 15
  });
}

function hydrateRuntimeState() {
  const saved = store.get(RUNTIME_KEY);
  if (saved) {
    dispatch({ type: 'HYDRATE', state: saved });
    return;
  }

  if (store.get('isRunning', false)) {
    dispatch({ type: 'START' });
  }
}

function persistState() {
  const publicState = getPublicState();
  store.set(SETTINGS_KEY, publicState.settings);
  store.set('reminderInterval', minutesFromMs(publicState.settings.intervalMs));
  store.set('breakMinutes', minutesFromMs(publicState.settings.restBlockMs));
  store.set('isRunning', publicState.phase === 'work' || publicState.phase === 'prompt' || publicState.phase === 'resting');
  store.set(RUNTIME_KEY, {
    phase: publicState.phase,
    settings: publicState.settings,
    todayKey: publicState.todayKey,
    todayRestMs: publicState.todayRestMs,
    workStartedAt: publicState.workStartedAt,
    nextReminderAt: publicState.nextReminderAt,
    pausedAt: publicState.pausedAt,
    rest: publicState.rest
  });
}

function toSettingsPatch(settings = {}) {
  const patch = {};
  if (settings.intervalMinutes !== undefined) {
    patch.intervalMs = Number(settings.intervalMinutes) * MS_PER_MINUTE;
  }
  if (settings.reminderInterval !== undefined) {
    patch.intervalMs = Number(settings.reminderInterval) * MS_PER_MINUTE;
  }
  if (settings.thresholdMinutes !== undefined) {
    patch.intervalMs = Number(settings.thresholdMinutes) * MS_PER_MINUTE;
  }
  if (settings.intervalMs !== undefined) {
    patch.intervalMs = Number(settings.intervalMs);
  }
  if (settings.restBlockMinutes !== undefined) {
    patch.restBlockMs = Number(settings.restBlockMinutes) * MS_PER_MINUTE;
  }
  if (settings.breakMinutes !== undefined) {
    patch.restBlockMs = Number(settings.breakMinutes) * MS_PER_MINUTE;
  }
  if (settings.restBlockMs !== undefined) {
    patch.restBlockMs = Number(settings.restBlockMs);
  }
  if (settings.dailyGoalMinutes !== undefined) {
    patch.dailyGoalMs = Number(settings.dailyGoalMinutes) * MS_PER_MINUTE;
  }
  if (settings.dailyGoalMs !== undefined) {
    patch.dailyGoalMs = Number(settings.dailyGoalMs);
  }
  if (settings.snoozeMinutes !== undefined) {
    patch.snoozeMs = Number(settings.snoozeMinutes) * MS_PER_MINUTE;
  }
  if (settings.snoozeMs !== undefined) {
    patch.snoozeMs = Number(settings.snoozeMs);
  }
  if (settings.idleConfirmSec !== undefined) {
    patch.idleConfirmSec = Number(settings.idleConfirmSec);
  }
  return patch;
}

function minutesFromMs(ms) {
  return Math.max(1, Math.round((Number(ms) || 0) / MS_PER_MINUTE));
}

function registerIpc() {
  ipcMain.handle('get-settings', () => {
    const publicState = getPublicState();
    return {
      intervalMinutes: minutesFromMs(publicState.settings.intervalMs),
      restBlockMinutes: minutesFromMs(publicState.settings.restBlockMs),
      dailyGoalMinutes: minutesFromMs(publicState.settings.dailyGoalMs),
      snoozeMinutes: minutesFromMs(publicState.settings.snoozeMs),
      idleConfirmSec: publicState.settings.idleConfirmSec,
      isRunning: publicState.phase === 'work' || publicState.phase === 'prompt' || publicState.phase === 'resting',
      state: publicState
    };
  });

  ipcMain.handle('get-reminder-state', () => getPublicState());

  ipcMain.handle('update-reminder-settings', (event, settings) => {
    dispatch({ type: 'UPDATE_SETTINGS', settings: toSettingsPatch(settings) });
    return getPublicState();
  });

  ipcMain.handle('start-tracking', () => {
    dispatch({ type: 'START' });
    return getPublicState();
  });

  ipcMain.handle('pause-tracking', () => {
    dispatch({ type: 'PAUSE' });
    return getPublicState();
  });

  ipcMain.handle('stop-tracking', () => {
    dispatch({ type: 'STOP' });
    return getPublicState();
  });

  ipcMain.handle('start-break', () => {
    dispatch({ type: 'START_REST', idleSec: powerMonitor.getSystemIdleTime() });
    return getPublicState();
  });

  ipcMain.handle('snooze', (event, minutes) => {
    const ms = Number(minutes) > 0 ? Number(minutes) * MS_PER_MINUTE : state.settings.snoozeMs;
    dispatch({ type: 'SNOOZE', ms });
    return getPublicState();
  });

  ipcMain.handle('skip-once', () => {
    dispatch({ type: 'SKIP_ONCE' });
    return getPublicState();
  });

  ipcMain.handle('reset-today', () => {
    dispatch({ type: 'RESET_TODAY' });
    return getPublicState();
  });

  ipcMain.handle('show-rest-window', () => {
    dispatch({ type: 'PROMPT_BREAK' });
    return getPublicState();
  });

  ipcMain.on('start-reminder', (event, intervalMinutes) => {
    dispatch({ type: 'UPDATE_SETTINGS', settings: toSettingsPatch({ intervalMinutes }) });
    dispatch({ type: 'START' });
  });

  ipcMain.on('stop-reminder', () => {
    dispatch({ type: 'PAUSE' });
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
