const DEFAULT_SETTINGS = {
  thresholdMs: 45 * 60 * 1000,
  breakMs: 5 * 60 * 1000,
  snoozeMs: 5 * 60 * 1000,
  idleThresholdSec: 60,
  notificationGraceMs: 30 * 1000,
  typingGapMs: 10 * 60 * 1000
};

function normalizeSettings(settings = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  return {
    thresholdMs: clampMs(merged.thresholdMs, 60 * 1000, 180 * 60 * 1000),
    breakMs: clampMs(merged.breakMs, 60 * 1000, 60 * 60 * 1000),
    snoozeMs: clampMs(merged.snoozeMs, 60 * 1000, 60 * 60 * 1000),
    idleThresholdSec: clampNumber(merged.idleThresholdSec, 15, 15 * 60),
    notificationGraceMs: clampMs(merged.notificationGraceMs, 5 * 1000, 5 * 60 * 1000),
    typingGapMs: clampMs(merged.typingGapMs, 60 * 1000, 60 * 60 * 1000)
  };
}

function createInitialState(settings = {}) {
  const normalizedSettings = normalizeSettings(settings);
  return {
    phase: 'idle',
    mode: settings.mode === 'typing' ? 'typing' : 'system-active',
    accumulatedMs: 0,
    lastTickAt: 0,
    snoozeUntil: 0,
    cooldownUntil: 0,
    lastNotificationAt: 0,
    typing: {
      sessionStartAt: 0,
      lastTypingAt: 0,
      hookStatus: 'disabled',
      permissionStatus: 'unknown',
      lastError: ''
    },
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
        mode: event.state?.mode === 'typing' ? 'typing' : 'system-active',
        typing: { ...state.typing, ...(event.state?.typing || {}) },
        settings: normalizeSettings(event.state?.settings || state.settings),
        flags: { ...state.flags, ...(event.state?.flags || {}) }
      };

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        mode: event.settings?.mode === 'typing'
          ? 'typing'
          : event.settings?.mode === 'system-active'
            ? 'system-active'
            : state.mode,
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
        lastNotificationAt: 0,
        typing: resetTypingSession(state.typing)
      };

    case 'KEY_ACTIVITY':
      return recordKeyActivity(state, now);

    case 'HOOK_STATUS':
      return {
        ...state,
        typing: {
          ...state.typing,
          hookStatus: event.status || state.typing.hookStatus,
          lastError: event.error || ''
        }
      };

    case 'PERMISSION_STATUS':
      return {
        ...state,
        typing: {
          ...state.typing,
          permissionStatus: event.status || state.typing.permissionStatus
        }
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
        lastNotificationAt: 0,
        typing: resetTypingSession(state.typing)
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
        lastNotificationAt: 0,
        typing: resetTypingSession(state.typing)
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
  const accumulatedMs = state.mode === 'typing'
    ? getTypingAccumulatedMs(state, now)
    : getSystemActiveAccumulatedMs(state, event, deltaMs, inSnooze);

  if (state.mode === 'typing' && state.typing.sessionStartAt > 0 && isTypingGapExpired(state, now)) {
    return {
      ...state,
      accumulatedMs: 0,
      lastTickAt: now,
      typing: resetTypingSession(state.typing)
    };
  }

  if (!inSnooze && accumulatedMs >= state.settings.thresholdMs) {
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

function recordKeyActivity(state, now) {
  if (state.mode !== 'typing') {
    return state;
  }

  const previousLastTypingAt = state.typing.lastTypingAt || 0;
  const shouldStartNewSession =
    state.typing.sessionStartAt === 0 ||
    (previousLastTypingAt > 0 && now - previousLastTypingAt > state.settings.typingGapMs);

  return {
    ...state,
    phase: state.phase === 'idle' || state.phase === 'paused' ? 'tracking' : state.phase,
    accumulatedMs: shouldStartNewSession ? 0 : state.accumulatedMs,
    lastTickAt: state.lastTickAt || now,
    typing: {
      ...state.typing,
      sessionStartAt: shouldStartNewSession ? now : state.typing.sessionStartAt,
      lastTypingAt: now
    }
  };
}

function getTypingAccumulatedMs(state, now) {
  if (state.typing.sessionStartAt === 0 || state.typing.lastTypingAt === 0) {
    return 0;
  }

  if (isTypingGapExpired(state, now)) {
    return 0;
  }

  return Math.max(0, now - state.typing.sessionStartAt);
}

function isTypingGapExpired(state, now) {
  return state.typing.lastTypingAt > 0 && now - state.typing.lastTypingAt > state.settings.typingGapMs;
}

function getSystemActiveAccumulatedMs(state, event, deltaMs, inSnooze) {
  const canAccumulate =
    state.phase === 'tracking' &&
    !inSnooze &&
    !state.flags.locked &&
    !state.flags.suspended &&
    !!event.systemActive;

  return canAccumulate ? state.accumulatedMs + deltaMs : state.accumulatedMs;
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

function resetTypingSession(typing) {
  return {
    ...typing,
    sessionStartAt: 0,
    lastTypingAt: 0
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  createInitialState,
  normalizeSettings,
  reduce
};
