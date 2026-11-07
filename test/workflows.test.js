import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyToRun, dueReminder, glGoal, isFinished, isRecent, needsPerson, newItem, ordered, parseTimes, prologString, slug, stamp, today } from '../public/desktop/workflows-lib.js';

test('daily items finish for the day only', () => {
  const d = newItem({ title: 'GL', daily: true, finishedOn: '2026-11-07' });
  const once = newItem({ title: 'Paper', finishedOn: '2026-11-01' });
  assert.ok(isFinished(d, '2026-11-07'));
  assert.ok(!isFinished(d, '2026-11-08'));
  assert.ok(isFinished(once, '2026-11-08'));
  const items = [d, once, newItem({ daily: true }), newItem({ daily: true, hidden: true })];
  assert.equal(dailyToRun(items, '2026-11-07').length, 1);
  assert.equal(dailyToRun(items, '2026-11-08').length, 2);
});

test('children sit under their parent', () => {
  const a = newItem({ title: 'a' }, 1);
  const b = newItem({ title: 'b', parent: a.id }, 2);
  const c = newItem({ title: 'c', parent: b.id }, 3);
  const h = newItem({ title: 'h', hidden: true }, 4);
  const orphan = newItem({ title: 'o', parent: 'gone' }, 5);
  assert.deepEqual(ordered([c, orphan, b, a, h]).map((x) => `${x.item.title}${x.depth}`), ['o0', 'a0', 'b1', 'c2']);
  assert.equal(ordered([a, h], true).length, 2);
});

test('reminder times', () => {
  const times = parseTimes('15:30, 10am, 3pm, nonsense, 10:00, 12am');
  assert.deepEqual(times, [{ h: 0, m: 0 }, { h: 10, m: 0 }, { h: 15, m: 0 }, { h: 15, m: 30 }]);
  const at = (h, m) => new Date(2026, 10, 7, h, m);
  assert.deepEqual(dueReminder(parseTimes('10:00, 15:00'), at(9, 59)), null);
  assert.deepEqual(dueReminder(parseTimes('10:00, 15:00'), at(10, 0)), { h: 10, m: 0 });
  assert.deepEqual(dueReminder(parseTimes('10:00, 15:00'), at(16, 0), ['15:00']), { h: 10, m: 0 });
  assert.equal(dueReminder(parseTimes('10:00, 15:00'), at(16, 0), ['10:00', '15:00']), null);
});

test('Grammar Logic goal is safe Prolog', () => {
  assert.equal(prologString('say "hi" \\ there'), '"say \\"hi\\" \\\\ there"');
  const g = glGoal('time travel', 4000);
  assert.match(g, /^grammar_logic_to_alg1\("time travel", 4000, R\)/);
  assert.match(g, /forall\(member\(X, T\)/);
  assert.match(glGoal('x', 'lots'), /, 4000, R\)/);
});

test('names, dates and scripts', () => {
  assert.equal(slug('Time travel: part 2?'), 'Time travel part 2');
  assert.equal(slug('///'), 'untitled');
  assert.equal(today(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(stamp(new Date(2026, 0, 5, 9, 7)), '2026-01-05 0907');
  assert.ok(needsPerson({ steps: [{ type: 'cmd' }, { type: 'pause' }] }));
  assert.ok(!needsPerson({ steps: [{ type: 'cmd' }] }));
  assert.ok(isRecent(Date.now() - 3600e3));
  assert.ok(!isRecent(Date.now() - 2 * 86400e3));
});
