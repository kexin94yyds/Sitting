const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');

// 初始化配置存储
const store = new Store();

let mainWindow = null;
let tray = null;
let reminderTimer = null;
let reminderInterval = null;
let isRunning = false;

// 创建主窗口
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
    show: false // 初始不显示，点击托盘时再显示
  });

  // 加载 HTML 文件
  mainWindow.loadFile('index.html');

  // 窗口关闭时隐藏而不是退出
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // 窗口显示时聚焦
  mainWindow.on('show', () => {
    mainWindow.focus();
  });
}

// 创建托盘图标
function createTray() {
  const iconPath = path.join(__dirname, 'favicon.png');
  const icon = nativeImage.createFromPath(iconPath);
  
  // 调整图标大小以适应托盘
  const resizedIcon = icon.resize({ width: 16, height: 16 });
  
  tray = new Tray(resizedIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isRunning ? '⏸ 暂停提醒' : '▶ 开始提醒',
      click: () => {
        if (isRunning) {
          stopReminder();
        } else {
          const interval = store.get('reminderInterval', 45);
          startReminder(interval);
        }
      }
    },
    {
      label: '⚙️ 设置',
      click: () => {
        showWindow();
      }
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

  tray.setToolTip('久坐提醒');
  tray.setContextMenu(contextMenu);
  
  // 点击托盘图标显示/隐藏窗口
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      showWindow();
    }
  });
}

// 显示窗口
function showWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

// 发送通知
function sendNotification(title, body) {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: title || '该休息啦',
      body: body || '站起来走动下，喝口水 👟',
      icon: path.join(__dirname, 'favicon.png'),
      urgency: 'normal'
    });
    
    notification.show();
    
    // 点击通知时显示窗口
    notification.on('click', () => {
      showWindow();
    });
  }
}

// 开始提醒
function startReminder(intervalMinutes) {
  stopReminder(); // 先停止现有的
  
  isRunning = true;
  store.set('reminderInterval', intervalMinutes);
  store.set('isRunning', true);
  
  const intervalMs = intervalMinutes * 60 * 1000;
  const repeatEnabled = store.get('repeatEnabled', false);
  
  // 发送第一次提醒的函数
  const sendFirstReminder = () => {
    sendNotification('该休息啦', '站起来走动下，喝口水 👟');
    
    // 如果启用了循环提醒，每5分钟提醒一次
    if (repeatEnabled) {
      reminderInterval = setInterval(() => {
        sendNotification('该休息啦', '站起来走动下，喝口水 👟');
      }, 5 * 60 * 1000); // 每5分钟
    } else {
      // 如果没有启用循环，停止提醒
      stopReminder();
    }
  };
  
  // 设置第一次提醒的定时器
  reminderTimer = setTimeout(sendFirstReminder, intervalMs);
  
  updateTrayMenu();
  
  // 通知渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reminder-started', intervalMinutes);
  }
}

// 停止提醒
function stopReminder() {
  if (reminderTimer) {
    clearTimeout(reminderTimer);
    reminderTimer = null;
  }
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
  
  isRunning = false;
  store.set('isRunning', false);
  updateTrayMenu();
  
  // 通知渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reminder-stopped');
  }
}

// 更新托盘菜单
function updateTrayMenu() {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isRunning ? '⏸ 暂停提醒' : '▶ 开始提醒',
      click: () => {
        if (isRunning) {
          stopReminder();
        } else {
          const interval = store.get('reminderInterval', 45);
          startReminder(interval);
        }
      }
    },
    {
      label: '⚙️ 设置',
      click: () => {
        showWindow();
      }
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

// IPC 处理
ipcMain.handle('get-settings', () => {
  return {
    reminderInterval: store.get('reminderInterval', 45),
    isRunning: store.get('isRunning', false),
    repeatEnabled: store.get('repeatEnabled', false)
  };
});

ipcMain.on('start-reminder', (event, intervalMinutes) => {
  startReminder(intervalMinutes);
});

ipcMain.on('stop-reminder', () => {
  stopReminder();
});

ipcMain.on('update-settings', (event, settings) => {
  if (settings.reminderInterval !== undefined) {
    store.set('reminderInterval', settings.reminderInterval);
  }
  if (settings.repeatEnabled !== undefined) {
    store.set('repeatEnabled', settings.repeatEnabled);
  }
});

ipcMain.on('show-window', () => {
  showWindow();
});

// 应用准备就绪
app.whenReady().then(() => {
  createWindow();
  createTray();
  
  // 恢复之前的状态
  const wasRunning = store.get('isRunning', false);
  if (wasRunning) {
    const interval = store.get('reminderInterval', 45);
    startReminder(interval);
  }
  
  // macOS 特殊处理
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showWindow();
    }
  });
});

// 所有窗口关闭时
app.on('window-all-closed', () => {
  // macOS 上通常应用会继续运行
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  app.isQuitting = true;
  stopReminder();
});


