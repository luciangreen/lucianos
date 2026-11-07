// The talking photo, ported from retromr (https://github.com/luciangreen/retromr, docs/index.html
// and face_model.pl) so any LucianOS app can show a character. One Puppet draws on one canvas.
//
//   const p = new Puppet(canvas);
//   await p.setPhoto(dataUrl, landmarks?)   // finds the face if no landmarks
//   p.mouth = 0..1                           // set while speaking (lip-sync from tts.js)
//   p.hearing = true                         // a little lean while listening

export function faceModel(L) {
  // mirror of retromr face_model.pl
  const [lx, ly] = L.eyeL, [rx, ry] = L.eyeR, [mx, my] = L.mouth;
  const eyeDist = Math.max(4, Math.hypot(rx - lx, ry - ly));
  const roll = Math.atan2(ry - ly, rx - lx);
  const dx = -Math.sin(roll), dy = Math.cos(roll);
  const mw = L.mouthW > 0.45 * eyeDist && L.mouthW < 1.6 * eyeDist ? L.mouthW : 0.9 * eyeDist;
  let chinD = 0.8 * eyeDist;
  if (L.chin) {
    const d = (L.chin[0] - mx) * dx + (L.chin[1] - my) * dy;
    if (d > 0.3 * eyeDist && d < 2 * eyeDist) chinD = d;
  }
  const top = -0.08 * mw, bottom = chinD + 0.18 * eyeDist, mid = (top + bottom) / 2;
  return {
    roll, eyeDist, eyes: [L.eyeL, L.eyeR], eyeRX: 0.24 * eyeDist, eyeRY: 0.13 * eyeDist, mouth: L.mouth, mouthW: mw,
    jaw: { cx: mx + dx * mid, cy: my + dy * mid, rx: 0.95 * mw, ry: (bottom - top) / 2 },
    maxOpen: 0.3 * mw, down: [dx, dy], pivot: [mx + dx * (chinD + 0.5 * eyeDist), my + dy * (chinD + 0.5 * eyeDist)]
  };
}

export function defaultLandmarks(IW, IH) {
  const s = Math.min(IW, IH * 0.8), mx = IW / 2, ey = IH * 0.42;
  return { eyeL: [mx - 0.17 * s, ey], eyeR: [mx + 0.17 * s, ey], mouth: [mx, ey + 0.36 * s], mouthW: 0.3 * s, source: 'guess' };
}

const loadImage = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

async function detectFaceAPI(im) {
  if (!('FaceDetector' in window)) return null;
  const faces = await new window.FaceDetector({ fastMode: false, maxDetectedFaces: 1 }).detect(im);
  if (!faces.length) return null;
  const f = faces[0], bb = f.boundingBox, marks = f.landmarks || [];
  const pts = (t) => marks.filter((m) => m.type === t).flatMap((m) => m.locations.map((q) => [q.x, q.y]));
  const eyes = pts('eye').sort((u, v) => u[0] - v[0]);
  const mouthPts = pts('mouth');
  const eyeL = eyes.length >= 2 ? eyes[0] : [bb.x + bb.width * 0.32, bb.y + bb.height * 0.4];
  const eyeR = eyes.length >= 2 ? eyes.at(-1) : [bb.x + bb.width * 0.68, bb.y + bb.height * 0.4];
  const mouth = mouthPts.length ? mouthPts.reduce((s, q) => [s[0] + q[0] / mouthPts.length, s[1] + q[1] / mouthPts.length], [0, 0]) : [bb.x + bb.width / 2, bb.y + bb.height * 0.76];
  return { eyeL, eyeR, mouth, mouthW: bb.width * 0.38, chin: [bb.x + bb.width / 2, bb.y + bb.height], source: 'facedetector' };
}

// Last resort: the largest patch of skin tones.
function detectSkin(im) {
  const IW = im.naturalWidth, IH = im.naturalHeight;
  const w = 160, h = Math.max(1, Math.round(IH * (160 / IW)));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const cols = new Array(w).fill(0), rows = new Array(h).fill(0);
  let n = 0;
  for (let y = 0; y < h * 0.85; y++) for (let x = Math.floor(w * 0.1); x < w * 0.9; x++) {
    const i = (y * w + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
    const cb = 128 - 0.168736 * R - 0.331264 * G + 0.5 * B, cr = 128 + 0.5 * R - 0.418688 * G - 0.081312 * B;
    if (cb > 77 && cb < 127 && cr > 133 && cr < 173 && R > 60) { cols[x]++; rows[y]++; n++; }
  }
  if (n < w * h * 0.03) return defaultLandmarks(IW, IH);
  const cmax = Math.max(...cols), rmax = Math.max(...rows);
  const xs = cols.map((v, i) => (v > cmax * 0.35 ? i : -1)).filter((i) => i >= 0);
  const ys = rows.map((v, i) => (v > rmax * 0.25 ? i : -1)).filter((i) => i >= 0);
  if (!xs.length || !ys.length) return defaultLandmarks(IW, IH);
  const k = IW / w;
  const x0 = xs[0] * k, x1 = xs.at(-1) * k, fw = Math.max(20, x1 - x0);
  const y0 = ys[0] * k, fh = Math.min(fw * 1.3, IH - y0);
  const cx = (x0 + x1) / 2;
  return { eyeL: [cx - fw * 0.2, y0 + fh * 0.42], eyeR: [cx + fw * 0.2, y0 + fh * 0.42], mouth: [cx, y0 + fh * 0.78], mouthW: fw * 0.36, chin: [cx, y0 + fh * 0.98], source: 'skin' };
}

export async function findFace(im) {
  try {
    const r = await withTimeout(detectFaceAPI(im), 4000);
    if (r) return r;
  } catch {}
  return detectSkin(im);
}

// Shrink a chosen photo to at most 1100 px and return a JPEG data URL.
export async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  const raw = await loadImage(url);
  const k = Math.min(1, 1100 / Math.max(raw.naturalWidth, raw.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(raw.naturalWidth * k);
  c.height = Math.round(raw.naturalHeight * k);
  c.getContext('2d').drawImage(raw, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/jpeg', 0.88);
}

// A drawn stand-in face, used until a photo is chosen. Returns { image, landmarks }.
export function placeholderFace() {
  const W = 400, H = 480;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2b3350'); bg.addColorStop(1, '#141826');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = '#3a2a22'; g.beginPath(); g.ellipse(200, 200, 132, 150, 0, 0, Math.PI * 2); g.fill(); // hair
  g.fillStyle = '#d9a689'; g.beginPath(); g.ellipse(200, 236, 112, 136, 0, 0, Math.PI * 2); g.fill(); // face
  g.fillRect(170, 340, 60, 80); // neck
  g.fillStyle = '#4b6cb7'; g.beginPath(); g.ellipse(200, 470, 170, 80, 0, Math.PI, 0); g.fill(); // shoulders
  for (const x of [158, 242]) {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, 214, 18, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3b2b1f'; g.beginPath(); g.arc(x, 214, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2a22'; g.lineWidth = 5; g.beginPath(); g.moveTo(x - 22, 190); g.quadraticCurveTo(x, 182, x + 22, 190); g.stroke();
  }
  g.strokeStyle = '#b07a62'; g.lineWidth = 4; g.beginPath(); g.moveTo(200, 230); g.lineTo(194, 268); g.lineTo(206, 270); g.stroke();
  g.strokeStyle = '#a24c4c'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(172, 306); g.quadraticCurveTo(200, 316, 228, 306); g.stroke();
  return { image: c.toDataURL('image/png'), landmarks: { eyeL: [158, 214], eyeR: [242, 214], mouth: [200, 308], mouthW: 60, chin: [200, 368], source: 'placeholder' } };
}

export class Puppet {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = null;
    this.model = null;
    this.landmarks = null;
    this.mouth = 0;
    this.hearing = false;
    this.speaking = false;
    this.talkAmp = 0;
    this.blinkAt = 0;
    this.blinkStart = -1;
    this.skin = ['#c99a7f', '#c99a7f'];
    this.running = true;
    const loop = (t) => {
      if (!this.running) return;
      this.frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
  }

  async setPhoto(src, landmarks = null) {
    this.img = await loadImage(src);
    this.landmarks = landmarks ?? (await findFace(this.img));
    this.model = faceModel(this.landmarks);
    this.buildJaw();
    const ry = this.model.eyeRY;
    this.skin = this.model.eyes.map((e) => this.sampleColour(e[0] + this.model.down[0] * ry * 2.6, e[1] + this.model.down[1] * ry * 2.6, Math.max(2, ry * 0.6)));
    return this.landmarks;
  }

  sampleColour(x, y, r) {
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(this.img, x - r, y - r, 2 * r, 2 * r, 0, 0, 1, 1);
    const [R, G, B] = g.getImageData(0, 0, 1, 1).data;
    return `rgb(${R},${G},${B})`;
  }

  // The lower lip and chin as a soft-edged sprite that drops like a jaw.
  buildJaw() {
    const m = this.model, j = m.jaw, ml = m.mouth, dn = m.down;
    const ext = Math.max(j.rx, j.ry) * 1.05;
    const x0 = Math.floor(j.cx - ext), y0 = Math.floor(j.cy - ext), size = Math.ceil(ext * 2);
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.drawImage(this.img, -x0, -y0);
    g.globalCompositeOperation = 'destination-in';
    g.save();
    g.translate(j.cx - x0, j.cy - y0); g.rotate(m.roll); g.scale(j.rx, j.ry);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.62, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
    g.restore();
    g.save();
    const lx = ml[0] - x0, ly = ml[1] - y0;
    const lg = g.createLinearGradient(lx, ly, lx + dn[0] * 3, ly + dn[1] * 3);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = lg; g.fillRect(0, 0, size, size);
    g.restore();
    this.jaw = { canvas: c, x0, y0 };
  }

  frame(now) {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0b10';
    ctx.fillRect(0, 0, W, H);
    const m = this.model;
    if (!this.img || !m) return;
    // fit the face: centred, about 60% of the height
    const fx = (m.eyes[0][0] + m.eyes[1][0] + m.mouth[0]) / 3;
    const fy = (m.eyes[0][1] + m.eyes[1][1] + m.mouth[1]) / 3;
    const IW = this.img.naturalWidth, IH = this.img.naturalHeight;
    const cover = Math.max(W / IW, H / IH);
    let s = (H * 0.62) / (m.eyeDist * 2.6);
    s = Math.max(cover * 0.7, Math.min(s, cover * 3));
    const ox = W / 2 - fx * s, oy = H * 0.48 - fy * s;

    const t = now / 1000;
    this.talkAmp += ((this.speaking ? 1 : 0) - this.talkAmp) * 0.05;
    const open = Math.max(0, Math.min(1, this.mouth));
    const sway = 0.012 * Math.sin(t * 0.6) + 0.007 * Math.sin(t * 1.37) + this.talkAmp * 0.012 * Math.sin(t * 6.3) + (this.hearing ? 0.03 : 0);
    const bob = 1.5 * Math.sin(t * 0.9) + this.talkAmp * open * m.maxOpen * 0.12;
    const breathe = 1 + 0.004 * Math.sin(t * 1.7);
    const [px, py] = m.pivot;
    ctx.translate(ox + px * s, oy + py * s + bob);
    ctx.rotate(sway);
    ctx.scale(s * breathe, s * breathe);
    ctx.translate(-px, -py);
    ctx.drawImage(this.img, 0, 0);

    const d = open * m.maxOpen;
    if (d > 0.4) {
      const [mx, my] = m.mouth, [dx, dy] = m.down, rx = m.mouthW * 0.43;
      ctx.save();
      ctx.translate(mx + dx * d * 0.5, my + dy * d * 0.5);
      ctx.rotate(m.roll);
      const ry = d * 0.56 + 0.5;
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
      cg.addColorStop(0, '#12040a'); cg.addColorStop(1, '#3a1416');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      if (d > 2) {
        ctx.fillStyle = 'rgba(236,230,220,.82)';
        ctx.beginPath(); ctx.ellipse(0, -ry + Math.min(d * 0.14, m.mouthW * 0.05), rx * 0.72, Math.min(d * 0.16, m.mouthW * 0.06), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(160,60,70,.75)';
        ctx.beginPath(); ctx.ellipse(0, ry * 0.55, rx * 0.5, ry * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.drawImage(this.jaw.canvas, this.jaw.x0 + dx * d, this.jaw.y0 + dy * d);
    }

    if (now > this.blinkAt) {
      this.blinkStart = now;
      this.blinkAt = now + 2200 + Math.random() * 4200;
    }
    const bt = (now - this.blinkStart) / 150;
    const b = bt >= 0 && bt <= 2 ? (bt < 1 ? bt : 2 - bt) : 0;
    if (b > 0.02) m.eyes.forEach((e, i) => this.eyelid(e, b, this.skin[i]));
  }

  eyelid([ex, ey], b, colour) {
    const { ctx, model: m } = this;
    const rx = m.eyeRX, ry = m.eyeRY;
    ctx.save();
    ctx.translate(ex, ey); ctx.rotate(m.roll);
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 1.12, ry * 1.35, 0, 0, Math.PI * 2); ctx.clip();
    ctx.shadowColor = colour; ctx.shadowBlur = ry * 0.8;
    ctx.fillStyle = colour;
    const h = ry * 2.7 * b;
    ctx.fillRect(-rx * 1.3, -ry * 1.35, rx * 2.6, h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(40,25,20,.55)'; ctx.lineWidth = Math.max(1, ry * 0.18);
    ctx.beginPath(); ctx.ellipse(0, -ry * 1.35 + h - ry * 0.1, rx * 0.95, ry * 0.25, 0, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.restore();
  }
}
