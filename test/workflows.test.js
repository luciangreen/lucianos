import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BR, GL_AS, LOADER, breasonGoal, dailyToRun, dueReminder, firstWord, glGoal, loadGoal, isFinished, isRecent, needsPerson, newItem, ordered, parseTimes, prologString, slug, stamp, today } from '../public/desktop/workflows-lib.js';

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

test('Grammar Logic and breasoning use the calls in find_char_map.pl', () => {
  assert.equal(prologString('say "hi" \\ there'), '"say \\"hi\\" \\\\ there"');
  // Grammar Logic copies the first word and adds 79: 80 words to breason
  assert.equal(GL_AS, 1);
  assert.equal(BR, 80);
  assert.equal(firstWord('  time travel'), 'time');
  assert.equal(firstWord("Lucian's meditation"), "Lucian's");
  const folders = { awl: 'Dropbox/GitHub-private2/Algorithm-Writer-with-Lists', t2b: 'Dropbox/GitHub-private2/Text-to-Breasonings' };
  // paths are absolute, from the suite folder, so a linked Dropbox folder can't break them
  const load = loadGoal(folders);
  assert.match(load, /^getenv\('LUCIANOS_ROOT',Root\), /);
  assert.match(load, /atomic_list_concat\(\[Root,'\/',"Dropbox\/GitHub-private2\/Text-to-Breasonings",'\/text_to_breasonings\.pl'\],T2B_file\)/);
  assert.match(load, /atomic_list_concat\(\[Root,'\/',"Dropbox\/GitHub-private2\/Algorithm-Writer-with-Lists",'\/grammar_logic_to_alg1\.pl'\],GL_file\)/);
  assert.match(load, /:-include\(~q\)\.~n:-include\(~q\)\.~n',\[T2B_file,GL_file\]\), close\(Loader_s\), consult\(Loader\)$/);
  assert.ok(!load.includes('..'));
  const g = glGoal('say "hi"', folders);
  assert.ok(g.startsWith(load + ', Essay_0 = "say", As is 1, grammar_logic_to_alg1'));
  assert.match(g, /, As is 1, grammar_logic_to_alg1\(Essay_0,As,GL_out1\), term_to_atom\(GL_out1,GL_out2\), string_atom\(GL_out,GL_out2\), write\(GL_out\), nl$/);
  const b = breasonGoal('LucianOS/gl/meditation 2026-11-07 1500.txt', folders);
  assert.ok(b.startsWith(load + `, atomic_list_concat([Root,'/',"LucianOS/gl/meditation 2026-11-07 1500.txt"],GL_path), read_file_to_string(GL_path,GL_text,[]), `));
  assert.match(b, /As is 1, Br is As\*80, texttobr2\(u,u,GL_out,Br,\[auto,on\]\), texttobr\(u,u,GL_out,u\)$/);
  assert.equal(LOADER, 'LucianOS/prolog/gl_and_breasoning.pl');
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
