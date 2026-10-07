import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
const METRICS = JSON.parse(readFileSync(join(FONTS_DIR, 'metrics.json'), 'utf8'));

// Polices embarquées en base64 : un SVG affiché via <img> ne peut pas charger de ressource externe.
export const FONTS = {
  display: { file: 'space-grotesk-700', family: 'Space Grotesk', weight: 700 },
  text: { file: 'space-grotesk-500', family: 'Space Grotesk', weight: 500 },
  mono: { file: 'jetbrains-mono-400', family: 'JetBrains Mono', weight: 400 },
  monoBold: { file: 'jetbrains-mono-600', family: 'JetBrains Mono', weight: 600 },
};

const STACKS = {
  'Space Grotesk': "'Space Grotesk', 'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif",
  'JetBrains Mono': "'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace",
};

export function fontFaces(keys) {
  return keys
    .map((key) => {
      const { file, family, weight } = FONTS[key];
      const data = readFileSync(join(FONTS_DIR, `${file}.woff`)).toString('base64');
      return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff;base64,${data}) format('woff')}`;
    })
    .join('');
}

export function font(key, size, extra = '') {
  const { family, weight } = FONTS[key];
  return `font-family:${STACKS[family]};font-weight:${weight};font-size:${size}px;${extra}`;
}

export function measure(text, key, size, letterSpacing = 0) {
  const m = METRICS[FONTS[key].file];
  let units = 0;
  for (const ch of text) units += m.widths[ch.codePointAt(0)] ?? m.unitsPerEm * 0.55;
  return (units / m.unitsPerEm) * size + letterSpacing * [...text].length;
}

export function wrap(text, key, size, maxWidth, maxLines = Infinity) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, key, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && measure(`${last}…`, key, size) > maxWidth) last = last.replace(/\s*\S+$/, '');
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatNumber(n) {
  // Espace insécable classique : l'espace fine (U+202F) n'est pas dans les polices embarquées.
  return new Intl.NumberFormat('fr-BE').format(n).replace(/ /g, ' ');
}

export const THEMES = {
  dark: {
    bg: '#0d1321',
    bgGlow: '#1b2650',
    border: '#212c44',
    text: '#e6edf3',
    muted: '#93a1b5',
    faint: '#5d6b83',
    track: '#1a2438',
    tile: '#141d31',
    chip: '#141d31',
    chipText: '#b9c5d8',
    accent: ['#38bdf8', '#818cf8', '#c084fc', '#f472b6'],
  },
  light: {
    bg: '#ffffff',
    bgGlow: '#eef2ff',
    border: '#d8dee6',
    text: '#1f2328',
    muted: '#57606a',
    faint: '#8c959f',
    track: '#eaeef3',
    tile: '#f3f5f9',
    chip: '#f3f5f9',
    chipText: '#424a53',
    accent: ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899'],
  },
};

export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Éclaircit (fond sombre) ou fonce (fond clair) une couleur jusqu'à un contraste minimal avec le fond.
export function readable(color, background, min = 3) {
  const target = luminance(background) < 0.5 ? 255 : 0;
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  let out = color;
  for (let t = 0; t <= 1 && contrast(out, background) < min; t += 0.05) {
    out = `#${rgb.map((c) => Math.round(c + (target - c) * t).toString(16).padStart(2, '0')).join('')}`;
  }
  return out;
}

export function accentGradient(id, theme, attrs = 'x1="0" y1="0" x2="1" y2="0"') {
  const stops = theme.accent
    .map((color, i) => `<stop offset="${(i / (theme.accent.length - 1)).toFixed(2)}" stop-color="${color}"/>`)
    .join('');
  return `<linearGradient id="${id}" ${attrs}>${stops}</linearGradient>`;
}

const BASE_CSS =
  '.in{animation:in .7s cubic-bezier(.2,.8,.2,1) both}' +
  '@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
  '@media (prefers-reduced-motion:reduce){*{animation:none!important}}';

// Cadre commun des cartes : fond, bordure, liseré dégradé et titre.
export function card({ width, height, theme, title, icon, subtitle, label, fonts = [], css = '', defs = '', body }) {
  const titleX = icon ? 50 : 24;
  const iconSvg = icon ? glyph(icon, 24, 25, 18, theme.accent[1]) : '';
  const subtitleSvg = subtitle
    ? `<text x="${width - 24}" y="38" text-anchor="end" style="${font('mono', 11.5)}" fill="${theme.faint}">${esc(subtitle)}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<defs>
${accentGradient('accent', theme)}
<radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 0) scale(${width * 0.7} ${height * 1.1})"><stop offset="0" stop-color="${theme.bgGlow}" stop-opacity=".9"/><stop offset="1" stop-color="${theme.bgGlow}" stop-opacity="0"/></radialGradient>
<clipPath id="frame"><rect width="${width}" height="${height}" rx="16"/></clipPath>
${defs}
</defs>
<style>${fontFaces(['display', ...fonts])}${BASE_CSS}${css}</style>
<g clip-path="url(#frame)">
<rect width="${width}" height="${height}" fill="${theme.bg}"/>
<rect width="${width}" height="${height}" fill="url(#glow)"/>
<rect width="${width}" height="3" fill="url(#accent)"/>
</g>
<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="15.5" fill="none" stroke="${theme.border}"/>
${iconSvg}
<text x="${titleX}" y="40" style="${font('display', 19)}" fill="${theme.text}">${esc(title)}</text>
${subtitleSvg}
${body}
</svg>
`;
}

// Petites icônes dessinées à la main (grille 16×16).
export const GLYPHS = {
  star: '<path d="M8 1.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 12l-4.2 2.2.8-4.7L1.2 6.2l4.7-.7z"/>',
  commit: '<circle cx="8" cy="8" r="3" fill="none" stroke-width="1.8"/><path d="M0 8h5M11 8h5" stroke-width="1.8"/>',
  repo: '<path d="M3 1.5h9.5v11H4.2A1.7 1.7 0 0 0 2.5 14.2V3A1.5 1.5 0 0 1 3 1.5z" fill="none" stroke-width="1.6" stroke-linejoin="round"/><path d="M2.5 14.2c0 .7.6 1.3 1.3 1.3h8.7" fill="none" stroke-width="1.6" stroke-linecap="round"/>',
  bolt: '<path d="M9.5 1L3 9.2h4.3L6.5 15 13 6.8H8.7z"/>',
  fork: '<circle cx="4" cy="3" r="1.8" fill="none" stroke-width="1.5"/><circle cx="12" cy="3" r="1.8" fill="none" stroke-width="1.5"/><circle cx="8" cy="13" r="1.8" fill="none" stroke-width="1.5"/><path d="M4 4.8v1.4c0 1.2 1 2 2.2 2h3.6c1.2 0 2.2-.8 2.2-2V4.8M8 8.2v3" fill="none" stroke-width="1.5"/>',
  link: '<path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10M9 2h5v5M14 2L7.5 8.5" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function glyph(name, x, y, size, color) {
  const scale = size / 16;
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}" stroke="${color}" stroke-width="0">${GLYPHS[name]}</g>`;
}
