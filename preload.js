const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getReminderState: () => ipcRenderer.invoke('get-reminder-state'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateReminderSettings: (settings) => ipcRenderer.invoke('update-reminder-settings', settings),
  startTracking: () => ipcRenderer.invoke('start-tracking'),
  pauseTracking: () => ipcRenderer.invoke('pause-tracking'),
  stopTracking: () => ipcRenderer.invoke('stop-tracking'),
  startBreak: () => ipcRenderer.invoke('start-break'),
  snooze: (minutes) => ipcRenderer.invoke('snooze', minutes),
  skipOnce: () => ipcRenderer.invoke('skip-once'),
  resetToday: () => ipcRenderer.invoke('reset-today'),

  subscribeReminderState: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on('reminder-state', listener);
    return () => ipcRenderer.removeListener('reminder-state', listener);
  },

  startReminder: (intervalMinutes) => ipcRenderer.send('start-reminder', intervalMinutes),
  stopReminder: () => ipcRenderer.send('stop-reminder'),
  updateSettings: (settings) => ipcRenderer.send('update-settings', settings),
  showWindow: () => ipcRenderer.send('show-window'),

  requestTypingModeEnable: () => ipcRenderer.invoke('request-typing-mode-enable'),
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
