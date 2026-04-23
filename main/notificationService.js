const path = require('path');
const { Notification } = require('electron');

function createNotificationService(dispatch) {
  function showBreakNotification(state) {
    if (!Notification.isSupported()) {
      dispatch({ type: 'OPEN_BREAK_WINDOW' });
      return false;
    }

    const notification = new Notification({
      title: '该休息一下了',
      body: `已活跃 ${formatMinutes(state.accumulatedMs)} 分钟，站起来动一动。`,
      icon: path.join(__dirname, '..', 'favicon.png'),
      silent: false
    });

    notification.on('click', () => {
      dispatch({ type: 'NOTIFICATION_CLICKED' });
    });

    notification.show();
    dispatch({ type: 'NOTIFICATION_SENT' });
    return true;
  }

  return {
    showBreakNotification
  };
}

function formatMinutes(ms) {
  return Math.max(1, Math.round(ms / 60000));
}

module.exports = {
  createNotificationService
};
