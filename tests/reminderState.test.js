const assert = require('node:assert/strict');
const {
  MS_PER_MINUTE,
  createInitialState,
  reduce,
  deriveState
} = require('../main/reminderState');

const BASE = new Date('2026-05-22T09:00:00+08:00').getTime();

function createState(overrides = {}) {
  return createInitialState({
    intervalMs: 2 * MS_PER_MINUTE,
    restBlockMs: 1 * MS_PER_MINUTE,
    dailyGoalMs: 2 * MS_PER_MINUTE,
    snoozeMs: 5 * MS_PER_MINUTE,
    idleConfirmSec: 15,
    ...overrides
  }, BASE);
}

function promptAfterInterval(state, now = BASE) {
  let next = reduce(state, { type: 'START' }, now);
  next = reduce(next, { type: 'TICK', idleSec: 0 }, now + next.settings.intervalMs);
  assert.equal(next.phase, 'prompt');
  return next;
}

function completeRestBlock(state, now) {
  let next = reduce(state, { type: 'START_REST', idleSec: 0 }, now);
  assert.equal(next.phase, 'resting');
  next = reduce(next, { type: 'TICK', idleSec: 15 }, now + 15_000);
  next = reduce(next, { type: 'TICK', idleSec: 75 }, now + 75_000);
  return next;
}

function testStartAndPrompt() {
  const state = reduce(createState(), { type: 'START' }, BASE);

  assert.equal(state.phase, 'work');
  assert.equal(state.nextReminderAt, BASE + 2 * MS_PER_MINUTE);

  const prompted = reduce(state, { type: 'TICK', idleSec: 0 }, BASE + 2 * MS_PER_MINUTE);
  assert.equal(prompted.phase, 'prompt');
  assert.equal(deriveState(prompted, BASE + 2 * MS_PER_MINUTE).remainingMs, 0);
}

function testSnoozeAndSkipReturnToWork() {
  const prompted = promptAfterInterval(createState());
  const snoozed = reduce(prompted, { type: 'SNOOZE' }, BASE + 2 * MS_PER_MINUTE);

  assert.equal(snoozed.phase, 'work');
  assert.equal(snoozed.nextReminderAt, BASE + 7 * MS_PER_MINUTE);

  const promptedAgain = reduce(snoozed, { type: 'PROMPT_BREAK' }, BASE + 3 * MS_PER_MINUTE);
  const skipped = reduce(promptedAgain, { type: 'SKIP_ONCE' }, BASE + 3 * MS_PER_MINUTE);
  assert.equal(skipped.phase, 'work');
  assert.equal(skipped.nextReminderAt, BASE + 5 * MS_PER_MINUTE);
}

function testRestRequiresIdleAndResetsOnActivity() {
  const prompted = promptAfterInterval(createState());
  const restStartedAt = BASE + 2 * MS_PER_MINUTE;
  let resting = reduce(prompted, { type: 'START_REST', idleSec: 0 }, restStartedAt);

  resting = reduce(resting, { type: 'TICK', idleSec: 15 }, restStartedAt + 15_000);
  resting = reduce(resting, { type: 'TICK', idleSec: 45 }, restStartedAt + 45_000);
  assert.equal(resting.phase, 'resting');
  assert.equal(resting.rest.currentValidMs, 30_000);

  const reset = reduce(resting, { type: 'TICK', idleSec: 0 }, restStartedAt + 46_000);
  assert.equal(reset.phase, 'resting');
  assert.equal(reset.rest.currentValidMs, 0);
  assert.equal(reset.rest.resetCount, 1);
  assert.equal(reset.rest.waitingForIdle, true);
}

function testCompletedRestAddsToDailyGoal() {
  let state = promptAfterInterval(createState());
  state = completeRestBlock(state, BASE + 2 * MS_PER_MINUTE);

  assert.equal(state.phase, 'work');
  assert.equal(state.todayRestMs, 1 * MS_PER_MINUTE);

  state = reduce(state, { type: 'PROMPT_BREAK' }, BASE + 5 * MS_PER_MINUTE);
  state = completeRestBlock(state, BASE + 5 * MS_PER_MINUTE);

  assert.equal(state.phase, 'completed');
  assert.equal(state.todayRestMs, 2 * MS_PER_MINUTE);
  assert.equal(state.nextReminderAt, 0);
}

function testCompletedGoalResetsNextDay() {
  let state = createState();
  state = {
    ...state,
    phase: 'completed',
    todayRestMs: state.settings.dailyGoalMs,
    todayKey: '2026-05-21'
  };

  state = reduce(state, { type: 'TICK', idleSec: 0 }, BASE);
  assert.equal(state.phase, 'idle');
  assert.equal(state.todayKey, '2026-05-22');
  assert.equal(state.todayRestMs, 0);
}

const tests = [
  testStartAndPrompt,
  testSnoozeAndSkipReturnToWork,
  testRestRequiresIdleAndResetsOnActivity,
  testCompletedRestAddsToDailyGoal,
  testCompletedGoalResetsNextDay
];

for (const test of tests) {
  test();
}

console.log(`${tests.length} reminder state tests passed`);
