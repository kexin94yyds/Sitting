const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
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



