const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path) {
  const source = ts.transpileModule(fs.readFileSync(require.resolve(path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const m = { exports: {} };

  new Function('module', 'exports', 'require', source)(m, m.exports, require);

  return m.exports;
}

const { readPreferences, defaultPreferences, scheduleWindow } = load(
  '../src/services/preferences.ts',
);
const { reminderPlan } = load('../src/services/reminderPlan.ts');
const now = new Date(2026, 9, 17, 6);
const task = (id, changes = {}) => ({
  id,
  title: id,
  module: 'Math',
  type: 'TEST',
  priority: 2,
  difficulty: 2,
  estimatedMinutes: 90,
  status: 'PENDING',
  dueAt: new Date(2026, 9, 19, 18).toISOString(),
  ...changes,
});

test('preferences reject corrupted storage and unsupported values', () => {
  for (const raw of ['bad json', 'null', '[]'])
    assert.deepEqual(readPreferences(raw), defaultPreferences);

  const p = readPreferences(
    JSON.stringify({ sessionMinutes: 0, dailyMinutes: -1, reminders: false, breakMinutes: 10 }),
  );

  assert.equal(p.sessionMinutes, 25);
  assert.equal(p.dailyMinutes, 120);
  assert.equal(p.breakMinutes, 10);
  assert.equal(p.reminders, false);
});
test('reminders exclude finished, cancelled, invalid and elapsed triggers', () => {
  const result = reminderPlan(
    [
      task('ok'),
      task('done', { status: 'COMPLETED' }),
      task('cancel', { status: 'CANCELLED' }),
      task('bad', { dueAt: 'invalid' }),
      task('past', { dueAt: now.toISOString() }),
    ],
    24,
    now.getTime(),
  );

  assert.deepEqual(
    result.map((x) => x.task.id),
    ['ok'],
  );
  assert.equal(result[0].date.getTime(), new Date(task('ok').dueAt).getTime() - 86400000);
});
test('reminders cap scheduled notifications at 50 and sort earliest first', () => {
  const result = reminderPlan(
    Array.from({ length: 70 }, (_, i) => task(String(i))),
    1,
    now.getTime(),
  );

  assert.equal(result.length, 50);
});
test('preferences map to backend planning windows', () => {
  assert.deepEqual(
    scheduleWindow({
      ...defaultPreferences,
      startHour: 18,
      dailyMinutes: 240,
      sessionMinutes: 45,
      breakMinutes: 15,
    }),
    {
      dailyStart: '18:00',
      dailyEnd: '22:00',
      sessionMinutes: 45,
      breakMinutes: 15,
    },
  );
  assert.equal(scheduleWindow(defaultPreferences).dailyStart, '09:00');
});
