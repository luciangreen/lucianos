// What each kind of file looks like and how it opens.

const TEXT = new Set(['txt', 'md', 'markdown', 'pl', 'pro', 'js', 'mjs', 'cjs', 'json', 'html', 'htm', 'css', 'csv', 'tsv', 'sh', 'py', 'xml', 'yml', 'yaml', 'toml', 'ini', 'log', 'tex', 'bib', 'rtf', 'c', 'h', 'cpp', 'java', 'rb', 'go', 'rs', 'ts', 'svg', 'gitignore', 'env', 'lp', 'gl']);
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'ico']);
const AUDIO = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'mid', 'midi', 'aif', 'aiff']);
const VIDEO = new Set(['mp4', 'mov', 'm4v', 'webm']);

export const APP_INFO = {
  iedit: { name: 'iEdit', glyph: '✏️' },
  shellrunscriptmaker: { name: 'shellrun', glyph: '⚙️' },
  touchscreenterminal: { name: 'Touchscreen terminal', glyph: '👆' },
  simplug: { name: 'simplug', glyph: '💬' },
  fastos: { name: 'fastos', glyph: '⚡' },
  dancestudio: { name: 'DanceStudio', glyph: '💃' },
  lucianoffice: { name: 'Lucian Office', glyph: '🏢' },
  writer: { name: 'Writer', glyph: '📝' },
  counter: { name: 'Counter', glyph: '🧮' },
  presenter: { name: 'Presenter', glyph: '📽️' },
  etcher: { name: 'Etcher', glyph: '✒️' },
  tabler: { name: 'Tabler', glyph: '🗃️' },
  studio: { name: 'Studio', glyph: '🎚️' },
  moviemr: { name: 'Movie MR', glyph: '🎬' },
  visualstarlog: { name: 'Visual Starlog', glyph: '✨' }
};

export function appInfo(id) {
  return APP_INFO[id] ?? { name: id, glyph: '🧩' };
}

export function extOf(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.shellrun.json')) return 'shellrun';
  const i = lower.lastIndexOf('.');
  return i > 0 ? lower.slice(i + 1) : lower.startsWith('.') ? lower.slice(1) : '';
}

// kind: dir | script | url | text | image | audio | video | pdf | other
export function kindOf(entry) {
  if (entry.type === 'dir') return 'dir';
  const ext = extOf(entry.name);
  if (ext === 'shellrun') return 'script';
  if (ext === 'url' || ext === 'webloc') return 'url';
  if (TEXT.has(ext)) return 'text';
  if (IMAGE.has(ext)) return 'image';
  if (AUDIO.has(ext)) return 'audio';
  if (VIDEO.has(ext)) return 'video';
  if (ext === 'pdf') return 'pdf';
  if (!ext && entry.size < 1_000_000) return 'text';
  return 'other';
}

const GLYPHS = { dir: '📁', script: '▶️', url: '🔗', image: '🖼️', audio: '🎵', video: '🎬', pdf: '📕', other: '📦' };

export function glyphFor(entry) {
  const kind = kindOf(entry);
  if (kind === 'text') {
    const ext = extOf(entry.name);
    if (ext === 'pl' || ext === 'pro') return '📜';
    if (ext === 'md') return '📝';
    return '📄';
  }
  return GLYPHS[kind];
}

export function displayName(entry) {
  if (kindOf(entry) === 'script') return entry.name.replace(/\.shellrun\.json$/i, '');
  if (kindOf(entry) === 'url') return entry.name.replace(/\.(url|webloc)$/i, '');
  return entry.name;
}

// Read the address from a .url (Windows/Internet shortcut) or .webloc (Mac) file.
export function parseUrlFile(text) {
  const win = /^\s*URL\s*=\s*(\S+)\s*$/im.exec(text);
  if (win) return win[1];
  const mac = /<key>URL<\/key>\s*<string>([^<]+)<\/string>/i.exec(text);
  if (mac) return mac[1].replace(/&amp;/g, '&');
  const bare = /^\s*(https?:\/\/\S+|\/\S*)\s*$/.exec(text);
  return bare ? bare[1] : null;
}

export function makeUrlFile(url) {
  return `[InternetShortcut]\nURL=${url}\n`;
}

// Only http(s) addresses and paths on this suite may be opened.
export function safeUrl(url) {
  if (!url) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
