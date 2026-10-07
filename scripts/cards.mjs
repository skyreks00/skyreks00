// Génère les cartes alimentées par l'API GitHub : activité, langages et projets.
// Usage : GITHUB_TOKEN=... node scripts/cards.mjs [dossier de sortie, par défaut dist]
// Sans jeton, les données publiques sont lues via l'API REST et la page des contributions.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { excludedLanguages, login as defaultLogin, projects } from './config.mjs';
import { THEMES, card, esc, font, formatNumber, glyph, measure, readable, wrap } from './lib/svg.mjs';

const login = process.env.PROFILE_USER || defaultLogin;
const token = process.env.GITHUB_TOKEN;
const outDir = process.argv[2] ?? 'dist';

// Couleurs de linguist, utilisées seulement quand l'API REST ne les fournit pas.
const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#663399',
  SCSS: '#c6538c',
  Python: '#3572A5',
  C: '#555555',
  'C++': '#f34b7d',
  Shell: '#89e051',
  PHP: '#4F5D95',
  Java: '#b07219',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Batchfile: '#C1F12E',
  Makefile: '#427819',
};

async function request(url, options = {}) {
  const headers = { 'User-Agent': `${login}-profile`, Accept: 'application/vnd.github+json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} sur ${url}`);
  return res;
}

async function graphql(query, variables) {
  const res = await request('https://api.github.com/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) });
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join(' ; '));
  return data;
}

const QUERY = `query($login: String!) {
  user(login: $login) {
    createdAt
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) {
      nodes {
        name
        stargazerCount
        forkCount
        homepageUrl
        primaryLanguage { name color }
        languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } }
      }
    }
    contributionsCollection {
      totalCommitContributions
      contributionCalendar { totalContributions weeks { contributionDays { contributionCount } } }
    }
  }
}`;

async function fromGraphQL() {
  const data = await graphql(QUERY, { login });
  const { createdAt, repositories, contributionsCollection: cc } = data.user;
  const days = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount));
  return {
    repos: repositories.nodes.map((r) => ({
      name: r.name,
      stars: r.stargazerCount,
      forks: r.forkCount,
      homepage: r.homepageUrl || null,
      language: r.primaryLanguage,
      languages: r.languages.edges.map((e) => ({ name: e.node.name, color: e.node.color, size: e.size })),
    })),
    contributions: summarize(cc.contributionCalendar.totalContributions, days),
    yearCommits: cc.totalCommitContributions,
    createdAt,
  };
}

// Total des commits depuis la création du compte, une plage d'un an par requête (limite de l'API).
async function commitsSince(createdAt) {
  const now = new Date();
  const fields = [];
  for (let year = new Date(createdAt).getUTCFullYear(); year <= now.getUTCFullYear(); year++) {
    const to = year === now.getUTCFullYear() ? now.toISOString() : `${year}-12-31T23:59:59Z`;
    fields.push(`y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${to}") { totalCommitContributions }`);
  }
  const data = await graphql(`query($login: String!) { user(login: $login) { ${fields.join(' ')} } }`, { login });
  return Object.values(data.user).reduce((sum, c) => sum + c.totalCommitContributions, 0);
}

async function fromRest() {
  const list = await (await request(`https://api.github.com/users/${login}/repos?type=owner&per_page=100`)).json();
  const repos = [];
  for (const r of list.filter((repo) => !repo.fork && !repo.private)) {
    const sizes = await (await request(r.languages_url)).json();
    const languages = Object.entries(sizes).map(([name, size]) => ({ name, size, color: LANGUAGE_COLORS[name] ?? null }));
    repos.push({
      name: r.name,
      stars: r.stargazers_count,
      forks: r.forks_count,
      homepage: r.homepage || null,
      language: r.language ? { name: r.language, color: LANGUAGE_COLORS[r.language] ?? null } : null,
      languages,
    });
  }

  // La page publique du graphe de contributions : une cellule par jour, le nombre est dans l'infobulle.
  const html = await (await fetch(`https://github.com/users/${login}/contributions`)).text();
  const tips = new Map();
  for (const [, id, label] of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    tips.set(id, /^(\d[\d,]*) contribution/.test(label) ? Number(label.match(/^([\d,]+)/)[1].replace(/,/g, '')) : 0);
  }
  const days = [...html.matchAll(/<td[^>]*\bdata-date="[^"]+"[^>]*>/g)].map(([td]) => tips.get(td.match(/\bid="([^"]+)"/)?.[1]) ?? 0);
  if (!days.length) throw new Error('graphe de contributions introuvable');
  return { repos, contributions: summarize(days.reduce((a, b) => a + b, 0), days), yearCommits: null, createdAt: null };
}

function summarize(total, days) {
  return { total, best: Math.max(0, ...days), activeDays: days.filter((n) => n > 0).length };
}

async function totalCommits() {
  const res = await request(`https://api.github.com/search/commits?q=${encodeURIComponent(`author:${login}`)}&per_page=1`);
  return (await res.json()).total_count;
}

async function collect() {
  const errors = [];
  let data;
  if (token) {
    try {
      data = { source: 'graphql', ...(await fromGraphQL()) };
    } catch (error) {
      errors.push(`GraphQL : ${error.message}`);
    }
  }
  if (!data) data = { source: 'rest', ...(await fromRest()) };

  const counters = data.source === 'graphql' ? [() => commitsSince(data.createdAt), totalCommits] : [totalCommits];
  data.commits = null;
  for (const count of counters) {
    try {
      data.commits = await count();
      break;
    } catch (error) {
      errors.push(`Comptage des commits : ${error.message}`);
    }
  }
  data.commits ??= data.yearCommits;
  return { login, fetchedAt: new Date().toISOString(), ...data, errors };
}

// --- Cartes ---------------------------------------------------------------

const WIDTH = 480;
const HEIGHT = 200;

function activityCard(data, theme) {
  const stars = data.repos.reduce((sum, r) => sum + r.stars, 0);
  const contributions = data.contributions;
  const value = (n) => (n == null ? '—' : formatNumber(n));
  const rows = [
    ['commit', 'Commits publics', value(data.commits)],
    ['star', 'Étoiles reçues', value(stars)],
    ['repo', 'Dépôts publics', value(data.repos.length)],
    ['bolt', 'Record en un jour', value(contributions?.best)],
  ];
  const rowsSvg = rows
    .map(([icon, label, val], i) => {
      const y = 82 + i * 31;
      return `<g class="in" style="animation-delay:${(0.1 + i * 0.08).toFixed(2)}s">
${glyph(icon, 24, y - 13, 16, theme.accent[i % theme.accent.length])}
<text x="50" y="${y}" style="${font('text', 14)}" fill="${theme.muted}">${esc(label)}</text>
<text x="292" y="${y}" text-anchor="end" style="${font('display', 15)}" fill="${theme.text}">${esc(val)}</text>
</g>`;
    })
    .join('\n');

  const cx = 386;
  const cy = 120;
  const r = 54;
  const c = (2 * Math.PI * r).toFixed(1);
  const ring = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${theme.track}" stroke-width="9"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#ring)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="0" transform="rotate(-90 ${cx} ${cy})"><animate attributeName="stroke-dashoffset" from="${c}" to="0" dur="1.4s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"/></circle>
<g class="in" style="animation-delay:.35s">
<text x="${cx}" y="${cy + 2}" text-anchor="middle" style="${font('display', 30)}" fill="${theme.text}">${esc(value(contributions?.total))}</text>
<text x="${cx}" y="${cy + 24}" text-anchor="middle" style="${font('mono', 10.5)}" fill="${theme.muted}">contributions</text>
<text x="${cx}" y="${cy + 38}" text-anchor="middle" style="${font('mono', 10)}" fill="${theme.faint}">en 12 mois</text>
</g>`;

  return card({
    width: WIDTH,
    height: HEIGHT,
    theme,
    title: 'Activité',
    subtitle: 'mise à jour quotidienne',
    label: `Activité GitHub : ${value(contributions?.total)} contributions sur 12 mois, ${value(data.commits)} commits publics, ${value(stars)} étoiles`,
    fonts: ['text', 'mono'],
    defs: `<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">${theme.accent.map((s, i) => `<stop offset="${(i / 3).toFixed(2)}" stop-color="${s}"/>`).join('')}</linearGradient>`,
    body: rowsSvg + ring,
  });
}

function languageStats(data) {
  const totals = new Map();
  for (const repo of data.repos) {
    for (const { name, color, size } of repo.languages) {
      if (excludedLanguages.includes(name)) continue;
      const entry = totals.get(name) ?? { name, color: color ?? LANGUAGE_COLORS[name] ?? null, size: 0 };
      entry.size += size;
      totals.set(name, entry);
    }
  }
  const sorted = [...totals.values()].sort((a, b) => b.size - a.size);
  const sum = sorted.reduce((s, l) => s + l.size, 0) || 1;
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6).reduce((s, l) => s + l.size, 0);
  if (rest > 0) top[5] = { name: 'Autres', color: null, size: rest + top[5].size };
  return top.map((l) => ({ ...l, share: l.size / sum }));
}

function languagesCard(data, theme) {
  const langs = languageStats(data);
  const pct = (share) => `${new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 1 }).format(share * 100)} %`;

  // Une ligne par langage avec sa propre jauge ; deux colonnes au-delà de quatre langages.
  const columns = langs.length > 4 ? 2 : 1;
  const perColumn = Math.ceil(langs.length / columns);
  const spacing = perColumn <= 3 ? 40 : 30;
  const colW = (WIDTH - 48 - (columns - 1) * 24) / columns;
  const rows = langs
    .map((l, i) => {
      const x = 24 + Math.floor(i / perColumn) * (colW + 24);
      const y = 80 + (i % perColumn) * spacing;
      const color = readable(l.color ?? theme.faint, theme.bg);
      const w = Math.max(4, l.share * colW).toFixed(1);
      const delay = 0.2 + i * 0.08;
      const dur = delay + 1.1;
      return `<g class="in" style="animation-delay:${(0.15 + i * 0.08).toFixed(2)}s">
<circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${color}"/>
<text x="${x + 18}" y="${y}" style="${font('text', 14)}" fill="${theme.text}">${esc(l.name)}</text>
<text x="${x + colW}" y="${y}" text-anchor="end" style="${font('mono', 12.5)}" fill="${theme.muted}">${esc(pct(l.share))}</text>
<rect x="${x}" y="${y + 9}" width="${colW.toFixed(1)}" height="6" rx="3" fill="${theme.track}"/>
<rect x="${x}" y="${y + 9}" width="${w}" height="6" rx="3" fill="${color}"><animate attributeName="width" values="0;0;${w}" keyTimes="0;${(delay / dur).toFixed(3)};1" dur="${dur.toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0 0 1 1;.2 .8 .2 1"/></rect>
</g>`;
    })
    .join('\n');

  return card({
    width: WIDTH,
    height: HEIGHT,
    theme,
    title: 'Langages',
    subtitle: 'dépôts publics',
    label: `Langages : ${langs.map((l) => `${l.name} ${pct(l.share)}`).join(', ')}`,
    fonts: ['text', 'mono'],
    body: rows,
  });
}

function projectCard(project, data, theme) {
  const repo = data.repos.find((r) => r.name === project.repo);
  const languageName = project.language ?? repo?.language?.name;
  const languageColor =
    repo?.languages.find((l) => l.name === languageName)?.color ?? repo?.language?.color ?? LANGUAGE_COLORS[languageName] ?? theme.faint;

  const lines = wrap(project.description, 'text', 14, WIDTH - 48, 3);
  const description = lines
    .map((line, i) => `<text x="24" y="${74 + i * 20}" style="${font('text', 14)}" fill="${theme.muted}">${esc(line)}</text>`)
    .join('');

  let tx = 24;
  const tags = project.tags
    .map((tag) => {
      const w = measure(tag, 'mono', 11.5) + 18;
      const chip = `<rect x="${tx.toFixed(1)}" y="${140 - 15}" width="${w.toFixed(1)}" height="22" rx="11" fill="${theme.chip}" stroke="${theme.border}"/><text x="${(tx + w / 2).toFixed(1)}" y="140" text-anchor="middle" style="${font('mono', 11.5)}" fill="${theme.chipText}">${esc(tag)}</text>`;
      tx += w + 6;
      return chip;
    })
    .join('');

  const fy = 180;
  let fx = 24;
  let footer = '';
  if (languageName) {
    footer += `<circle cx="${fx + 5}" cy="${fy - 4.5}" r="5" fill="${languageColor}"/><text x="${fx + 16}" y="${fy}" style="${font('text', 13)}" fill="${theme.muted}">${esc(languageName)}</text>`;
    fx += 16 + measure(languageName, 'text', 13) + 18;
  }
  if (repo) {
    for (const [icon, count] of [['star', repo.stars], ['fork', repo.forks]]) {
      footer += `${glyph(icon, fx, fy - 12, 14, theme.muted)}<text x="${fx + 19}" y="${fy}" style="${font('text', 13)}" fill="${theme.muted}">${esc(formatNumber(count))}</text>`;
      fx += 19 + measure(formatNumber(count), 'text', 13) + 16;
    }
  }
  if (project.link) {
    const lw = measure(project.link.label, 'text', 13);
    footer += `${glyph('link', WIDTH - 24 - lw - 20, fy - 12, 14, theme.accent[0])}<text x="${WIDTH - 24}" y="${fy}" text-anchor="end" style="${font('text', 13)}" fill="${theme.accent[0]}">${esc(project.link.label)}</text>`;
  }

  return card({
    width: WIDTH,
    height: HEIGHT,
    theme,
    title: project.title,
    icon: 'repo',
    subtitle: `${login}/${project.repo}`,
    label: `${project.title} : ${project.description}`,
    fonts: ['text', 'mono'],
    body: `<g class="in" style="animation-delay:.1s">${description}</g><g class="in" style="animation-delay:.2s">${tags}</g><g class="in" style="animation-delay:.3s">${footer}</g>`,
  });
}

const data = await collect();
mkdirSync(outDir, { recursive: true });
for (const name of ['dark', 'light']) {
  const theme = THEMES[name];
  writeFileSync(join(outDir, `activity-${name}.svg`), activityCard(data, theme));
  writeFileSync(join(outDir, `languages-${name}.svg`), languagesCard(data, theme));
  for (const project of projects) writeFileSync(join(outDir, `project-${project.repo}-${name}.svg`), projectCard(project, data, theme));
}
writeFileSync(join(outDir, 'data.json'), `${JSON.stringify(data, null, 2)}\n`);
console.log(`Cartes écrites dans ${outDir} (source : ${data.source}${data.errors.length ? `, ${data.errors.length} avertissement(s)` : ''})`);
for (const error of data.errors) console.warn(`  ${error}`);
