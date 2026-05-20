const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;

const PHASES = new Set(['idle', 'work', 'prompt', 'resting', 'paused', 'completed']);

const DEFAULT_SETTINGS = {
  intervalMs: 45 * MS_PER_MINUTE,
  restBlockMs: 5 * MS_PER_MINUTE,
  dailyGoalMs: 30 * MS_PER_MINUTE,
  snoozeMs: 5 * MS_PER_MINUTE,
  idleConfirmSec: 15
};

function normalizeSettings(settings = {}) {
  const intervalMs = firstNumber(
    settings.intervalMs,
    settings.thresholdMs,
    minutesToMs(settings.intervalMinutes),
    minutesToMs(settings.thresholdMinutes),
    minutesToMs(settings.reminderInterval),
    DEFAULT_SETTINGS.intervalMs
  );

  const restBlockMs = firstNumber(
    settings.restBlockMs,
    settings.breakMs,
    minutesToMs(settings.restBlockMinutes),
    minutesToMs(settings.breakMinutes),
    minutesToMs(settings.restMinutes),
    DEFAULT_SETTINGS.restBlockMs
  );

  const dailyGoalMs = firstNumber(
    settings.dailyGoalMs,
    minutesToMs(settings.dailyGoalMinutes),
    minutesToMs(settings.dailyTargetMinutes),
    DEFAULT_SETTINGS.dailyGoalMs
  );

  const snoozeMs = firstNumber(
    settings.snoozeMs,
    minutesToMs(settings.snoozeMinutes),
    DEFAULT_SETTINGS.snoozeMs
  );

  return {
    intervalMs: clampMs(intervalMs, MS_PER_MINUTE, 4 * 60 * MS_PER_MINUTE),
    restBlockMs: clampMs(restBlockMs, MS_PER_MINUTE, 60 * MS_PER_MINUTE),
    dailyGoalMs: clampMs(dailyGoalMs, MS_PER_MINUTE, 8 * 60 * MS_PER_MINUTE),
    snoozeMs: clampMs(snoozeMs, MS_PER_MINUTE, 60 * MS_PER_MINUTE),
    idleConfirmSec: clampNumber(firstNumber(settings.idleConfirmSec, DEFAULT_SETTINGS.idleConfirmSec), 5, 120)
  };
}

function createInitialState(settings = {}, now = Date.now()) {
  return {
    phase: 'idle',
    settings: normalizeSettings(settings),
    todayKey: getTodayKey(now),
    todayRestMs: 0,
    workStartedAt: 0,
    nextReminderAt: 0,
    pausedAt: 0,
    lastTickAt: 0,
    rest: createRestState()
  };
}

function reduce(state, event, now = Date.now()) {
  const current = rollOverDay(state, now);

  switch (event.type) {
    case 'HYDRATE':
      return rollOverDay(hydrateState(current, event.state, now), now);

    case 'UPDATE_SETTINGS':
      return updateSettings(current, event.settings, now);

    case 'START_TRACKING':
    case 'START':
      return startWork(current, now);

    case 'PAUSE_TRACKING':
    case 'PAUSE':
      return current.phase === 'idle' || current.phase === 'completed'
        ? current
        : { ...current, phase: 'paused', pausedAt: now, lastTickAt: now };

    case 'STOP_TRACKING':
    case 'STOP':
      return {
        ...current,
        phase: 'idle',
        workStartedAt: 0,
        nextReminderAt: 0,
        pausedAt: 0,
        lastTickAt: now,
        rest: createRestState()
      };

    case 'START_BREAK':
    case 'START_REST':
      return current.phase === 'prompt' || current.phase === 'resting'
        ? {
            ...current,
            phase: 'resting',
            lastTickAt: now,
            rest: {
              ...createRestState(),
              blockStartedAt: now,
              idleSec: Math.max(0, Number(event.idleSec) || 0)
            }
          }
        : current;

    case 'SNOOZE':
      return startWork(
        {
          ...current,
          rest: createRestState()
        },
        now,
        Number(event.ms) > 0 ? Number(event.ms) : current.settings.snoozeMs
      );

    case 'SKIP_ONCE':
      return startWork(
        {
          ...current,
          rest: createRestState()
        },
        now
      );

    case 'OPEN_BREAK_WINDOW':
    case 'PROMPT_BREAK':
      return current.phase === 'completed'
        ? current
        : {
            ...current,
            phase: 'prompt',
            lastTickAt: now,
            rest: createRestState()
          };

    case 'RESET_TODAY':
      return {
        ...current,
        phase: 'idle',
        todayKey: getTodayKey(now),
        todayRestMs: 0,
        workStartedAt: 0,
        nextReminderAt: 0,
        pausedAt: 0,
        lastTickAt: now,
        rest: createRestState()
      };

    case 'TICK':
      return tick(current, event, now);

    default:
      return current;
  }
}

function tick(state, event, now) {
  const idleSec = Math.max(0, Number(event.idleSec) || 0);

  if (state.phase === 'idle' || state.phase === 'paused' || state.phase === 'completed') {
    return { ...state, lastTickAt: now, rest: { ...state.rest, idleSec } };
  }

  if (state.phase === 'work') {
    if (state.nextReminderAt > 0 && now >= state.nextReminderAt) {
      return {
        ...state,
        phase: 'prompt',
        lastTickAt: now,
        rest: { ...createRestState(), idleSec }
      };
    }
    return { ...state, lastTickAt: now, rest: { ...state.rest, idleSec } };
  }

  if (state.phase === 'prompt') {
    return { ...state, lastTickAt: now, rest: { ...state.rest, idleSec } };
  }

  if (state.phase === 'resting') {
    return tickResting(state, idleSec, now);
  }

  return { ...state, lastTickAt: now, rest: { ...state.rest, idleSec } };
}

function tickResting(state, idleSec, now) {
  const idleEnough = idleSec >= state.settings.idleConfirmSec;

  if (!idleEnough) {
    const hadProgress = state.rest.currentValidMs > 0 || state.rest.lastValidTickAt > 0;
    return {
      ...state,
      lastTickAt: now,
      rest: {
        ...state.rest,
        idleSec,
        currentValidMs: 0,
        lastValidTickAt: 0,
        waitingForIdle: true,
        resetCount: state.rest.resetCount + (hadProgress ? 1 : 0)
      }
    };
  }

  const lastValidTickAt = state.rest.lastValidTickAt || now;
  const deltaMs = Math.max(0, now - lastValidTickAt);
  const currentValidMs = Math.min(state.settings.restBlockMs, state.rest.currentValidMs + deltaMs);

  if (currentValidMs >= state.settings.restBlockMs) {
    const todayRestMs = Math.min(state.settings.dailyGoalMs, state.todayRestMs + state.settings.restBlockMs);
    const goalMet = todayRestMs >= state.settings.dailyGoalMs;

    return goalMet
      ? {
          ...state,
          phase: 'completed',
          todayRestMs,
          workStartedAt: 0,
          nextReminderAt: 0,
          lastTickAt: now,
          rest: { ...createRestState(), idleSec }
        }
      : startWork(
          {
            ...state,
            todayRestMs,
            lastTickAt: now,
            rest: { ...createRestState(), idleSec }
          },
          now
        );
  }

  return {
    ...state,
    lastTickAt: now,
    rest: {
      ...state.rest,
      idleSec,
      currentValidMs,
      lastValidTickAt: now,
      waitingForIdle: false
    }
  };
}

function startWork(state, now, delayMs = state.settings.intervalMs) {
  if (state.todayRestMs >= state.settings.dailyGoalMs) {
    return {
      ...state,
      phase: 'completed',
      workStartedAt: 0,
      nextReminderAt: 0,
      lastTickAt: now,
      rest: createRestState()
    };
  }

  return {
    ...state,
    phase: 'work',
    workStartedAt: now,
    nextReminderAt: now + delayMs,
    pausedAt: 0,
    lastTickAt: now,
    rest: createRestState()
  };
}

function updateSettings(state, settings = {}, now) {
  const nextSettings = normalizeSettings({ ...state.settings, ...settings });
  const next = { ...state, settings: nextSettings, lastTickAt: now };

  if (next.todayRestMs >= nextSettings.dailyGoalMs) {
    return {
      ...next,
      phase: 'completed',
      workStartedAt: 0,
      nextReminderAt: 0,
      rest: createRestState()
    };
  }

  if (state.phase === 'work') {
    return {
      ...next,
      workStartedAt: now,
      nextReminderAt: now + nextSettings.intervalMs
    };
  }

  return next;
}

function hydrateState(state, saved = {}, now) {
  const settings = normalizeSettings(saved.settings || state.settings);
  const phase = PHASES.has(saved.phase) ? saved.phase : 'idle';

  return {
    ...state,
    ...saved,
    phase,
    settings,
    todayKey: saved.todayKey || getTodayKey(now),
    todayRestMs: Math.max(0, Number(saved.todayRestMs) || 0),
    workStartedAt: Math.max(0, Number(saved.workStartedAt) || 0),
    nextReminderAt: Math.max(0, Number(saved.nextReminderAt) || 0),
    pausedAt: Math.max(0, Number(saved.pausedAt) || 0),
    lastTickAt: now,
    rest: { ...createRestState(), ...(saved.rest || {}) }
  };
}

function deriveState(state, now = Date.now()) {
  const todayState = rollOverDay(state, now);
  const workElapsedMs = todayState.workStartedAt > 0
    ? Math.max(0, now - todayState.workStartedAt)
    : 0;
  const remainingMs = todayState.phase === 'work' && todayState.nextReminderAt > 0
    ? Math.max(0, todayState.nextReminderAt - now)
    : 0;
  const restRemainingMs = Math.max(0, todayState.settings.restBlockMs - todayState.rest.currentValidMs);
  const dailyRemainingMs = Math.max(0, todayState.settings.dailyGoalMs - todayState.todayRestMs);

  return {
    ...todayState,
    accumulatedMs: workElapsedMs,
    workElapsedMs,
    remainingMs,
    restRemainingMs,
    dailyRemainingMs,
    dailyProgress: todayState.settings.dailyGoalMs > 0
      ? Math.min(1, todayState.todayRestMs / todayState.settings.dailyGoalMs)
      : 0,
    goalMet: todayState.todayRestMs >= todayState.settings.dailyGoalMs,
    idleEnough: todayState.rest.idleSec >= todayState.settings.idleConfirmSec
  };
}

function rollOverDay(state, now) {
  const todayKey = getTodayKey(now);
  if (state.todayKey === todayKey) {
    return state;
  }

  return {
    ...state,
    phase: state.phase === 'completed' ? 'idle' : state.phase,
    todayKey,
    todayRestMs: 0,
    rest: createRestState()
  };
}

function createRestState() {
  return {
    blockStartedAt: 0,
    currentValidMs: 0,
    lastValidTickAt: 0,
    idleSec: 0,
    waitingForIdle: true,
    resetCount: 0
  };
}

function getTodayKey(now = Date.now()) {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function minutesToMs(value) {
  return value === undefined || value === null ? undefined : Number(value) * MS_PER_MINUTE;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) {
      return number;
    }
  }
  return 0;
}

function clampMs(value, min, max) {
  return clampNumber(Number(value) || min, min, max);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  DEFAULT_SETTINGS,
  MS_PER_MINUTE,
  createInitialState,
  normalizeSettings,
  reduce,
  deriveState,
  getTodayKey
};
