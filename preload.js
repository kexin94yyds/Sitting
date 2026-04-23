const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 新状态机 API
  getReminderState: () => ipcRenderer.invoke('get-reminder-state'),

  subscribeReminderState: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on('reminder-state', listener);
    return () => ipcRenderer.removeListener('reminder-state', listener);
  },

  updateReminderSettings: (settings) => ipcRenderer.invoke('update-reminder-settings', settings),

  requestTypingModeEnable: () => ipcRenderer.invoke('request-typing-mode-enable'),

  startTracking: () => ipcRenderer.invoke('start-tracking'),

  pauseTracking: () => ipcRenderer.invoke('pause-tracking'),

  stopTracking: () => ipcRenderer.invoke('stop-tracking'),

  startBreak: () => ipcRenderer.invoke('start-break'),

  snooze: (minutes) => ipcRenderer.invoke('snooze', minutes),

  skipOnce: () => ipcRenderer.invoke('skip-once'),

  // 获取设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  
  // 开始提醒
  startReminder: (intervalMinutes) => ipcRenderer.send('start-reminder', intervalMinutes),
  
  // 停止提醒
  stopReminder: () => ipcRenderer.send('stop-reminder'),
  
  // 更新设置
  updateSettings: (settings) => ipcRenderer.send('update-settings', settings),
  
  // 显示窗口
  showWindow: () => ipcRenderer.send('show-window'),
  
  // 监听提醒状态变化
  onReminderStarted: (callback) => {
    ipcRenderer.on('reminder-started', (event, intervalMinutes) => {
      callback(intervalMinutes);
    });
  },
  
  onReminderStopped: (callback) => {
    ipcRenderer.on('reminder-stopped', () => {
      callback();
    });
  },
  
  // 移除监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

