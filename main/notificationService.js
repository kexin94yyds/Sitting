const path = require('path');
const { Notification } = require('electron');

function createNotificationService(dispatch) {
  function showBreakNotification(state) {
    if (!Notification.isSupported()) {
      dispatch({ type: 'PROMPT_BREAK' });
      return false;
    }

    const notification = new Notification({
      title: '该休息一下了',
      body: `已工作 ${formatMinutes(state.workElapsedMs || state.accumulatedMs)} 分钟，站起来完成本次休息目标。`,
      icon: path.join(__dirname, '..', 'favicon.png'),
      silent: false
    });

    notification.on('click', () => {
      dispatch({ type: 'PROMPT_BREAK' });
    });

    notification.show();
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
