// Génère les visuels qui ne dépendent pas des données GitHub : bannière, pied de page et stack.
// Usage : node scripts/static.mjs [dossier de sortie, par défaut assets]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { banner, iconLabels, stack } from './config.mjs';
import { THEMES, accentGradient, card, esc, font, fontFaces, luminance } from './lib/svg.mjs';

const ICONS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'icons.json'), 'utf8'));

// Générateur pseudo-aléatoire déterministe : les étoiles restent à la même place d'un build à l'autre.
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;

function starField(rand, count, width, height, avoid = () => false) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = rand() * width;
    const y = rand() * height;
    if (avoid(x, y)) continue;
    const r = 0.5 + rand() ** 3 * 1.4;
    const dur = 2.5 + rand() * 4;
    const delay = -rand() * dur;
    out += `<circle class="tw" cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" style="animation-duration:${dur.toFixed(1)}s;animation-delay:${delay.toFixed(1)}s"/>`;
  }
  return out;
}

const SPARKLE = 'M0-7L1.3-1.3 7 0 1.3 1.3 0 7-1.3 1.3-7 0-1.3-1.3z';

function sparkles(points) {
  return points
    .map(
      ([x, y, s, delay]) =>
        `<g transform="translate(${x} ${y}) scale(${s})"><path class="sp" d="${SPARKLE}" style="animation-delay:${delay}s"/></g>`,
    )
    .join('');
}

// Animation « machine à écrire » en SMIL, sans JavaScript.
function typing({ phrases, cx, y, size, color, cursorColor }) {
  const cw = size * 0.6; // JetBrains Mono : chasse fixe de 600/1000
  const TYPE = 0.075;
  const HOLD = 2.4;
  const ERASE = 0.03;
  const GAP = 0.45;

  const segments = [];
  let t = 0;
  for (const text of phrases) {
    const n = [...text].length;
    segments.push({ text, n, start: t, x: cx - (n * cw) / 2 });
    t += n * TYPE + HOLD + n * ERASE + GAP;
  }
  const total = t;

  const anim = (events, attr) => {
    const times = [];
    const values = [];
    for (const [time, value] of events) {
      const k = Number((time / total).toFixed(5));
      if (times.length && k <= times[times.length - 1]) {
        values[values.length - 1] = value;
        continue;
      }
      times.push(k);
      values.push(r1(value));
    }
    return `<animate attributeName="${attr}" dur="${total.toFixed(2)}s" repeatCount="indefinite" calcMode="discrete" keyTimes="${times.join(';')}" values="${values.join(';')}"/>`;
  };

  const steps = (seg) => {
    const ev = [];
    for (let k = 1; k <= seg.n; k++) ev.push([seg.start + k * TYPE, k]);
    const erase = seg.start + seg.n * TYPE + HOLD;
    for (let j = 1; j <= seg.n; j++) ev.push([erase + j * ERASE, seg.n - j]);
    return ev;
  };

  let defs = '';
  let texts = '';
  const cursorEvents = [[0, segments[0].x]];
  segments.forEach((seg, i) => {
    const ev = steps(seg);
    const widthEvents = [[0, 0], ...ev.map(([time, k]) => [time, k * cw])];
    const baseWidth = i === 0 ? r1(seg.n * cw) : 0; // affiché tel quel si SMIL n'est pas supporté
    defs += `<clipPath id="tc${i}"><rect x="${r1(seg.x)}" y="${y - size}" height="${size * 1.5}" width="${baseWidth}">${anim(widthEvents, 'width')}</rect></clipPath>`;
    texts += `<text x="${r1(seg.x)}" y="${y}" clip-path="url(#tc${i})" style="${font('mono', size)}" fill="${color}">${esc(seg.text)}</text>`;
    cursorEvents.push([seg.start, seg.x], ...ev.map(([time, k]) => [time, seg.x + k * cw + 2]));
  });

  const cursor = `<rect x="${r1(segments[0].x + segments[0].n * cw + 2)}" y="${y - size * 0.82}" width="3" height="${r1(size * 1.05)}" rx="1" fill="${cursorColor}">${anim(cursorEvents, 'x')}<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.5;.5;1" dur="1.05s" repeatCount="indefinite" calcMode="discrete"/></rect>`;
  return { defs, body: texts + cursor };
}

const SKY_CSS =
  '.tw{fill:#fff;animation:tw ease-in-out infinite}' +
  '@keyframes tw{0%,100%{opacity:.25}50%{opacity:1}}' +
  '.sp{fill:#fff;animation:sp 4s ease-in-out infinite}' +
  '@keyframes sp{0%,100%{opacity:.2;transform:scale(.55)}50%{opacity:1;transform:scale(1)}}' +
  '.d1{animation:d1 16s ease-in-out infinite}.d2{animation:d2 19s ease-in-out infinite}.d3{animation:d3 23s ease-in-out infinite}' +
  '@keyframes d1{50%{transform:translate(140px,18px)}}' +
  '@keyframes d2{50%{transform:translate(-160px,-12px)}}' +
  '@keyframes d3{50%{transform:translate(90px,-22px)}}' +
  '.shoot{animation:shoot 9s ease-in infinite}' +
  '@keyframes shoot{0%,78%{transform:translate(0,0);opacity:0}80%{opacity:1}92%,100%{transform:translate(-520px,260px);opacity:0}}' +
  '.line{stroke-dasharray:400;animation:draw 3s ease-out both}' +
  '@keyframes draw{from{stroke-dashoffset:400}to{stroke-dashoffset:0}}' +
  '@media (prefers-reduced-motion:reduce){*{animation:none!important}}';

function skyDefs(width, height) {
  const blob = (id, color) =>
    `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset=".45" stop-color="${color}" stop-opacity=".18"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
  return `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050814"/><stop offset=".6" stop-color="#0a1130"/><stop offset="1" stop-color="#170f35"/></linearGradient>
${blob('b1', '#38bdf8')}${blob('b2', '#8b5cf6')}${blob('b3', '#ec4899')}
<linearGradient id="trail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="frame"><rect width="${width}" height="${height}" rx="18"/></clipPath>`;
}

function constellation(points, edges) {
  const lines = edges
    .map(([a, b], i) => {
      const [x1, y1] = points[a];
      const [x2, y2] = points[b];
      return `<line class="line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="animation-delay:${(0.4 + i * 0.25).toFixed(2)}s"/>`;
    })
    .join('');
  const dots = points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#e0e7ff"/>`).join('');
  return `<g stroke="#a5b4fc" stroke-opacity=".35" stroke-width="1">${lines}</g>${dots}`;
}

function bannerSvg() {
  const W = 1280;
  const H = 340;
  const cx = W / 2;
  const rand = random(42);
  const nearName = (x, y) => Math.abs(x - cx) < 330 && y > 80 && y < 250;
  const type = typing({ phrases: banner.phrases, cx, y: 236, size: 26, color: '#cbd5e1', cursorColor: '#38bdf8' });

  // Courbe d'une planète en bas de la bannière.
  const planet = { cy: 1745, r: 1460 };
  const nameGrad = `<linearGradient id="name" gradientUnits="userSpaceOnUse" x1="${cx - 320}" y1="0" x2="${cx + 320}" y2="0" spreadMethod="reflect">
<stop offset="0" stop-color="#7dd3fc"/><stop offset=".35" stop-color="#a5b4fc"/><stop offset=".7" stop-color="#e9d5ff"/><stop offset="1" stop-color="#f9a8d4"/>
<animateTransform attributeName="gradientTransform" type="translate" values="0 0;640 0;0 0" dur="12s" repeatCount="indefinite"/></linearGradient>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${banner.name} : ${banner.phrases[0]}`)}">
<title>${esc(banner.name)}</title>
<defs>
${skyDefs(W, H)}
${nameGrad}
${accentGradient('rim', THEMES.dark)}
<radialGradient id="atmo" cx="${cx}" cy="${H}" r="560" gradientUnits="userSpaceOnUse" gradientTransform="translate(${cx} ${H}) scale(1 .32) translate(${-cx} ${-H})"><stop offset="0" stop-color="#6366f1" stop-opacity=".45"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/></radialGradient>
<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1026"/><stop offset=".25" stop-color="#05070f"/></linearGradient>
<filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
${type.defs}
</defs>
<style>${fontFaces(['display', 'mono'])}${SKY_CSS}</style>
<g clip-path="url(#frame)">
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<ellipse class="d1" cx="260" cy="120" rx="420" ry="190" fill="url(#b1)"/>
<ellipse class="d2" cx="1040" cy="90" rx="460" ry="200" fill="url(#b2)"/>
<ellipse class="d3" cx="700" cy="260" rx="380" ry="150" fill="url(#b3)" opacity=".7"/>
<g>${starField(rand, 150, W, 300, nearName)}</g>
${sparkles([[132, 64, 0.9, 0], [1164, 112, 1.1, 1.3], [962, 46, 0.7, 2.1], [338, 252, 0.6, 0.8], [1222, 238, 0.8, 2.7], [56, 196, 0.7, 3.2]])}
${constellation([[70, 92], [128, 118], [176, 104], [214, 140], [268, 132], [292, 92], [242, 78]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 2]])}
${constellation([[1010, 168], [1058, 150], [1104, 176], [1150, 158], [1196, 186]], [[0, 1], [1, 2], [2, 3], [3, 4]])}
<g class="shoot"><line x1="1120" y1="40" x2="1230" y2="-15" stroke="url(#trail)" stroke-width="2" stroke-linecap="round"/></g>
<rect y="${H - 200}" width="${W}" height="200" fill="url(#atmo)"/>
<circle cx="${cx}" cy="${planet.cy}" r="${planet.r}" fill="url(#ground)"/>
<circle cx="${cx}" cy="${planet.cy}" r="${planet.r}" fill="none" stroke="url(#rim)" stroke-width="12" stroke-opacity=".08"/>
<circle cx="${cx}" cy="${planet.cy}" r="${planet.r}" fill="none" stroke="url(#rim)" stroke-width="5" stroke-opacity=".3"/>
<circle cx="${cx}" cy="${planet.cy}" r="${planet.r}" fill="none" stroke="url(#rim)" stroke-width="1.6"/>
<text x="${cx}" y="168" text-anchor="middle" style="${font('display', 124, 'letter-spacing:-3px')}" fill="#38bdf8" opacity=".35" filter="url(#soft)">${esc(banner.name)}</text>
<text x="${cx}" y="168" text-anchor="middle" style="${font('display', 124, 'letter-spacing:-3px')}" fill="url(#name)">${esc(banner.name)}</text>
${type.body}
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="17.5" fill="none" stroke="#ffffff" stroke-opacity=".08"/>
</svg>
`;
}

function footerSvg() {
  const W = 1280;
  const H = 120;
  const rand = random(7);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Merci de ta visite">
<title>Merci de ta visite</title>
<defs>${skyDefs(W, H)}</defs>
<style>${fontFaces(['mono'])}${SKY_CSS}</style>
<g clip-path="url(#frame)">
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<ellipse class="d1" cx="300" cy="80" rx="380" ry="110" fill="url(#b1)"/>
<ellipse class="d2" cx="1000" cy="40" rx="420" ry="120" fill="url(#b2)"/>
<ellipse class="d3" cx="640" cy="120" rx="320" ry="80" fill="url(#b3)" opacity=".6"/>
<g>${starField(rand, 70, W, H, (x, y) => Math.abs(x - W / 2) < 190 && Math.abs(y - 62) < 22)}</g>
${sparkles([[420, 40, 0.7, 0.5], [880, 82, 0.8, 1.9]])}
<text x="${W / 2}" y="67" text-anchor="middle" style="${font('mono', 17, 'letter-spacing:1px')}" fill="#cbd5e1">merci de ta visite</text>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="17.5" fill="none" stroke="#ffffff" stroke-opacity=".08"/>
</svg>
`;
}

function stackSvg(themeName) {
  const theme = THEMES[themeName];
  const LABEL_W = 156;
  const STEP = 92;
  const TILE = 52;
  const ROW = 104;
  const TOP = 70;
  const maxIcons = Math.max(...stack.map((group) => group.icons.length));
  const width = 28 + LABEL_W + (maxIcons - 1) * STEP + TILE + 32;
  const height = TOP + stack.length * ROW + 6;

  let i = 0;
  const rows = stack
    .map((group, row) => {
      const y = TOP + row * ROW;
      const label = `<text x="28" y="${y + 32}" style="${font('monoBold', 12, 'letter-spacing:1.6px')}" fill="${theme.muted}">${esc(group.label.toUpperCase())}</text>`;
      const tiles = group.icons
        .map((key, col) => {
          const icon = ICONS[key];
          const x = 28 + LABEL_W + col * STEP;
          const dark = themeName === 'dark' && luminance(icon.hex) < 0.12;
          const name = iconLabels[key] ?? icon.title;
          const delay = (i++ * 0.035).toFixed(3);
          return `<g class="in" style="animation-delay:${delay}s">
<rect x="${x}" y="${y + 4}" width="${TILE}" height="${TILE}" rx="14" fill="${theme.tile}" stroke="${theme.border}"/>
<g transform="translate(${x + 13} ${y + 17}) scale(${26 / 24})"><path d="${icon.path}" fill="${dark ? theme.text : icon.hex}"/></g>
<text x="${x + TILE / 2}" y="${y + 80}" text-anchor="middle" style="${font('text', 11.5)}" fill="${theme.muted}">${esc(name)}</text>
</g>`;
        })
        .join('\n');
      const separator =
        row > 0 ? `<line x1="28" x2="${width - 28}" y1="${y - 10}" y2="${y - 10}" stroke="${theme.border}" stroke-dasharray="2 5"/>` : '';
      return separator + label + tiles;
    })
    .join('\n');

  return card({
    width,
    height,
    theme,
    title: 'Stack',
    subtitle: 'ce que j’utilise au quotidien',
    label: `Stack : ${stack.map((g) => `${g.label} (${g.icons.map((k) => iconLabels[k] ?? ICONS[k].title).join(', ')})`).join(' ; ')}`,
    fonts: ['text', 'mono', 'monoBold'],
    body: rows,
  });
}

const outDir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'banner.svg'), bannerSvg());
writeFileSync(join(outDir, 'footer.svg'), footerSvg());
for (const theme of ['dark', 'light']) writeFileSync(join(outDir, `stack-${theme}.svg`), stackSvg(theme));
console.log(`Visuels statiques écrits dans ${outDir}`);
