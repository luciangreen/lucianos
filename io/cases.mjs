// The functions whose inputs and outputs are recorded in io/ios.txt (see io/engine.mjs).
import { copyName, copyPlan } from '../public/desktop/copy-lib.js';
import { rectFrom, hitsOf, combine, edgeScroll } from '../public/desktop/marquee-lib.js';
import { cleanUp, placeAll, sortEntries, rowsFor } from '../public/desktop/layout-lib.js';
import { readmePrograms, isTestPath, testsFailed } from '../public/desktop/programs-lib.js';
import { isFinished, daysBetween, repeatText } from '../public/desktop/workflows-lib.js';
import { kindOf, displayName, parseUrlFile, safeUrl } from '../public/desktop/filetypes.js';

export const title = 'LucianOS';

const NAMES = ['a.txt', 'a copy.txt', 'notes.md', 'Docs', 'report 2.pdf', 'b copy 2.txt', 'image.png', 'run.pl'];
const pt = (rnd) => ({ x: rnd.int(0, 600), y: rnd.int(0, 400) });
const icons = (rnd) => Array.from({ length: rnd.int(1, 6) }, (_, i) => { const x = rnd.int(0, 500), y = rnd.int(0, 300); return { key: `k${i}`, rect: { left: x, top: y, right: x + 80, bottom: y + 90 } }; });
const date = (rnd) => `2026-${String(rnd.int(1, 12)).padStart(2, '0')}-${String(rnd.int(1, 28)).padStart(2, '0')}`;

export const cases = [
  { name: 'copyName', run: (name, taken, isDir) => copyName(name, new Set(taken), { isDir }), make: (rnd) => [rnd.pick(NAMES), rnd.some(NAMES, 0, 4), rnd.chance(0.2)] },
  { name: 'copyPlan', run: copyPlan, make: (rnd) => [rnd.some(NAMES, 1, 3).map((n) => ({ name: n, path: `src/${n}`, type: /\./.test(n) ? 'file' : 'dir' })), rnd.pick(['src', 'dest', '']), rnd.some(NAMES, 0, 3)] },
  { name: 'marquee hits', run: (a, b, list, base, mode) => [...combine(new Set(base), hitsOf(rectFrom(a, b), list), mode)].sort(), make: (rnd) => [pt(rnd), pt(rnd), icons(rnd), rnd.some(['k0', 'k1', 'k2'], 0, 2), rnd.pick(['replace', 'add', 'toggle'])] },
  { name: 'edgeScroll', run: edgeScroll, make: (rnd) => [rnd.int(-30, 530), 0, 500] },
  { name: 'cleanUp', run: (items, box) => cleanUp(items, box), make: (rnd) => [Array.from({ length: rnd.int(1, 12) }, (_, i) => ({ key: `i${i}`, right: rnd.chance(0.3) })), { width: rnd.pick([390, 800, 1280]), height: rnd.pick([300, 568, 760]) }] },
  { name: 'placeAll', run: placeAll, make: (rnd) => { const items = Array.from({ length: rnd.int(1, 8) }, (_, i) => ({ key: `i${i}`, right: rnd.chance(0.3) })); const saved = Object.fromEntries(items.filter(() => rnd.chance(0.5)).map((it) => [it.key, { x: rnd.int(0, 1300), y: rnd.int(0, 900) }])); return [items, saved, { width: rnd.pick([390, 1280]), height: rnd.pick([568, 760]) }]; } },
  { name: 'sortEntries', run: (entries, by) => sortEntries(entries, by).map((e) => e.name), make: (rnd) => [rnd.some(NAMES, 2, 6).map((n, i) => ({ name: n, type: /\./.test(n) ? 'file' : 'dir', mtimeMs: rnd.int(1, 100) })), rnd.pick(['name', 'kind', 'date'])] },
  { name: 'rowsFor', run: rowsFor, make: (rnd) => [rnd.int(0, 1200)] },
  { name: 'readmePrograms', run: readmePrograms, make: (rnd) => [`# ${rnd.words(1, 2)}\n\n${rnd.sentence()}\n\n\`\`\`\n${rnd.pick(['swipl run.pl', 'node app.js', '?- main.', 'npm test'])}\n\`\`\`\n\nRun \`${rnd.pick(['main.', 'start(8080).', 'go'])}\`.`] },
  { name: 'isTestPath', run: isTestPath, make: (rnd) => [rnd.pick(['test/a.test.js', 'tests/t.pl', 'src/app.js', 'a_test.pl', 'spec/x.js', 'testing.md', 'lib/test-utils.js'])] },
  { name: 'testsFailed', run: testsFailed, make: (rnd) => [rnd.pick([0, 1, 2]), rnd.pick(['# pass 3\n# fail 0', '# fail 2', 'ok\n', 'Warning: ... goal (directive) failed', 'false.', 'true.', 'ERROR: x'])] },
  { name: 'daysBetween', run: daysBetween, make: (rnd) => [date(rnd), date(rnd)] },
  { name: 'repeatText', run: repeatText, make: (rnd) => [rnd.pick([{ daily: true }, { everyDays: 7 }, { everyDays: rnd.int(2, 30) }, { everyDays: 0 }, {}])] },
  { name: 'isFinished', run: (item, day) => isFinished(item, day), make: (rnd) => [{ status: rnd.pick(['todo', 'done', 'doing']), ...(rnd.chance(0.5) ? { daily: true } : rnd.chance(0.5) ? { everyDays: rnd.pick([3, 7]) } : {}), ...(rnd.chance(0.6) ? { finishedOn: date(rnd), lastDone: date(rnd) } : {}) }, date(rnd)] },
  { name: 'kindOf', run: (name, type) => kindOf({ name, type }), make: (rnd) => [rnd.pick([...NAMES, 'site.url', 'song.mid', 'movie.mp4', 'deck.lpres', 'x.lsheet']), rnd.pick(['file', 'file', 'dir'])] },
  { name: 'displayName', run: (name) => displayName({ name, type: 'file' }), make: (rnd) => [rnd.pick([...NAMES, 'Google.url', 'site.url', '.hidden'])] },
  { name: 'parseUrlFile', run: parseUrlFile, make: (rnd) => [rnd.pick(['[InternetShortcut]\nURL=https://example.com/a', 'URL=http://x.org', 'https://lucian.green', 'javascript:alert(1)', '[InternetShortcut]\nURL=ftp://files', ''])] },
  { name: 'safeUrl', run: safeUrl, make: (rnd) => [rnd.pick(['https://example.com', 'http://a.b/c?d=1', 'javascript:alert(1)', 'data:text/html,x', 'example.com', 'mailto:x@y.z', ' https://x.y '])] }
];
