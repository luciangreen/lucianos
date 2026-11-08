// App icons: one family of drawn icons, a coloured rounded tile with a white symbol, so they
// look the same on every device (emoji differ between iPhone, Mac and Linux) and stay sharp
// at any size. Apps without a drawing here get a tile coloured from their name, with its
// first letter. To add an icon, add a gradient and a symbol on the 64 × 64 grid below.

const S = 'fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="#fff"';

export const ICONS = {
  // a pencil writing a line
  iedit: { colors: ['#5b6cff', '#3a3fc8'], svg: `<path ${S} d="M40 14l10 10-22 22-12 2 2-12z"/><path ${S} d="M35 19l10 10"/><path ${S} d="M14 54h36" opacity=".7"/>` },
  // a script that runs: lines of code beside a play button
  shellrunscriptmaker: { colors: ['#2fb7a3', '#16786d'], svg: `<path ${S} d="M12 20h18M12 30h12M12 40h16"/><circle ${S} cx="44" cy="34" r="12"/><path ${F} d="M41 28l9 6-9 6z"/>` },
  // a terminal window with a fingertip tap
  touchscreenterminal: { colors: ['#4a5160', '#23262e'], svg: `<path ${S} d="M40 42H14a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v14"/><path ${S} d="M18 20l6 5-6 5M28 31h8"/><circle cx="47" cy="47" r="6" fill="#fff"/><circle cx="47" cy="47" r="11" fill="none" stroke="#fff" stroke-width="2.5" opacity=".55"/>` },
  // a speech bubble with a plug
  simplug: { colors: ['#44c767', '#1f8a40'], svg: `<path ${S} d="M14 16h36a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H30l-10 8v-8h-6a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4z"/><path ${S} d="M27 26v6M37 26v6M24 32h16v2a8 8 0 0 1-16 0z"/>` },
  // a lightning bolt
  fastos: { colors: ['#ffb733', '#f06a1d'], svg: `<path ${F} d="M36 8L16 36h13l-4 20 21-29H33z"/>` },
  // a dancer mid-step, with a note
  dancestudio: { colors: ['#ff5fa2', '#c2257a'], svg: `<circle ${F} cx="30" cy="13" r="5"/><path ${S} d="M30 20l-2 16M28 36l-8 14M28 36l10 8 2 8M29 24l-11 4M29 24l12-6"/><path ${S} stroke-width="3" d="M48 26V12l6-2"/><circle ${F} cx="46" cy="27" r="3.5"/>` },
  // four tiles: the suite
  lucianoffice: { colors: ['#3c7bff', '#1b3f9e'], svg: `<rect ${F} x="12" y="12" width="17" height="17" rx="4"/><rect ${F} x="35" y="12" width="17" height="17" rx="4" opacity=".75"/><rect ${F} x="12" y="35" width="17" height="17" rx="4" opacity=".75"/><rect ${F} x="35" y="35" width="17" height="17" rx="4"/>` },
  // a page of text with a folded corner
  writer: { colors: ['#2f9bff', '#1564c0'], svg: `<path ${S} d="M18 10h20l10 10v34H18z"/><path ${S} d="M38 10v10h10"/><path ${S} d="M24 30h18M24 38h18M24 46h11"/>` },
  // a grid of cells, one picked out, with a sum
  counter: { colors: ['#2ec27e', '#16804f'], svg: `<rect ${S} x="10" y="12" width="44" height="40" rx="4"/><path ${S} d="M10 25h44M10 38h44M25 12v40M40 12v40"/><rect ${F} x="40" y="38" width="14" height="14" rx="1"/>` },
  // a screen on a stand showing a rising chart
  presenter: { colors: ['#ff8a3d', '#d4521a'], svg: `<rect ${S} x="10" y="10" width="44" height="30" rx="3"/><path ${S} d="M32 40v8M22 54l10-6 10 6"/><path ${S} d="M18 32l8-8 6 5 10-11"/>` },
  // a pen nib drawing a curve
  etcher: { colors: ['#a35bff', '#6b2bc9'], svg: `<path ${S} d="M10 52c8-14 16 4 24-8"/><path ${S} d="M36 40l-4-12 14-16 8 8-16 14z"/><circle ${F} cx="44" cy="22" r="2.5"/>` },
  // a table: header row and records
  tabler: { colors: ['#1fb6c9', '#0d7a8c'], svg: `<rect ${S} x="10" y="12" width="44" height="40" rx="5"/><path ${F} d="M12 14h40v10H12z"/><path ${S} d="M10 34h44M10 43h44M26 24v28"/>` },
  // mixing faders
  studio: { colors: ['#ff5a5a', '#b81f35'], svg: `<path ${S} d="M18 10v44M32 10v44M46 10v44" opacity=".55"/><rect ${F} x="12" y="34" width="12" height="7" rx="2"/><rect ${F} x="26" y="17" width="12" height="7" rx="2"/><rect ${F} x="40" y="27" width="12" height="7" rx="2"/>` },
  // a clapperboard
  moviemr: { colors: ['#3a3f4b', '#14161b'], svg: `<rect ${S} x="10" y="26" width="44" height="28" rx="3"/><path fill="#ffc531" d="M10 16l42-7 2 10-42 7z"/><path stroke="#14161b" stroke-width="3" d="M21 14l4 9M32 12l4 9M43 10l4 9"/><path ${S} d="M20 36h24M20 44h14" opacity=".7"/>` },
  // a star inside code brackets
  visualstarlog: { colors: ['#7d5bff', '#2b6ee8'], svg: `<path ${S} d="M16 18l-8 14 8 14M48 18l8 14-8 14"/><path ${F} d="M32 19l4 8.5 9 1.2-6.6 6.2 1.7 9L32 39.5 23.9 44l1.7-9-6.6-6.2 9-1.2z"/>` }
};

// A steady colour from the app's name, for apps without a drawing.
function hue(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.codePointAt(0)) % 360;
  return h;
}

export function iconParts(id) {
  const known = ICONS[id];
  if (known) return known;
  const h = hue(id);
  const letter = (id.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase();
  return {
    colors: [`hsl(${h} 70% 58%)`, `hsl(${(h + 25) % 360} 65% 38%)`],
    svg: `<text x="32" y="44" text-anchor="middle" font-family="system-ui, sans-serif" font-size="34" font-weight="700" fill="#fff">${letter}</text>`
  };
}

// The whole icon as an SVG string (tile and symbol). Each tile has its own gradient id, so
// several icons can sit on one page.
let n = 0;
export function appIconSvg(id) {
  const { colors, svg } = iconParts(id);
  const g = `lg${++n}`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><rect width="64" height="64" rx="14.5" fill="url(#${g})"/><rect x=".5" y=".5" width="63" height="63" rx="14" fill="none" stroke="#fff" stroke-opacity=".18"/><g transform="translate(6.4 6.4) scale(.8)">${svg}</g></svg>`;
}

// An element showing the icon; size it with CSS (width and height).
export function appIcon(id, className = 'appicon') {
  const span = document.createElement('span');
  span.className = className;
  span.innerHTML = appIconSvg(id);
  return span;
}
