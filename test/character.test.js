import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestMatch, parseCommand, spokenMaths, tidyName } from '../public/shared/character/commands.js';
import { evaluate } from '../public/desktop/calc.js';

test('navigation commands', () => {
  assert.deepEqual(parseCommand('go up'), { intent: 'up' });
  assert.deepEqual(parseCommand('Back.'), { intent: 'up' });
  assert.deepEqual(parseCommand('go to the parent folder'), { intent: 'up' });
  assert.deepEqual(parseCommand('go home'), { intent: 'home' });
  assert.deepEqual(parseCommand('please go to Dropbox'), { intent: 'goto', name: 'dropbox' });
  assert.deepEqual(parseCommand('cd GitHub-private2'), { intent: 'goto', name: 'github-private2' });
  assert.deepEqual(parseCommand("what's here?"), { intent: 'list' });
  assert.deepEqual(parseCommand('where am I'), { intent: 'list' });
});

test('open, run, find, breason, brainstorm', () => {
  assert.deepEqual(parseCommand('open notes dot txt'), { intent: 'open', name: 'notes.txt' });
  assert.deepEqual(parseCommand('could you open the iEdit app'), { intent: 'open', name: 'iedit' });
  assert.deepEqual(parseCommand('run the breasoning script'), { intent: 'run', name: 'breasoning' });
  assert.deepEqual(parseCommand('find grammar logic'), { intent: 'find', query: 'grammar logic' });
  assert.deepEqual(parseCommand('breason out file.txt'), { intent: 'breason', name: 'file.txt' });
  assert.deepEqual(parseCommand('brainstorm about time travel'), { intent: 'brainstorm', topic: 'time travel' });
});

test('workflow commands', () => {
  assert.deepEqual(parseCommand('comment on notes dot txt'), { intent: 'comment', name: 'notes.txt' });
  assert.deepEqual(parseCommand('what do you think of song one'), { intent: 'comment', name: 'song one' });
  assert.deepEqual(parseCommand('grammar logic on meditation'), { intent: 'gl', topic: 'meditation' });
  assert.deepEqual(parseCommand('do grammar logic'), { intent: 'gl', topic: '' });
  assert.deepEqual(parseCommand("run today's workflows"), { intent: 'workflows', run: true });
  assert.deepEqual(parseCommand('my daily routine'), { intent: 'workflows', run: false });
  assert.deepEqual(parseCommand('show me the checklist'), { intent: 'workflows', run: false });
  assert.deepEqual(parseCommand("play today's music"), { intent: 'music' });
  assert.deepEqual(parseCommand('listen to the new songs'), { intent: 'music' });
});

test('maths, spoken or typed', () => {
  assert.equal(spokenMaths('two plus three times four'), '2 + 3 * 4');
  assert.equal(spokenMaths('open bracket 1 plus 2 close bracket squared'), '( 1 + 2 ) ^2');
  assert.equal(spokenMaths('square root of 16'), 'sqrt(16)');
  assert.equal(spokenMaths('3 point 5 times 2'), '3.5 * 2');
  const c = parseCommand('what is 2 plus 3 times 4?');
  assert.deepEqual(c, { intent: 'calc', expr: '2 + 3 * 4' });
  assert.equal(evaluate(c.expr).text, '14');
  assert.equal(evaluate(parseCommand('calculate open bracket 1 plus 2 close bracket squared').expr).text, '9');
  assert.equal(parseCommand('(4 + 4) / 2').intent, 'calc');
});

test('chat and everything else', () => {
  assert.equal(parseCommand('Hello there').intent, 'greet');
  assert.equal(parseCommand('thank you').intent, 'thanks');
  assert.equal(parseCommand('what time is it').intent, 'time');
  assert.equal(parseCommand('help').intent, 'help');
  assert.equal(parseCommand('stop').intent, 'quiet');
  assert.deepEqual(parseCommand('the moon is made of cheese'), { intent: 'unknown', text: 'the moon is made of cheese' });
});

test('names match despite speech recognition quirks', () => {
  const names = ['Dropbox', 'Desktop', 'GitHub-private2', 'notes.txt', 'Breasoning.shellrun.json', 'text_to_breasonings.pl'];
  assert.equal(bestMatch('dropbox', names), 'Dropbox');
  assert.equal(bestMatch('drop box', names), 'Dropbox');
  assert.equal(bestMatch('github private 2', names), 'GitHub-private2');
  assert.equal(bestMatch('notes', names), 'notes.txt');
  assert.equal(bestMatch('breasoning', names), 'Breasoning.shellrun.json');
  assert.equal(bestMatch('desk top', names), 'Desktop');
  assert.equal(bestMatch('dropbx', names), 'Dropbox');
  assert.equal(bestMatch('nothing like it', names), null);
  assert.equal(tidyName('My Notes Dot TXT file'), 'notes.txt');
});
