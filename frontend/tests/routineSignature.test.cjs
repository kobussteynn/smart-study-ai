const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/services/routineSignature.ts'), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  },
).outputText;
const target = { exports: {} };

vm.runInNewContext(code, { module: target, exports: target.exports });

const { matchesRoutineSnapshot, routineSignature } = target.exports;
const event = {
  id: 'sport',
  title: 'Sport',
  startTime: '18:00',
  endTime: '19:00',
  repeat: 'selected',
  daysOfWeek: [1, 3],
  timezone: 'Africa/Johannesburg',
};
const plan = { userId: 'student', routineEvents: [event] };

test('API defaults and serialization do not invalidate the same activities', () => {
  const api = {
    ...event,
    startTime: '18:00:00',
    endTime: '19:00:00',
    allDay: false,
    date: null,
    endDate: null,
    daysOfWeek: [3, 1],
  };

  assert.equal(routineSignature([event]), routineSignature([api]));
});

test('changed activity times or weekdays hide an old or late-arriving plan', () => {
  for (const change of [
    { startTime: '17:00' },
    { startTime: '18:00:30' },
    { daysOfWeek: [2] },
    { allDay: true },
    { timezone: 'UTC' },
  ]) {
    assert.equal(matchesRoutineSnapshot(plan, 'student', [{ ...event, ...change }]), false);
  }

  assert.equal(matchesRoutineSnapshot(plan, 'student', []), false);
});

test('holiday date range changes invalidate a saved plan', () => {
  const holiday = {
    ...event,
    allDay: true,
    repeat: 'once',
    date: '2030-01-02',
    endDate: '2030-01-04',
  };

  assert.equal(
    matchesRoutineSnapshot({ userId: 'student', routineEvents: [holiday] }, 'student', [
      { ...holiday, endDate: '2030-01-05' },
    ]),
    false,
  );
});

test('unloaded routines, legacy plans and a different account cannot show a plan', () => {
  assert.equal(matchesRoutineSnapshot(plan, 'student', null), false);
  assert.equal(matchesRoutineSnapshot(plan, 'other', [event]), false);
  assert.equal(matchesRoutineSnapshot({ userId: 'student' }, 'student', []), false);
  assert.equal(matchesRoutineSnapshot(plan, 'student', [event]), true);
});
