function createPowerMonitorSource(powerMonitor, dispatch, getSettings) {
  let locked = false;
  let suspended = false;

  function getSnapshot() {
    const settings = getSettings();
    const idleState = powerMonitor.getSystemIdleState(settings.idleThresholdSec);
    return {
      systemActive: !locked && !suspended && idleState === 'active',
      idleState,
      idleTimeSec: powerMonitor.getSystemIdleTime(),
      locked,
      suspended
    };
  }

  function start() {
    powerMonitor.on('lock-screen', handleLock);
    powerMonitor.on('unlock-screen', handleUnlock);
    powerMonitor.on('suspend', handleSuspend);
    powerMonitor.on('resume', handleResume);
  }

  function stop() {
    powerMonitor.removeListener('lock-screen', handleLock);
    powerMonitor.removeListener('unlock-screen', handleUnlock);
    powerMonitor.removeListener('suspend', handleSuspend);
    powerMonitor.removeListener('resume', handleResume);
  }

  function handleLock() {
    locked = true;
    dispatch({ type: 'LOCKED' });
  }

  function handleUnlock() {
    locked = false;
    dispatch({ type: 'UNLOCKED' });
  }

  function handleSuspend() {
    suspended = true;
    dispatch({ type: 'SUSPENDED' });
  }

  function handleResume() {
    suspended = false;
    dispatch({ type: 'RESUMED' });
  }

  return {
    start,
    stop,
    getSnapshot
  };
}

module.exports = {
  createPowerMonitorSource
};
