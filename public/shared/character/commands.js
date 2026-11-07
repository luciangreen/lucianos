// What the character understands, spoken or typed. Pure functions, so they can be tested.
//   parseCommand('go to Dropbox')           -> { intent: 'goto', name: 'dropbox' }
//   parseCommand('what is 2 plus 3 times 4') -> { intent: 'calc', expr: '2 + 3 * 4' }
//   bestMatch('notes dot text', names)       -> the closest file name

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100
};

// Spoken maths -> symbols: "2 plus 3 times open bracket 4 minus 1 close bracket"
export function spokenMaths(text) {
  let s = ` ${text.toLowerCase()} `;
  const swaps = [
    [/\bmultiplied by\b|\btimes\b|\bx\b(?=\s*\d)/g, '*'],
    [/\bdivided by\b|\bover\b/g, '/'],
    [/\bplus\b|\badd\b/g, '+'],
    [/\bminus\b|\btake away\b/g, '-'],
    [/\bto the power of\b|\bpower\b/g, '^'],
    [/\bsquared\b/g, '^2'],
    [/\bcubed\b/g, '^3'],
    [/\bsquare root of\b/g, 'sqrt'],
    [/\bpercent\b/g, '%'],
    [/\b(open|left) (bracket|paren|parenthesis)\b/g, '('],
    [/\b(close|right) (bracket|paren|parenthesis)\b/g, ')'],
    [/\bpoint\b/g, '.']
  ];
  for (const [re, rep] of swaps) s = s.replace(re, ` ${rep} `);
  s = s.replace(/\b[a-z]+\b/g, (w) => (w in NUMBER_WORDS ? String(NUMBER_WORDS[w]) : w));
  s = s.replace(/\bsqrt\s+([\d.]+)/g, 'sqrt($1)');
  return s.replace(/\s+/g, ' ').replace(/\s*\.\s*(?=\d)/g, '.').trim();
}

const FILLER = /^(?:(?:ok(?:ay)?|hey|please|can you|could you|would you|will you|i want to|i'd like to|let's|lets)\s+)+/i;

export function parseCommand(raw) {
  const original = String(raw ?? '').trim();
  let t = original.replace(/[?!.]+$/, '').replace(FILLER, '').replace(/\s+please$/i, '').trim();
  const lower = t.toLowerCase();
  const rest = (re) => t.replace(re, '').trim();
  let m;

  if (!lower) return { intent: 'none' };
  if (/^(help|what can you do|what can i say|commands)$/.test(lower)) return { intent: 'help' };
  if (/^(hello|hi|hey|good (morning|afternoon|evening)|g'day)\b/.test(lower)) return { intent: 'greet' };
  if (/^(thanks|thank you|cheers)\b/.test(lower)) return { intent: 'thanks' };
  if (/^(stop|be quiet|quiet|shush|stop talking)$/.test(lower)) return { intent: 'quiet' };
  if (/^(what('s| is) the (time|date)|what time is it|what day is it)$/.test(lower)) return { intent: 'time' };
  if (/^(what('s| is) (here|in (this|the) folder)|list( the)? files|show( me)? the files|where am i)$/.test(lower)) return { intent: 'list' };
  if (/^(go )?(up|back)( (one|a) (folder|level))?$|^(go to )?(the )?parent( folder)?$/.test(lower)) return { intent: 'up' };
  if (/^(go )?home$|^go to (the )?home( folder)?$/.test(lower)) return { intent: 'home' };
  if ((m = /^(?:go to|go into|change to|cd|open (?:the )?folder)\s+(.+)$/i.exec(t))) return { intent: 'goto', name: tidyName(m[1]) };
  if ((m = /^breason(?: out)?\s+(.+)$/i.exec(t))) return { intent: 'breason', name: tidyName(m[1]) };
  if ((m = /^brainstorm(?: (?:about|on))?\s+(.+)$/i.exec(t))) return { intent: 'brainstorm', topic: m[1].trim() };
  if ((m = /^(?:find|search for|search|look for|where is|where's)\s+(.+)$/i.exec(t))) return { intent: 'find', query: m[1].trim() };
  if ((m = /^(?:run|start|execute)\s+(.+)$/i.exec(t))) return { intent: 'run', name: tidyName(m[1]) };
  if ((m = /^(?:open|edit|show(?: me)?|launch)\s+(.+)$/i.exec(t))) return { intent: 'open', name: tidyName(m[1]) };
  if ((m = /^(?:what(?:'s| is)|calculate|work out|how much is)\s+(.+)$/i.exec(t))) return { intent: 'calc', expr: spokenMaths(m[1]) };
  if (/\d/.test(lower) && /[-+*/^()×÷]|\b(plus|minus|times|divided|squared)\b/.test(lower)) return { intent: 'calc', expr: spokenMaths(t) };
  return { intent: 'unknown', text: original };
}

// "notes dot txt" -> "notes.txt"; drops "the", "file", "app"
export function tidyName(s) {
  return s
    .toLowerCase()
    .replace(/\s+dot\s+/g, '.')
    .replace(/^(the|my)\s+/, '')
    .replace(/\s+(file|folder|app|application|script)$/, '')
    .trim();
}

const norm = (s) => s.toLowerCase().replace(/\.shellrun\.json$|\.(url|webloc)$/, '').replace(/[^a-z0-9]+/g, '');
const stem = (s) => norm(s.replace(/\.[a-z0-9]+$/i, ''));

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// The candidate (string, or object with .name) that best matches a spoken name, or null.
export function bestMatch(spoken, candidates) {
  const want = norm(spoken);
  if (!want) return null;
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const name = typeof c === 'string' ? c : c.name;
    const full = norm(name);
    const base = stem(name);
    let score;
    if (full === want || base === want) score = 0;
    else if (base.startsWith(want) || full.startsWith(want)) score = 1 + (base.length - want.length) / 100;
    else if (full.includes(want)) score = 2 + (full.length - want.length) / 100;
    else {
      const dist = Math.min(editDistance(want, base), editDistance(want, full));
      score = dist <= Math.max(1, Math.floor(want.length / 4)) ? 3 + dist : Infinity;
    }
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export const HELP_TEXT = 'You can say: go to a folder, go up, go home, open a file or app, run a script, find something, what is two plus two, what time is it, or what\'s here.';
