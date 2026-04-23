const DEFAULT_SETTINGS = {
  thresholdMs: 45 * 60 * 1000,
  breakMs: 5 * 60 * 1000,
  snoozeMs: 5 * 60 * 1000,
  idleThresholdSec: 60,
  notificationGraceMs: 30 * 1000
};

function normalizeSettings(settings = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  return {
    thresholdMs: clampMs(merged.thresholdMs, 60 * 1000, 180 * 60 * 1000),
    breakMs: clampMs(merged.breakMs, 60 * 1000, 60 * 60 * 1000),
    snoozeMs: clampMs(merged.snoozeMs, 60 * 1000, 60 * 60 * 1000),
    idleThresholdSec: clampNumber(merged.idleThresholdSec, 15, 15 * 60),
    notificationGraceMs: clampMs(merged.notificationGraceMs, 5 * 1000, 5 * 60 * 1000)
  };
}

function createInitialState(settings = {}) {
  const normalizedSettings = normalizeSettings(settings);
  return {
    phase: 'idle',
    mode: 'system-active',
    accumulatedMs: 0,
    lastTickAt: 0,
    snoozeUntil: 0,
    cooldownUntil: 0,
    lastNotificationAt: 0,
    settings: normalizedSettings,
    flags: {
      locked: false,
      suspended: false,
      systemActive: false
    }
  };
}

function reduce(state, event, now = Date.now()) {
  switch (event.type) {
    case 'HYDRATE':
      return {
        ...state,
        ...event.state,
        settings: normalizeSettings(event.state?.settings || state.settings),
        flags: { ...state.flags, ...(event.state?.flags || {}) }
      };

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: normalizeSettings({ ...state.settings, ...event.settings })
      };

    case 'START_TRACKING':
      return {
        ...state,
        phase: 'tracking',
        lastTickAt: now,
        snoozeUntil: 0
      };

    case 'PAUSE_TRACKING':
      return {
        ...state,
        phase: 'paused',
        lastTickAt: 0
      };

    case 'STOP_TRACKING':
      return {
        ...state,
        phase: 'idle',
        accumulatedMs: 0,
        lastTickAt: 0,
        snoozeUntil: 0,
        cooldownUntil: 0,
        lastNotificationAt: 0
      };

    case 'ACTIVITY_SNAPSHOT':
      return {
        ...state,
        flags: {
          ...state.flags,
          locked: !!event.locked,
          suspended: !!event.suspended,
          systemActive: !!event.systemActive
        }
      };

    case 'LOCKED':
      return { ...state, flags: { ...state.flags, locked: true, systemActive: false } };

    case 'UNLOCKED':
      return { ...state, flags: { ...state.flags, locked: false } };

    case 'SUSPENDED':
      return { ...state, flags: { ...state.flags, suspended: true, systemActive: false } };

    case 'RESUMED':
      return { ...state, flags: { ...state.flags, suspended: false }, lastTickAt: now };

    case 'TICK':
      return tick(state, event, now);

    case 'NOTIFICATION_SENT':
      return {
        ...state,
        phase: 'notifying',
        lastNotificationAt: now
      };

    case 'NOTIFICATION_CLICKED':
    case 'OPEN_BREAK_WINDOW':
      return {
        ...state,
        phase: 'break-window'
      };

    case 'START_BREAK':
      return {
        ...state,
        phase: 'cooldown',
        accumulatedMs: 0,
        lastTickAt: now,
        cooldownUntil: now + state.settings.breakMs,
        snoozeUntil: 0,
        lastNotificationAt: 0
      };

    case 'SNOOZE':
      return {
        ...state,
        phase: 'tracking',
        lastTickAt: now,
        snoozeUntil: now + (event.ms || state.settings.snoozeMs),
        lastNotificationAt: 0
      };

    case 'SKIP_ONCE':
      return {
        ...state,
        phase: 'tracking',
        accumulatedMs: 0,
        lastTickAt: now,
        snoozeUntil: 0,
        cooldownUntil: 0,
        lastNotificationAt: 0
      };

    default:
      return state;
  }
}

function tick(state, event, now) {
  if (state.phase === 'idle' || state.phase === 'paused') {
    return { ...state, lastTickAt: now };
  }

  if (state.phase === 'cooldown') {
    if (now >= state.cooldownUntil) {
      return {
        ...state,
        phase: 'tracking',
        cooldownUntil: 0,
        lastTickAt: now
      };
    }
    return { ...state, lastTickAt: now };
  }

  if (state.phase === 'notifying') {
    const notificationExpired =
      state.lastNotificationAt > 0 &&
      now - state.lastNotificationAt >= state.settings.notificationGraceMs;
    return notificationExpired ? { ...state, phase: 'break-window', lastTickAt: now } : { ...state, lastTickAt: now };
  }

  if (state.phase === 'break-window') {
    return { ...state, lastTickAt: now };
  }

  const deltaMs = getDeltaMs(state, event, now);
  const inSnooze = state.snoozeUntil > now;
  const canAccumulate =
    state.phase === 'tracking' &&
    !inSnooze &&
    !state.flags.locked &&
    !state.flags.suspended &&
    !!event.systemActive;

  const accumulatedMs = canAccumulate ? state.accumulatedMs + deltaMs : state.accumulatedMs;

  if (accumulatedMs >= state.settings.thresholdMs) {
    return {
      ...state,
      phase: 'notifying',
      accumulatedMs,
      lastTickAt: now,
      lastNotificationAt: 0
    };
  }

  return {
    ...state,
    accumulatedMs,
    lastTickAt: now
  };
}

function getDeltaMs(state, event, now) {
  if (typeof event.deltaMs === 'number') {
    return Math.max(0, event.deltaMs);
  }
  if (!state.lastTickAt) {
    return 0;
  }
  return Math.max(0, now - state.lastTickAt);
}

function clampMs(value, min, max) {
  return clampNumber(Number(value) || min, min, max);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  DEFAULT_SETTINGS,
  createInitialState,
  normalizeSettings,
  reduce
};
